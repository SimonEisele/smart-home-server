"""Cleaning plan: whose turn it is, rotation, steps and logging for someone else."""
from datetime import date, timedelta

from django.test import TestCase
from rest_framework.test import APIClient

from users.models import Household, HouseholdMembership, User

from .models import CleaningTask


class CleaningPlanTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='WG')
        self.simon = self.member('simon@example.com', 'Simon')
        self.lisa = self.member('lisa@example.com', 'Lisa')
        self.tom = self.member('tom@example.com', 'Tom')
        self.client = APIClient()
        self.client.force_authenticate(self.simon)

    def member(self, email, name):
        user = User.objects.create_user(email, 'pw', active_household=self.household, first_name=name)
        HouseholdMembership.objects.create(user=user, household=self.household, role='member')
        return user

    def create(self, **data):
        response = self.client.post('/api/cleaning-tasks/', {'name': 'Bad', 'category': 'bathroom',
                                                             'intervalDays': 7, **data}, format='json')
        self.assertIn(response.status_code, (200, 201), response.data)
        return response.data['data']

    def log(self, task_id, **data):
        return self.client.post(f'/api/cleaning-tasks/{task_id}/logs/',
                                {'doneAt': str(date.today()), **data}, format='json')

    def test_steps_duration_and_fixed_person(self):
        task = self.create(assignedTo=str(self.lisa.id), checklist=[' Lavabo  putzen ', '', 'Boden'],
                           durationMinutes=30)
        self.assertEqual((task['assignedToName'], task['checklist'], task['durationMinutes'], task['rotation']),
                         ('Lisa', ['Lavabo putzen', 'Boden'], 30, []))
        # Without a rotation the person stays after a completion.
        self.assertEqual(self.log(task['id']).data['task']['assignedTo'], str(self.lisa.id))

    def test_rotation_moves_on_and_undo_gives_the_turn_back(self):
        rotation = [str(self.simon.id), str(self.lisa.id), str(self.tom.id)]
        task = self.create(rotation=rotation)
        self.assertEqual(task['assignedTo'], str(self.simon.id))  # first in line starts
        first = self.log(task['id'])
        self.assertEqual(first.status_code, 201)
        self.assertEqual(first.data['task']['assignedToName'], 'Lisa')
        # Tom jumps in for Lisa: the turn moves on after Tom, back to Simon.
        second = self.log(task['id'], doneBy=str(self.tom.id))
        self.assertEqual((second.data['data']['doneByName'], second.data['task']['assignedToName']), ('Tom', 'Simon'))
        undo = self.client.delete(f"/api/cleaning-logs/{second.data['data']['id']}/")
        self.assertEqual(undo.data['task']['assignedToName'], 'Lisa')
        # An older completion logged afterwards does not move the turn.
        old = self.log(task['id'], doneAt=str(date.today() - timedelta(days=20)))
        self.assertEqual(old.data['task']['assignedToName'], 'Lisa')

    def test_only_members_take_part(self):
        outsider = User.objects.create_user('x@example.com', 'pw', active_household=Household.objects.create(name='X'))
        bad = self.client.post('/api/cleaning-tasks/', {'name': 'Bad', 'intervalDays': 7,
                                                        'rotation': [str(self.simon.id), str(outsider.id)]},
                               format='json')
        self.assertEqual(bad.status_code, 400)
        task = self.create()
        self.assertEqual(self.log(task['id'], doneBy=str(outsider.id)).status_code, 400)
        # A single person is no rotation; a person outside the rotation is replaced by its first member.
        single = self.create(rotation=[str(self.lisa.id)])
        self.assertEqual((single['rotation'], single['assignedTo']), ([], None))
        mixed = self.create(rotation=[str(self.lisa.id), str(self.tom.id)], assignedTo=str(self.simon.id))
        self.assertEqual(mixed['assignedTo'], str(self.lisa.id))

    def test_calendar_shape_still_works(self):
        task = CleaningTask.objects.create(household=self.household, name='Küche', interval_days=3)
        listed = self.client.get('/api/cleaning-tasks/').data['data']
        self.assertEqual(listed[0]['id'], str(task.id))
        self.assertIsNone(listed[0]['lastDoneAt'])
        plain = self.client.post(f'/api/cleaning-tasks/{task.id}/logs/', {'doneAt': str(date.today())}, format='json')
        self.assertEqual(plain.data['data']['doneBy'], str(self.simon.id))
