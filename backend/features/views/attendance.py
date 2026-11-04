"""Who eats at home: members, meal attendance and external guests."""

from datetime import date

from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_date
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from backend.api_errors import api_error

from ..models import ExternalMealGuest, HouseholdMember, MemberAvailability, UserMealAttendance
from ..serializers import (
    ExternalMealGuestSerializer,
    HouseholdMemberSerializer,
    MemberAvailabilitySerializer,
    UserMealAttendanceSerializer,
)
from .common import _parse_bool, HasActiveHousehold


class HouseholdMemberListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = HouseholdMemberSerializer

    def get_queryset(self):
        return HouseholdMember.objects.filter(household=self.request.user.active_household).order_by('name')

    def perform_create(self, serializer):
        serializer.save(household=self.request.user.active_household)

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response({"data": serializer.data})

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        return Response({"data": response.data}, status=response.status_code)


class HouseholdMemberDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = HouseholdMemberSerializer
    lookup_field = 'id'

    def get_queryset(self):
        return HouseholdMember.objects.filter(household=self.request.user.active_household)

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return Response({"data": serializer.data})

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        return Response({"data": response.data}, status=response.status_code)

    def destroy(self, request, *args, **kwargs):
        super().destroy(request, *args, **kwargs)
        return Response({"success": True})


class MemberAvailabilityListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = MemberAvailabilitySerializer

    def get_queryset(self):
        queryset = MemberAvailability.objects.filter(
            member__household=self.request.user.active_household
        )
        member_id = self.request.query_params.get('memberId')
        start_raw = self.request.query_params.get('start')
        end_raw = self.request.query_params.get('end')
        if member_id:
            import uuid
            try:
                member_id = uuid.UUID(str(member_id))
            except ValueError:
                raise ValidationError({'memberId': 'Ungültige Mitglieds-ID.'})
            queryset = queryset.filter(member_id=member_id)
        if start_raw:
            queryset = queryset.filter(date__gte=parse_date(start_raw) or date.min)
        if end_raw:
            queryset = queryset.filter(date__lte=parse_date(end_raw) or date.max)
        return queryset.select_related('member').order_by('date', 'member__name')

    def perform_create(self, serializer):
        member_id = serializer.validated_data['member_id']
        member = HouseholdMember.objects.filter(
            id=member_id, household=self.request.user.active_household
        ).first()
        if not member:
            raise PermissionDenied('Dieses Mitglied gehört nicht zu deiner WG.')
        serializer.save()

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        return Response({"data": response.data}, status=response.status_code)

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response({"data": serializer.data})


class MemberAvailabilityDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = MemberAvailabilitySerializer
    lookup_field = 'id'

    def get_queryset(self):
        return MemberAvailability.objects.filter(
            member__household=self.request.user.active_household
        )

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return Response({"data": serializer.data})

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        return Response({"data": response.data}, status=response.status_code)

    def destroy(self, request, *args, **kwargs):
        super().destroy(request, *args, **kwargs)
        return Response({"success": True})


class UserMealAttendanceView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]

    def get(self, request):
        hh = request.user.active_household
        if not hh:
            return Response({'data': []})
        qs = UserMealAttendance.objects.filter(household=hh).select_related('user')
        start_raw = request.query_params.get('start')
        end_raw = request.query_params.get('end')
        if start_raw:
            qs = qs.filter(date__gte=parse_date(start_raw) or date.min)
        if end_raw:
            qs = qs.filter(date__lte=parse_date(end_raw) or date.max)
        return Response({'data': UserMealAttendanceSerializer(qs, many=True).data})

    def post(self, request):
        hh = request.user.active_household
        if not hh:
            return api_error('Keine aktive WG.', status.HTTP_400_BAD_REQUEST)
        date_str = request.data.get('date')
        if not date_str:
            return api_error('Datum fehlt.', status.HTTP_400_BAD_REQUEST)
        d = parse_date(date_str)
        if not d:
            return api_error('Ungültiges Datum (erwartet JJJJ-MM-TT).', status.HTTP_400_BAD_REQUEST)
        flags = {}
        for key in ('breakfastPresent', 'lunchPresent', 'dinnerPresent'):
            value = _parse_bool(request.data.get(key, False))
            if value is None:
                return api_error(f'{key} muss true oder false sein', status.HTTP_400_BAD_REQUEST)
            flags[key] = value
        breakfast, lunch, dinner = flags['breakfastPresent'], flags['lunchPresent'], flags['dinnerPresent']
        obj, _ = UserMealAttendance.objects.update_or_create(
            household=hh,
            user=request.user,
            date=d,
            defaults={'breakfast_present': breakfast, 'lunch_present': lunch, 'dinner_present': dinner},
        )
        return Response({'data': UserMealAttendanceSerializer(obj).data})

    def delete(self, request):
        hh = request.user.active_household
        if not hh:
            return api_error('Keine aktive WG.', status.HTTP_400_BAD_REQUEST)
        date_str = request.data.get('date')
        if not date_str:
            return api_error('Datum fehlt.', status.HTTP_400_BAD_REQUEST)
        d = parse_date(date_str)
        deleted, _ = UserMealAttendance.objects.filter(household=hh, user=request.user, date=d).delete()
        return Response({'success': True, 'deleted': deleted})


class ExternalMealGuestListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]

    def get(self, request):
        hh = request.user.active_household
        if not hh:
            return Response({'data': []})
        qs = ExternalMealGuest.objects.filter(household=hh)
        start_raw = request.query_params.get('start')
        end_raw = request.query_params.get('end')
        if start_raw:
            qs = qs.filter(date__gte=parse_date(start_raw) or date.min)
        if end_raw:
            qs = qs.filter(date__lte=parse_date(end_raw) or date.max)
        return Response({'data': ExternalMealGuestSerializer(qs.order_by('date', 'meal', 'created_at'), many=True).data})

    def post(self, request):
        hh = request.user.active_household
        if not hh:
            return api_error('Keine aktive WG.', status.HTTP_400_BAD_REQUEST)
        name = (request.data.get('name') or '').strip()
        date_str = request.data.get('date')
        meal = request.data.get('meal')
        if not name or not date_str or not meal:
            return api_error('Name, Datum und Mahlzeit sind erforderlich.', status.HTTP_400_BAD_REQUEST)
        d = parse_date(date_str)
        if not d:
            return api_error('Ungültiges Datum (erwartet JJJJ-MM-TT).', status.HTTP_400_BAD_REQUEST)
        if meal not in ('breakfast', 'lunch', 'dinner'):
            return api_error('Mahlzeit muss Frühstück, Mittag- oder Abendessen sein.', status.HTTP_400_BAD_REQUEST)
        guest = ExternalMealGuest.objects.create(
            household=hh, name=name, date=d, meal=meal,
            created_by=request.user,
        )
        return Response({'data': ExternalMealGuestSerializer(guest).data}, status=status.HTTP_201_CREATED)


class ExternalMealGuestDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]

    def delete(self, request, id):
        hh = request.user.active_household
        guest = get_object_or_404(ExternalMealGuest, id=id, household=hh)
        guest.delete()
        return Response({'success': True})
