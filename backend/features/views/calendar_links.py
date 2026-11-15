"""Linked calendars: subscribed external calendars and the WG calendar as a subscription link."""
import secrets
from datetime import datetime, time, timedelta

import icalendar
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import URLValidator
from django.db.models import Exists, OuterRef, Q
from django.http import Http404, HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from backend.api_errors import api_error
from users.models import HouseholdMembership, User

from .. import calendar_sync
from ..models import CalendarEvent, CalendarFeedToken, ExternalCalendar, ExternalEvent, SharedCalendar
from .common import HasActiveHousehold

MAX_CALENDARS_PER_PERSON = 10


def _owner_name(user):
    return (user.first_name or user.email.split('@')[0]).strip()


def household_people(household):
    return User.objects.filter(memberships__household=household).order_by('first_name', 'email')


class PeopleField(serializers.ListField):
    """Ids of WG members; anyone outside the WG is refused."""
    child = serializers.UUIDField()

    def to_internal_value(self, data):
        ids = set(super().to_internal_value(data))
        household = self.context['request'].user.active_household
        people = list(household_people(household).filter(id__in=ids))
        if len(people) != len(ids):
            raise serializers.ValidationError('Nur Mitglieder dieser WG können gewählt werden.')
        return people

    def to_representation(self, value):
        return [str(person.pk) for person in (value.all() if hasattr(value, 'all') else value)]


class ExternalCalendarSerializer(serializers.ModelSerializer):
    lastSyncedAt = serializers.DateTimeField(source='last_synced_at', read_only=True)
    lastError = serializers.CharField(source='last_error', read_only=True)
    eventCount = serializers.IntegerField(source='event_count', read_only=True)
    ownerName = serializers.SerializerMethodField()
    isOwner = serializers.SerializerMethodField()
    # Own calendars follow the account into every WG; who else sees them is set per WG where it was linked.
    sharedHere = serializers.SerializerMethodField()
    householdName = serializers.SerializerMethodField()
    color = serializers.RegexField(r'^#[0-9a-fA-F]{6}$', required=False)
    url = serializers.CharField(max_length=2000, write_only=True, required=False, allow_blank=True)
    icsContent = serializers.CharField(write_only=True, required=False, trim_whitespace=False)
    fileName = serializers.CharField(source='file_name', max_length=200, required=False, allow_blank=True)
    sharedWith = PeopleField(source='shared_with', required=False)

    class Meta:
        model = ExternalCalendar
        fields = ['id', 'name', 'url', 'icsContent', 'fileName', 'source', 'color', 'visibility', 'enabled',
                  'sharedWith', 'lastSyncedAt', 'lastError', 'eventCount', 'ownerName', 'isOwner',
                  'sharedHere', 'householdName']
        read_only_fields = ['id', 'source']

    def get_ownerName(self, obj):
        return _owner_name(obj.owner)

    def get_isOwner(self, obj):
        return obj.owner_id == self.context['request'].user.id

    def get_sharedHere(self, obj):
        return obj.household_id == self.context['request'].user.active_household_id

    def get_householdName(self, obj):
        return obj.household.name

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Bitte einen Namen angeben.')
        return value

    def validate_url(self, value):
        if not value.strip():
            return ''
        url = calendar_sync.normalize_url(value)
        try:
            URLValidator(schemes=['http', 'https'])(url)
        except DjangoValidationError as error:
            raise serializers.ValidationError('Bitte den iCal-Link (https:// oder webcal://) einfügen.') from error
        return url

    def validate(self, attrs):
        content = attrs.pop('icsContent', None)
        if content is not None:
            attrs.update(source='file', ics_data=content, url='')
        elif attrs.get('url'):
            attrs.update(source='url', ics_data='', file_name='')
        elif not self.instance:
            raise serializers.ValidationError({'url': 'Bitte einen iCal-Link einfügen oder eine .ics-Datei wählen.'})
        elif 'url' in attrs:
            attrs.pop('url')  # an empty link never replaces the current source
        if self.instance and not self.get_sharedHere(self.instance) and {'visibility', 'shared_with'} & set(attrs):
            message = f'Die Freigabe gilt für die WG «{self.instance.household.name}» und wird dort geändert.'
            raise serializers.ValidationError({'visibility': message})
        owner = self.instance.owner if self.instance else self.context['request'].user
        if 'shared_with' in attrs:
            attrs['shared_with'] = [person for person in attrs['shared_with'] if person.pk != owner.pk]
        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data['isOwner']:
            # The link and the audience are the owner's business; others never see them.
            data['url'] = instance.url
        else:
            data.pop('sharedWith', None)
            data['fileName'] = ''
        return data


