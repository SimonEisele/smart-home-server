from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework.permissions import AllowAny
from rest_framework.exceptions import PermissionDenied
from django.shortcuts import get_object_or_404
from .models import User, DashboardItem, DashboardLayout, Household, HouseholdMembership
from .serializers import (
    UserCreateSerializer,
    CurrentUserSerializer,
    DashboardItemSerializer,
    HouseholdSerializer,
    HouseholdMembershipSerializer,
)
from .auth_serializers import EmailTokenObtainPairSerializer


# User
class UserCreateView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserCreateSerializer

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        user = User.objects.get(id=response.data['id'])
        hh = Household.objects.create(name="Meine WG", created_by=user)
        HouseholdMembership.objects.create(user=user, household=hh, role='owner')
        user.active_household = hh
        user.save(update_fields=['active_household'])
        return Response({"data": CurrentUserSerializer(user, context={'request': request}).data})


class CurrentUserView(generics.RetrieveAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CurrentUserSerializer

    def get_object(self):
        return self.request.user

    def retrieve(self, request, *args, **kwargs):
        user = self.get_object()
        serializer = self.get_serializer(user)
        return Response({"data": serializer.data})

    def patch(self, request, *args, **kwargs):
        user = self.get_object()
        for field in ('first_name', 'last_name', 'phone_number'):
            if field in request.data:
                setattr(user, field, (request.data[field] or '').strip())
        new_password = (request.data.get('new_password') or '').strip()
        if new_password:
            current_password = request.data.get('current_password', '')
            if not user.check_password(current_password):
                return Response({'error': 'Aktuelles Passwort ist falsch'}, status=400)
            if len(new_password) < 8:
                return Response({'error': 'Passwort muss mindestens 8 Zeichen lang sein'}, status=400)
            user.set_password(new_password)
        user.save()
        return Response({"data": CurrentUserSerializer(user, context={'request': request}).data})


class CheckEmailView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email")
        exists = User.objects.filter(email__iexact=email).exists()
        return Response({"data": {"exists": exists}})


class EmailTokenObtainPairView(TokenObtainPairView):
    permission_classes = [AllowAny]
    serializer_class = EmailTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.user
        tokens = serializer.validated_data

        return Response({
            "data": {
                "access_token": tokens.get("access"),
                "refresh_token": tokens.get("refresh"),
                "user": CurrentUserSerializer(user, context={'request': request}).data
            }
        })


# Households
class HouseholdListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = HouseholdSerializer

    def get_queryset(self):
        return Household.objects.filter(memberships__user=self.request.user).distinct()

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response({"data": serializer.data})

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        hh = serializer.save(created_by=request.user)
        HouseholdMembership.objects.create(user=request.user, household=hh, role='owner')
        if not request.user.active_household:
            request.user.active_household = hh
            request.user.save(update_fields=['active_household'])
        return Response({"data": self.get_serializer(hh).data}, status=201)


class HouseholdDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = HouseholdSerializer
    lookup_field = 'id'

    def get_queryset(self):
        return Household.objects.filter(memberships__user=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        return Response({"data": self.get_serializer(self.get_object()).data})

    def update(self, request, *args, **kwargs):
        obj = self.get_object()
        m = obj.memberships.filter(user=request.user).first()
        if not m or m.role not in ('owner', 'admin'):
            raise PermissionDenied("Nur Admins können die WG bearbeiten")
        kwargs['partial'] = True
        response = super().update(request, *args, **kwargs)
        return Response({"data": response.data})

    def destroy(self, request, *args, **kwargs):
        obj = self.get_object()
        m = obj.memberships.filter(user=request.user).first()
        if not m or m.role != 'owner':
            raise PermissionDenied("Nur Eigentümer können die WG löschen")
        super().destroy(request, *args, **kwargs)
        return Response({"success": True})


class SwitchHouseholdView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, id):
        hh = get_object_or_404(
            Household.objects.filter(memberships__user=request.user), id=id
        )
        request.user.active_household = hh
        request.user.save(update_fields=['active_household'])
        return Response({
            "data": CurrentUserSerializer(request.user, context={'request': request}).data
        })


class JoinHouseholdView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        invite_code = request.data.get('invite_code')
        if not invite_code:
            return Response({"error": "invite_code ist erforderlich"}, status=400)
        hh = get_object_or_404(Household, invite_code=invite_code)
        if hh.memberships.filter(user=request.user).exists():
            return Response({"error": "Du bist bereits Mitglied dieser WG"}, status=400)
        HouseholdMembership.objects.create(user=request.user, household=hh, role='member')
        if not request.user.active_household:
            request.user.active_household = hh
            request.user.save(update_fields=['active_household'])
        return Response({"data": HouseholdSerializer(hh, context={'request': request}).data})


class HouseholdMembersView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_household(self, request, id):
        return get_object_or_404(
            Household.objects.filter(memberships__user=request.user), id=id
        )

    def get(self, request, id):
        hh = self._get_household(request, id)
        memberships = hh.memberships.select_related('user').all()
        return Response({"data": HouseholdMembershipSerializer(memberships, many=True).data})

    def patch(self, request, id):
        hh = self._get_household(request, id)
        caller = hh.memberships.filter(user=request.user).first()
        if not caller or caller.role not in ('owner', 'admin'):
            raise PermissionDenied("Nur Admins können Rollen ändern")
        target_user_id = request.data.get('user_id')
        new_role = request.data.get('role')
        if new_role not in ('admin', 'member'):
            return Response({"error": "Ungültige Rolle"}, status=400)
        m = get_object_or_404(HouseholdMembership, household=hh, user_id=target_user_id)
        m.role = new_role
        m.save()
        return Response({"data": HouseholdMembershipSerializer(m).data})

    def delete(self, request, id):
        hh = self._get_household(request, id)
        caller = hh.memberships.filter(user=request.user).first()
        if not caller or caller.role not in ('owner', 'admin'):
            raise PermissionDenied("Nur Admins können Mitglieder entfernen")
        target_user_id = request.data.get('user_id')
        m = get_object_or_404(HouseholdMembership, household=hh, user_id=target_user_id)
        if m.role == 'owner':
            return Response({"error": "Eigentümer kann nicht entfernt werden"}, status=400)
        m.delete()
        return Response({"success": True})


class LeaveHouseholdView(APIView):
    """Allows a non-owner member to leave a household."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, id):
        hh = get_object_or_404(Household, memberships__user=request.user, id=id)
        membership = hh.memberships.filter(user=request.user).first()
        if not membership:
            return Response({'error': 'Du bist kein Mitglied dieser WG'}, status=400)
        if membership.role == 'owner':
            return Response(
                {'error': 'Als Eigentümer kannst du die WG nicht verlassen. Übertrage zuerst die Eigentümerschaft.'},
                status=400
            )
        membership.delete()
        # Switch to another household if available
        other_hh = Household.objects.filter(memberships__user=request.user).first()
        request.user.active_household = other_hh
        request.user.save(update_fields=['active_household'])
        return Response({'data': CurrentUserSerializer(request.user, context={'request': request}).data})


class HouseholdAccountView(APIView):
    """Create / delete shared WG login accounts (is_household_account=True)."""
    permission_classes = [permissions.IsAuthenticated]

    def _require_admin(self, request, id):
        hh = get_object_or_404(Household, memberships__user=request.user, id=id)
        caller = hh.memberships.filter(user=request.user).first()
        if not caller or caller.role not in ('owner', 'admin'):
            raise PermissionDenied("Nur Admins können WG-Konten verwalten")
        return hh

    def post(self, request, id):
        import re
        hh = self._require_admin(request, id)
        name = (request.data.get('name') or 'WG Konto').strip()
        password = (request.data.get('password') or '').strip()
        if not name or not password:
            return Response({'error': 'Name und Passwort sind erforderlich'}, status=400)
        if len(password) < 6:
            return Response({'error': 'Passwort muss mindestens 6 Zeichen lang sein'}, status=400)
        # Auto-generate a unique internal email
        slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')[:20] or 'konto'
        base = f"wg-{slug}-{str(hh.id)[:8]}@wg.local"
        email, counter = base, 0
        while User.objects.filter(email__iexact=email).exists():
            counter += 1
            email = f"wg-{slug}-{str(hh.id)[:8]}-{counter}@wg.local"
        user = User.objects.create_user(
            email=email, password=password,
            first_name=name, last_name='',
            is_household_account=True,
        )
        HouseholdMembership.objects.create(user=user, household=hh, role='member')
        user.active_household = hh
        user.save(update_fields=['active_household'])
        return Response({'data': {
            'id': str(user.id), 'email': user.email, 'name': user.first_name,
        }}, status=201)

    def delete(self, request, id):
        hh = self._require_admin(request, id)
        user_id = request.data.get('user_id')
        target = get_object_or_404(User, id=user_id, is_household_account=True)
        get_object_or_404(HouseholdMembership, user=target, household=hh)
        target.delete()
        return Response({'success': True})

    def patch(self, request, id):
        hh = self._require_admin(request, id)
        user_id = request.data.get('user_id')
        new_password = (request.data.get('password') or '').strip()
        if not user_id:
            return Response({'error': 'user_id ist erforderlich'}, status=400)
        if not new_password:
            return Response({'error': 'Passwort ist erforderlich'}, status=400)
        if len(new_password) < 6:
            return Response({'error': 'Passwort muss mindestens 6 Zeichen lang sein'}, status=400)
        target = get_object_or_404(User, id=user_id, is_household_account=True)
        get_object_or_404(HouseholdMembership, user=target, household=hh)
        target.set_password(new_password)
        target.save(update_fields=['password'])
        return Response({'success': True})


# Dashboard-Items
class DashboardView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = DashboardItemSerializer

    def get_queryset(self):
        return DashboardItem.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class DashboardDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = DashboardItemSerializer
    lookup_field = "id"

    def get_queryset(self):
        return DashboardItem.objects.filter(user=self.request.user)


# Dashboard-Layouts
class DashboardLayoutListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        layouts = DashboardLayout.objects.filter(user=request.user).order_by('created_at')
        data = [
            {
                'id': str(l.id),
                'name': l.name,
                'itemCount': len(l.items),
                'createdAt': l.created_at.isoformat(),
            }
            for l in layouts
        ]
        return Response({'data': data})

    def post(self, request):
        name = (request.data.get('name') or '').strip()
        if not name:
            return Response({'error': 'Name ist erforderlich'}, status=400)
        # Snapshot current dashboard items
        current = DashboardItem.objects.filter(user=request.user)
        snapshot = DashboardItemSerializer(current, many=True).data
        layout = DashboardLayout.objects.create(user=request.user, name=name, items=snapshot)
        return Response({'data': {
            'id': str(layout.id),
            'name': layout.name,
            'itemCount': len(layout.items),
            'createdAt': layout.created_at.isoformat(),
        }}, status=201)


class DashboardLayoutDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, id):
        layout = get_object_or_404(DashboardLayout, id=id, user=request.user)
        layout.delete()
        return Response({'success': True})


class DashboardLayoutApplyView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, id):
        layout = get_object_or_404(DashboardLayout, id=id, user=request.user)
        # Replace all current items
        DashboardItem.objects.filter(user=request.user).delete()
        new_items = []
        for d in layout.items:
            item = DashboardItem.objects.create(
                user=request.user,
                widget_type=d.get('widget_type', ''),
                x=d.get('x', 0), y=d.get('y', 0),
                cols=d.get('cols', 1), rows=d.get('rows', 1),
                min_item_cols=d.get('minItemCols', 1),
                max_item_cols=d.get('maxItemCols'),
                min_item_rows=d.get('minItemRows', 1),
                max_item_rows=d.get('maxItemRows'),
                title=d.get('title', ''),
                icon=d.get('icon', ''),
                config=d.get('config', {}),
            )
            new_items.append(item)
        return Response({'data': DashboardItemSerializer(new_items, many=True).data})
