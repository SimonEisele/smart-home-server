"""Tasks with a responsible person, an area and a checklist."""
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from users.models import Household, HouseholdMembership, User

from .models import Todo


class TodoDetailsTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='WG')
        self.simon = self.member('simon@example.com', 'Simon')
        self.lisa = self.member('lisa@example.com', 'Lisa')
        self.client = APIClient()
        self.client.force_authenticate(self.simon)

    def member(self, email, name):
        user = User.objects.create_user(email, 'pw', active_household=self.household, first_name=name)
        HouseholdMembership.objects.create(user=user, household=self.household, role='member')
        return user

    def create(self, **data):
        return self.client.post('/api/todos/', {'title': 'Bad putzen', **data}, format='json')

    def test_wg_task_with_responsible_person_area_and_checklist(self):
        response = self.create(globalTodo=True, assignedTo=str(self.lisa.id), category='  Haushalt ',
                               checklist=[{'text': 'Lavabo'}, {'text': '  '}, {'text': 'Boden', 'done': True}])
        self.assertIn(response.status_code, (200, 201), response.data)
        data = response.data['data']
        self.assertEqual((data['assignedToName'], data['category'], data['createdByName']),
                         ('Lisa', 'Haushalt', 'Simon'))
        self.assertEqual([(s['text'], s['done']) for s in data['checklist']], [('Lavabo', False), ('Boden', True)])
        self.assertTrue(all(s['id'] for s in data['checklist']))
        listed = self.client.get('/api/todos/').data['data'][0]
        self.assertEqual(listed['assignedTo'], str(self.lisa.id))

    def test_only_wg_members_and_only_wg_tasks_are_assigned(self):
        outsider = User.objects.create_user('x@example.com', 'pw', active_household=Household.objects.create(name='X'))
        self.assertEqual(self.create(globalTodo=True, assignedTo=str(outsider.id)).status_code, 400)
        private = self.create(globalTodo=False, assignedTo=str(self.lisa.id)).data['data']
        self.assertIsNone(private['assignedTo'])
        shared = self.create(globalTodo=True, assignedTo=str(self.lisa.id)).data['data']
        made_private = self.client.patch(f"/api/todos/{shared['id']}/", {'globalTodo': False}, format='json')
        self.assertIsNone(made_private.data['data']['assignedTo'])

    def test_recurring_task_starts_with_a_fresh_checklist(self):
        todo = Todo.objects.create(household=self.household, title='Pflanzen', global_todo=True, created_by=self.simon,
                                   recurrence='weekly', due_date=timezone.now(),
                                   checklist=[{'id': 'a', 'text': 'Balkon', 'done': True}])
        response = self.client.post(f'/api/todos/{todo.id}/complete/', {}, format='json')
        self.assertEqual(response.status_code, 200)
        todo.refresh_from_db()
        self.assertEqual((todo.done, todo.checklist[0]['done']), (False, False))