def visible_calendars(user):
    """Own calendars (in every WG) plus calendars others share with this WG as a whole or with this person."""
    through = ExternalCalendar.shared_with.through
    audience = through.objects.filter(externalcalendar_id=OuterRef('pk'))
    mine = through.objects.filter(user=user).values('externalcalendar_id')
    to_wg = Q(household=user.active_household, visibility__in=('busy', 'shared'))
    shared = to_wg & (Q(pk__in=mine) | ~Exists(audience))
    return ExternalCalendar.objects.filter(Q(owner=user) | shared) \
        .select_related('owner', 'household').prefetch_related('shared_with')


def check_source(data):
    """None when the link or file holds a readable calendar, else the error response."""
    try:
        if data.get('source') == 'file':
            calendar_sync.read_file(data['ics_data'])
        else:
            calendar_sync.load(data['url'])
    except calendar_sync.CalendarError as error:
        field = 'icsContent' if data.get('source') == 'file' else 'url'
        return api_error(str(error), details={field: str(error)})
    return None


class ExternalCalendarListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]

    def get(self, request):
        calendars = list(visible_calendars(request.user))
        context = {'request': request}
        return Response({'data': ExternalCalendarSerializer(calendars, many=True, context=context).data})

    def post(self, request):
        serializer = ExternalCalendarSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        if ExternalCalendar.objects.filter(owner=request.user).count() >= MAX_CALENDARS_PER_PERSON:
            return api_error(f'Höchstens {MAX_CALENDARS_PER_PERSON} Kalender pro Person.')
        # Check the link or file before saving it, so a mistake is noticed right away.
        error = check_source(serializer.validated_data)
        if error:
            return error
        calendar = serializer.save(owner=request.user, household=request.user.active_household)
        calendar_sync.sync(calendar)
        data = ExternalCalendarSerializer(calendar, context={'request': request}).data
        return Response({'data': data}, status=status.HTTP_201_CREATED)


class ExternalCalendarDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]

    def _own(self, request, id):
        calendar = ExternalCalendar.objects.filter(id=id, owner=request.user).first()
        if not calendar:
            raise Http404
        return calendar

    def patch(self, request, id):
        calendar = self._own(request, id)
        serializer = ExternalCalendarSerializer(calendar, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        source_changed = data.get('source') == 'file' or (data.get('url') and data['url'] != calendar.url)
        if source_changed:
            error = check_source(data)
            if error:
                return error
        calendar = serializer.save()
        if source_changed or ('enabled' in data and calendar.enabled):
            calendar_sync.sync(calendar)
        return Response({'data': ExternalCalendarSerializer(calendar, context={'request': request}).data})

    def delete(self, request, id):
        self._own(request, id).delete()
        return Response({'success': True})


class ExternalCalendarSyncView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]

    def post(self, request, id):
        calendar = ExternalCalendar.objects.filter(id=id, owner=request.user).first()
        if not calendar:
            raise Http404
        calendar_sync.sync(calendar)
        return Response({'data': ExternalCalendarSerializer(calendar, context={'request': request}).data})


