"""Fitness: private workouts, shared machine catalog with weight factors."""
from django.test import TestCase
from rest_framework.test import APIClient

from users.models import Household, HouseholdMembership, User

from .models import ExerciseType, GymMachine, Workout


class FitnessTests(TestCase):
    def setUp(self):
        household = Household.objects.create(name='WG')
        self.simon = User.objects.create_user('simon@example.com', 'pw', active_household=household)
        self.lisa = User.objects.create_user('lisa@example.com', 'pw', active_household=household)
        for user in (self.simon, self.lisa):
            HouseholdMembership.objects.create(user=user, household=household, role='member')
        self.client = APIClient()
        self.client.force_authenticate(self.simon)
        self.press = ExerciseType.objects.get(name='Beinpresse')
        self.treadmill = ExerciseType.objects.get(name='Laufband')

    def machine(self, **data):
        response = self.client.post('/api/fitness/machines/', {'exerciseType': self.press.id, **data}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data['data']

    def test_catalog_is_seeded_and_machines_are_shared_with_factor(self):
        types = self.client.get('/api/fitness/exercise-types/').data['data']
        self.assertTrue({'Beinpresse', 'Laufband', 'Latzug'} <= {t['name'] for t in types})
        techno = self.machine(manufacturer=' Technogym ', model='Selection 700')
        gym80 = self.machine(manufacturer='Gym80', model='Sygnum', weightFactor=1.2)
        self.assertEqual((techno['manufacturer'], techno['weightFactor'], gym80['weightFactor']),
                         ('Technogym', 1.0, 1.2))
        duplicate = self.client.post('/api/fitness/machines/', {'exerciseType': self.press.id,
                                                                'manufacturer': 'technogym', 'model': 'selection 700'},
                                     format='json')
        self.assertEqual(duplicate.status_code, 400)
        other = APIClient()
        other.force_authenticate(self.lisa)
        listed = other.get('/api/fitness/machines/').data['data']
        self.assertEqual([(m['manufacturer'], m['isMine']) for m in listed], [('Gym80', False), ('Technogym', False)])
        self.assertEqual(other.patch(f"/api/fitness/machines/{gym80['id']}/", {'weightFactor': 1.25},
                                     format='json').data['data']['weightFactor'], 1.25)

    def test_workout_with_strength_and_cardio_is_private(self):
        self.client.put('/api/fitness/profile/', {'bodyWeightKg': 80}, format='json')
        press = self.machine(manufacturer='Technogym')
        response = self.client.post('/api/fitness/workouts/', {
            'date': '2026-11-15', 'durationMinutes': 60, 'gym': 'Activ Fitness',
            'entries': [
                {'machine': press['id'], 'sets': [{'reps': 12, 'weight': 80}, {'reps': 10, 'weight': 90},
                                                  {'reps': None, 'weight': None}]},
                {'exerciseType': self.treadmill.id, 'durationMinutes': 20, 'distanceKm': 3.1, 'level': '8',
                 'sets': [{'reps': 1, 'weight': 1}]},
            ]}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        workout = response.data['data']
        self.assertEqual(workout['bodyWeightKg'], 80)  # taken from the profile
        strength, cardio = workout['entries']
        self.assertEqual((strength['exerciseName'], strength['machineLabel'], len(strength['sets'])),
                         ('Beinpresse', 'Technogym', 2))
        self.assertEqual((cardio['kind'], cardio['sets'], cardio['distanceKm'], cardio['met']),
                         ('cardio', [], 3.1, 8.0))
        # Editing replaces the entries; an own calorie value overrides the estimate.
        url = f"/api/fitness/workouts/{workout['id']}/"
        patched = self.client.patch(url, {'calories': 520, 'entries': [strength]}, format='json').data['data']
        self.assertEqual((patched['calories'], len(patched['entries'])), (520, 1))
        other = APIClient()
        other.force_authenticate(self.lisa)
        self.assertEqual(other.get('/api/fitness/workouts/').data['data'], [])
        self.assertEqual(other.get(url).status_code, 404)
        # A machine in use cannot be deleted.
        self.assertEqual(self.client.delete(f"/api/fitness/machines/{press['id']}/").status_code, 400)
        self.assertEqual(self.client.delete(url).status_code, 200)
        self.assertFalse(Workout.objects.exists())
        self.assertEqual(self.client.delete(f"/api/fitness/machines/{press['id']}/").status_code, 200)
        self.assertFalse(GymMachine.objects.exists())

    def test_entry_needs_matching_exercise(self):
        press = self.machine(manufacturer='Matrix')
        bad = self.client.post('/api/fitness/workouts/', {'date': '2026-11-15', 'entries': [
            {'machine': press['id'], 'exerciseType': self.treadmill.id}]}, format='json')
        self.assertEqual(bad.status_code, 400)
        empty = self.client.post('/api/fitness/workouts/', {'date': '2026-11-15', 'entries': [{'sets': []}]},
                                 format='json')
        self.assertEqual(empty.status_code, 400)
        custom = self.client.post('/api/fitness/exercise-types/', {'name': 'Hip Thrust', 'muscleGroup': 'beine'},
                                  format='json')
        self.assertEqual((custom.status_code, custom.data['data']['kind']), (201, 'strength'))
        self.assertEqual(self.client.post('/api/fitness/exercise-types/', {'name': 'hip thrust'},
                                          format='json').status_code, 400)
