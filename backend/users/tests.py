from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from features.models import Ingredient, ShoppingItem
from .models import Household, HouseholdMembership, User


class HouseholdAccessTests(APITestCase):
    """Membership, not the stored active household, decides access."""

    def setUp(self):
        self.hh = Household.objects.create(name='WG')
        self.other = Household.objects.create(name='Andere WG')
        self.owner = self._user('owner@example.com', 'owner')
        self.admin = self._user('admin@example.com', 'admin')
        self.admin2 = self._user('admin2@example.com', 'admin')
        self.member = self._user('member@example.com', 'member')

    def _user(self, email, role, household=None):
        household = household or self.hh
        user = User.objects.create_user(email, 'testpassword', active_household=household)
        HouseholdMembership.objects.create(user=user, household=household, role=role)
        return user

    def _members_url(self):
        return f'/api/users/households/{self.hh.id}/members/'

    def test_removed_member_loses_access(self):
        self.client.force_authenticate(self.admin)
        r = self.client.delete(self._members_url(), {'user_id': str(self.member.id)}, format='json')
        self.assertEqual(r.status_code, 200)
        self.member.refresh_from_db()
        self.assertIsNone(self.member.active_household)

        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.get('/api/todos/').status_code, 403)
        self.assertEqual(self.client.post('/api/shopping-items/', {'name': 'Bier'}, format='json').status_code, 403)
        self.assertFalse(ShoppingItem.objects.exists())

    def test_stale_active_household_without_membership_is_rejected(self):
        HouseholdMembership.objects.filter(user=self.member).delete()
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.get('/api/shopping-items/').status_code, 403)

    def test_removed_member_switches_to_remaining_household(self):
        HouseholdMembership.objects.create(user=self.member, household=self.other, role='owner')
        self.client.force_authenticate(self.admin)
        self.client.delete(self._members_url(), {'user_id': str(self.member.id)}, format='json')
        self.member.refresh_from_db()
        self.assertEqual(self.member.active_household, self.other)

    def test_owner_role_cannot_be_changed_or_removed(self):
        self.client.force_authenticate(self.admin)
        r = self.client.patch(self._members_url(), {'user_id': str(self.owner.id), 'role': 'member'}, format='json')
        self.assertEqual(r.status_code, 400)
        r = self.client.delete(self._members_url(), {'user_id': str(self.owner.id)}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertTrue(HouseholdMembership.objects.filter(user=self.owner, role='owner').exists())

    def test_admin_cannot_demote_or_remove_other_admin(self):
        self.client.force_authenticate(self.admin)
        r = self.client.patch(self._members_url(), {'user_id': str(self.admin2.id), 'role': 'member'}, format='json')
        self.assertEqual(r.status_code, 403)
        r = self.client.delete(self._members_url(), {'user_id': str(self.admin2.id)}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_owner_can_demote_admin_and_admin_can_step_down(self):
        self.client.force_authenticate(self.owner)
        r = self.client.patch(self._members_url(), {'user_id': str(self.admin2.id), 'role': 'member'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.client.force_authenticate(self.admin)
        r = self.client.patch(self._members_url(), {'user_id': str(self.admin.id), 'role': 'member'}, format='json')
        self.assertEqual(r.status_code, 200)

    def test_leaving_inactive_household_keeps_active_one(self):
        HouseholdMembership.objects.create(user=self.member, household=self.other, role='member')
        self.client.force_authenticate(self.member)
        r = self.client.post(f'/api/users/households/{self.other.id}/leave/')
        self.assertEqual(r.status_code, 200)
        self.member.refresh_from_db()
        self.assertEqual(self.member.active_household, self.hh)

    def test_owner_transfers_ownership_and_can_then_leave(self):
        self.client.force_authenticate(self.owner)
        url = f'/api/users/households/{self.hh.id}/transfer-ownership/'
        r = self.client.post(url, {'user_id': str(self.member.id)}, format='json')
        self.assertEqual(r.status_code, 200)
        roles = dict(HouseholdMembership.objects.filter(household=self.hh).values_list('user__email', 'role'))
        self.assertEqual(roles['member@example.com'], 'owner')
        self.assertEqual(roles['owner@example.com'], 'admin')
        self.assertEqual(list(roles.values()).count('owner'), 1)
        r = self.client.post(f'/api/users/households/{self.hh.id}/leave/')
        self.assertEqual(r.status_code, 200)

    def test_only_owner_can_transfer_and_only_to_real_members(self):
        url = f'/api/users/households/{self.hh.id}/transfer-ownership/'
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(url, {'user_id': str(self.admin.id)}, format='json').status_code, 403)

        self.client.force_authenticate(self.owner)
        stranger = self._user('stranger@example.com', 'owner', household=self.other)
        self.assertEqual(self.client.post(url, {'user_id': str(stranger.id)}, format='json').status_code, 404)
        self.assertEqual(self.client.post(url, {'user_id': 'kein-uuid'}, format='json').status_code, 404)
        self.assertEqual(self.client.post(url, {'user_id': str(self.owner.id)}, format='json').status_code, 400)
        device = User.objects.create_user('tablet@wg.local', 'testpassword', is_household_account=True)
        HouseholdMembership.objects.create(user=device, household=self.hh, role='member')
        self.assertEqual(self.client.post(url, {'user_id': str(device.id)}, format='json').status_code, 400)
        self.assertTrue(HouseholdMembership.objects.filter(user=self.owner, household=self.hh, role='owner').exists())

    def test_regenerated_invite_code_replaces_the_old_one(self):
        old_code = self.hh.invite_code
        url = f'/api/users/households/{self.hh.id}/invite-code/'
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.post(url).status_code, 403)

        self.client.force_authenticate(self.admin)
        r = self.client.post(url)
        self.assertEqual(r.status_code, 200)
        self.hh.refresh_from_db()
        self.assertNotEqual(self.hh.invite_code, old_code)
        self.assertEqual(str(r.data['data']['invite_code']), str(self.hh.invite_code))

        newcomer = User.objects.create_user('new@example.com', 'testpassword')
        self.client.force_authenticate(newcomer)
        join = '/api/users/households/join/'
        self.assertEqual(self.client.post(join, {'invite_code': str(old_code)}, format='json').status_code, 404)
        self.assertEqual(self.client.post(join, {'invite_code': str(self.hh.invite_code)}, format='json').status_code, 200)

    def test_ingredient_catalog_permissions(self):
        ing = Ingredient.objects.create(name='Testzutat', category='gemuese')
        url = f'/api/ingredients/{ing.id}/'
        outsider = User.objects.create_user('outsider@example.com', 'testpassword')
        self.client.force_authenticate(outsider)
        self.assertEqual(self.client.get('/api/ingredients/').status_code, 200)
        self.assertEqual(self.client.patch(url, {'name': 'Kaputt'}, format='json').status_code, 403)

        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.patch(url, {'name': 'Neuer Name'}, format='json').status_code, 200)
        self.assertEqual(self.client.delete(url).status_code, 403)

        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.delete(url).status_code, 200)

    def test_attendance_rejects_invalid_flags_instead_of_crashing(self):
        self.client.force_authenticate(self.member)
        r = self.client.post('/api/meal-attendance/', {'date': '2026-11-05', 'lunchPresent': 'false'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.data['data']['lunchPresent'] if 'lunchPresent' in r.data['data'] else r.data['data']['lunch_present'])
        r = self.client.post('/api/meal-attendance/', {'date': '2026-11-05', 'lunchPresent': 'vielleicht'}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_invalid_member_id_filter_is_a_validation_error(self):
        self.client.force_authenticate(self.member)
        r = self.client.get('/api/member-availabilities/?memberId=kein-uuid')
        self.assertEqual(r.status_code, 400)


class AuthEndpointTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user('login@example.com', 'testpassword')

    def test_login_error_does_not_reveal_whether_account_exists(self):
        unknown = self.client.post('/api/users/token/', {'email': 'nobody@example.com', 'password': 'x'}, format='json')
        wrong = self.client.post('/api/users/token/', {'email': 'login@example.com', 'password': 'x'}, format='json')
        self.assertEqual(unknown.status_code, 400)
        self.assertEqual(unknown.data, wrong.data)

    def test_login_is_rate_limited(self):
        codes = [
            self.client.post('/api/users/token/', {'email': 'login@example.com', 'password': 'x'}, format='json').status_code
            for _ in range(11)
        ]
        self.assertEqual(codes[-1], 429)

    def test_logout_blacklists_refresh_token(self):
        r = self.client.post('/api/users/token/', {'email': 'login@example.com', 'password': 'testpassword'}, format='json')
        refresh = r.data['data']['refresh_token']
        self.assertEqual(self.client.post('/api/users/token/logout/', {'refresh': refresh}, format='json').status_code, 200)
        self.assertEqual(self.client.post('/api/users/token/refresh/', {'refresh': refresh}, format='json').status_code, 401)

    def test_rotated_refresh_token_cannot_be_reused(self):
        r = self.client.post('/api/users/token/', {'email': 'login@example.com', 'password': 'testpassword'}, format='json')
        refresh = r.data['data']['refresh_token']
        self.assertEqual(self.client.post('/api/users/token/refresh/', {'refresh': refresh}, format='json').status_code, 200)
        self.assertEqual(self.client.post('/api/users/token/refresh/', {'refresh': refresh}, format='json').status_code, 401)

    @override_settings(ALLOW_REGISTRATION=False)
    def test_registration_can_be_disabled(self):
        r = self.client.post('/api/users/create/', {
            'email': 'new@example.com', 'password': 'testpassword', 'first_name': 'N', 'last_name': 'N',
        }, format='json')
        self.assertEqual(r.status_code, 403)
        self.assertFalse(User.objects.filter(email='new@example.com').exists())

    def test_registration_still_works_by_default(self):
        r = self.client.post('/api/users/create/', {
            'email': 'new@example.com', 'password': 'testpassword', 'first_name': 'N', 'last_name': 'N',
        }, format='json')
        self.assertEqual(r.status_code, 200)