class ExternalEventListView(APIView):
    """Occurrences from all visible linked calendars in a date range (read only)."""
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]

    def get(self, request):
        first = parse_date(request.query_params.get('start') or '')
        last = parse_date(request.query_params.get('end') or '')
        if not first or not last or last < first or (last - first).days > 62:
            return api_error('Bitte start und end (JJJJ-MM-TT, höchstens 62 Tage) angeben.')
        calendars = [c for c in visible_calendars(request.user) if c.enabled]
        refreshing = calendar_sync.refresh_in_background(calendar_sync.stale(calendars))
        by_id = {c.id: c for c in calendars}
        start = timezone.make_aware(datetime.combine(first, time.min))
        end = timezone.make_aware(datetime.combine(last + timedelta(days=1), time.min))
        events = ExternalEvent.objects.filter(calendar__in=calendars, start__lt=end).filter(
            Q(end__gt=start) | Q(end__isnull=True, start__gte=start)).order_by('start')
        data = []
        for event in events[:2000]:
            calendar = by_id[event.calendar_id]
            busy_only = calendar.owner_id != request.user.id and calendar.visibility == 'busy'
            if busy_only and not event.busy:
                continue
            data.append({
                'id': f'ext-{event.pk}', 'calendarId': str(calendar.id),
                'title': 'Belegt' if busy_only else (event.title or '(ohne Titel)'),
                'location': '' if busy_only else event.location,
                'description': '' if busy_only else event.description,
                'start': timezone.localtime(event.start).isoformat(),
                'end': timezone.localtime(event.end).isoformat() if event.end else None,
                'allDay': event.all_day, 'busy': event.busy, 'busyOnly': busy_only,
                'calendarName': calendar.name if calendar.owner_id == request.user.id
                else f'{_owner_name(calendar.owner)} · {calendar.name}',
                'calendarColor': calendar.color,
            })
        return Response({'data': data, 'refreshing': refreshing})


# ── WG calendar as subscription ─────────────────────────────────────────────
FEED_PAST = timedelta(days=90)
FEED_FUTURE = timedelta(days=400)


class CalendarFeedLinkView(APIView):
    """The personal secret link; POST makes a new one (the old link stops working)."""
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]

    def _respond(self, token):
        return Response({'data': {'path': f'/api/calendar/feed/{token.token}.ics', 'createdAt': token.created_at}})

    def get(self, request):
        token, _ = CalendarFeedToken.objects.get_or_create(
            user=request.user, household=request.user.active_household,
            defaults={'token': secrets.token_urlsafe(32)})
        return self._respond(token)

    def post(self, request):
        CalendarFeedToken.objects.filter(user=request.user, household=request.user.active_household).delete()
        token = CalendarFeedToken.objects.create(user=request.user, household=request.user.active_household,
                                                 token=secrets.token_urlsafe(32))
        return self._respond(token)


def build_feed(user, household):
    calendar = icalendar.Calendar()
    calendar.add('prodid', '-//WG Smarthome//Kalender//DE')
    calendar.add('version', '2.0')
    calendar.add('calscale', 'GREGORIAN')
    calendar.add('x-wr-calname', f'WG {household.name}')
    calendar.add('x-wr-timezone', timezone.get_current_timezone_name())
    calendar.add('refresh-interval', timedelta(minutes=30), parameters={'VALUE': 'DURATION'})
    calendar.add('x-published-ttl', 'PT30M')
    now = timezone.now()
    groups = SharedCalendar.objects.filter(household=household, members=user)
    events = CalendarEvent.objects.filter(household=household, start__gte=now - FEED_PAST,
                                          start__lte=now + FEED_FUTURE).filter(
        Q(calendar_type='household') | Q(calendar_type='private', created_by=user) |
        Q(calendar_type='group', shared_calendar__in=groups)).select_related('shared_calendar').order_by('start')
    for item in events:
        event = icalendar.Event()
        event.add('uid', f'{item.id}@wg-smarthome')
        event.add('dtstamp', item.updated_at)
        event.add('last-modified', item.updated_at)
        event.add('summary', item.title)
        if item.all_day:
            first = timezone.localtime(item.start).date()
            last = timezone.localtime(item.end).date() if item.end else first
            event.add('dtstart', first)
            event.add('dtend', max(first, last) + timedelta(days=1))
        else:
            event.add('dtstart', timezone.localtime(item.start))
            event.add('dtend', timezone.localtime(item.end) if item.end else
                      timezone.localtime(item.start) + timedelta(hours=1))
        if item.location:
            event.add('location', item.location)
        if item.description:
            event.add('description', item.description)
        event.add('categories', [item.shared_calendar.name if item.shared_calendar else
                                 'Privat' if item.calendar_type == 'private' else 'WG'])
        if item.calendar_type == 'private':
            event.add('class', 'PRIVATE')
        calendar.add_component(event)
    return calendar.to_ical()


