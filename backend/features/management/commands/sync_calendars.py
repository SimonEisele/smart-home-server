"""Refreshes all linked calendars, e.g. from cron every 30 minutes (the app also refreshes on demand)."""
from django.core.management.base import BaseCommand

from features import calendar_sync
from features.models import ExternalCalendar


class Command(BaseCommand):
    help = 'Lädt alle verknüpften Kalender neu.'

    def handle(self, *args, **options):
        for calendar in ExternalCalendar.objects.filter(enabled=True):
            ok = calendar_sync.sync(calendar)
            result = calendar.event_count if ok else calendar.last_error
            self.stdout.write(f"{'ok' if ok else 'Fehler'}: {calendar.name} – {result}")
