"""Common gym exercises with MET values (Compendium of Physical Activities, rounded)."""
from django.db import migrations

TYPES = [
    # name, kind, muscle group, MET
    ('Beinpresse', 'strength', 'beine', 5.0),
    ('Beinstrecker', 'strength', 'beine', 3.5),
    ('Beinbeuger', 'strength', 'beine', 3.5),
    ('Wadenheben', 'strength', 'beine', 3.5),
    ('Adduktoren', 'strength', 'beine', 3.5),
    ('Abduktoren', 'strength', 'beine', 3.5),
    ('Kniebeuge', 'strength', 'beine', 6.0),
    ('Brustpresse', 'strength', 'brust', 5.0),
    ('Bankdrücken', 'strength', 'brust', 5.0),
    ('Butterfly', 'strength', 'brust', 3.5),
    ('Schulterpresse', 'strength', 'schultern', 5.0),
    ('Seitheben', 'strength', 'schultern', 3.5),
    ('Latzug', 'strength', 'ruecken', 5.0),
    ('Rudern sitzend', 'strength', 'ruecken', 5.0),
    ('Rückenstrecker', 'strength', 'ruecken', 3.5),
    ('Kreuzheben', 'strength', 'ruecken', 6.0),
    ('Klimmzüge (unterstützt)', 'strength', 'ruecken', 5.0),
    ('Bizepscurl', 'strength', 'arme', 3.5),
    ('Trizepsdrücken', 'strength', 'arme', 3.5),
    ('Dips (unterstützt)', 'strength', 'arme', 5.0),
    ('Bauchmaschine', 'strength', 'bauch', 3.5),
    ('Rumpfrotation', 'strength', 'bauch', 3.5),
    ('Kabelzug', 'strength', 'ganzkoerper', 4.0),
    ('Laufband', 'cardio', 'cardio', 8.0),
    ('Ergometer (Velo)', 'cardio', 'cardio', 7.0),
    ('Crosstrainer', 'cardio', 'cardio', 5.0),
    ('Rudergerät', 'cardio', 'cardio', 7.0),
    ('Stepper', 'cardio', 'cardio', 9.0),
]


def seed(apps, schema_editor):
    ExerciseType = apps.get_model('features', 'ExerciseType')
    for name, kind, muscle, met in TYPES:
        ExerciseType.objects.get_or_create(name=name, defaults={'kind': kind, 'muscle_group': muscle, 'met': met})


class Migration(migrations.Migration):
    dependencies = [('features', '0034_fitness')]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