class CalendarFeedView(APIView):
    """Public by its secret token: calendar apps cannot log in."""
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request, token):
        feed = CalendarFeedToken.objects.select_related('user', 'household').filter(token=token).first()
        if not feed or not HouseholdMembership.objects.filter(user=feed.user, household=feed.household).exists():
            raise Http404
        response = HttpResponse(build_feed(feed.user, feed.household), content_type='text/calendar; charset=utf-8')
        response['Content-Disposition'] = 'inline; filename="wg-kalender.ics"'
        response['Cache-Control'] = 'private, max-age=300'
        return response


# ── Shared calendars inside the app ─────────────────────────────────────────
class SharedCalendarSerializer(serializers.ModelSerializer):
    color = serializers.RegexField(r'^#[0-9a-fA-F]{6}$', required=False)
    memberIds = PeopleField(source='members', required=False)
    memberNames = serializers.SerializerMethodField()
    createdByName = serializers.SerializerMethodField()

    class Meta:
        model = SharedCalendar
        fields = ['id', 'name', 'color', 'memberIds', 'memberNames', 'createdByName']
        read_only_fields = ['id']

    def get_memberNames(self, obj):
        return [_owner_name(member) for member in obj.members.all()]

    def get_createdByName(self, obj):
        return _owner_name(obj.created_by) if obj.created_by else ''

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Bitte einen Namen angeben.')
        return value



def my_shared_calendars(user):
    return SharedCalendar.objects.filter(household=user.active_household, members=user) \
        .select_related('created_by').prefetch_related('members')


class SharedCalendarListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]

    def get(self, request):
        calendars = my_shared_calendars(request.user)
        return Response({'data': SharedCalendarSerializer(calendars, many=True, context={'request': request}).data})

    def post(self, request):
        serializer = SharedCalendarSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        members = {member.pk: member for member in serializer.validated_data.pop('members', [])}
        members[request.user.pk] = request.user  # whoever creates it is a member
        calendar = serializer.save(household=request.user.active_household, created_by=request.user)
        calendar.members.set(members.values())
        data = SharedCalendarSerializer(calendar, context={'request': request}).data
        return Response({'data': data}, status=status.HTTP_201_CREATED)


class SharedCalendarDetailView(APIView):
    """Every member may rename it, change the members or delete it (with its events)."""
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]

    def _mine(self, request, id):
        calendar = my_shared_calendars(request.user).filter(id=id).first()
        if not calendar:
            raise Http404
        return calendar

    def patch(self, request, id):
        calendar = self._mine(request, id)
        serializer = SharedCalendarSerializer(calendar, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        members = serializer.validated_data.pop('members', None)
        if members is not None and not members:
            return api_error('Ein gemeinsamer Kalender braucht mindestens eine Person.')
        calendar = serializer.save()
        if members is not None:
            calendar.members.set(members)
        calendar = SharedCalendar.objects.prefetch_related('members').get(pk=calendar.pk)
        return Response({'data': SharedCalendarSerializer(calendar, context={'request': request}).data})

    def delete(self, request, id):
        self._mine(request, id).delete()
        return Response({'success': True})


class CalendarPeopleView(APIView):
    """WG members to choose from when sharing a calendar."""
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]

    def get(self, request):
        people = household_people(request.user.active_household)
        me = request.user.pk
        return Response({'data': [{'id': str(person.pk), 'name': _owner_name(person), 'isMe': person.pk == me}
                                  for person in people]})
