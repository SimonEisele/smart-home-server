"""Compare the database tables with the models: `python manage.py check_schema`.

Lists columns the code does not know (a NOT NULL one without default breaks every insert) and model fields the
database lacks. Read only.
"""
from django.apps import apps
from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = 'Zeigt Abweichungen zwischen Datenbank-Tabellen und Modellen.'

    def handle(self, *args, **options):
        problems = 0
        with connection.cursor() as cursor:
            tables = set(connection.introspection.table_names(cursor))
            for model in apps.get_models():
                table = model._meta.db_table
                if table not in tables or not model._meta.managed:
                    continue
                db_columns = {col.name: col for col in connection.introspection.get_table_description(cursor, table)}
                known = {field.column for field in model._meta.local_concrete_fields}
                for name in sorted(set(db_columns) - known):
                    blocking = not db_columns[name].null_ok and db_columns[name].default is None
                    problems += 1
                    note = ' – blockiert neue Einträge (NOT NULL ohne Standardwert)' if blocking else ''
                    self.stdout.write(f'{table}: Spalte {name} fehlt im Modell{note}')
                for name in sorted(known - set(db_columns)):
                    problems += 1
                    self.stdout.write(f'{table}: Spalte {name} fehlt in der Datenbank')
        self.stdout.write(self.style.SUCCESS('Keine Abweichungen.') if not problems
                          else self.style.WARNING(f'{problems} Abweichung(en).'))
