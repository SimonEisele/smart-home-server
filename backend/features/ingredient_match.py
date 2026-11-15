"""Find the catalog entry a freely written ingredient means ("Zwiebeln, in Ringen" → "Zwiebel").

Only safe, mechanical matches: same spelling (case, ß/ss, spaces), the name before a comma or
bracket, and simple German plural endings. Meaning-based choices ("Fett für die Form" → Butter)
are left to the person or the assistant.
"""
import re

from .ingredient_units import normalize_name
from .models import Ingredient

_ENDINGS = ('', 'n', 'en', 'e', 's', 'er', 'nen')


def _variants(key):
    """The key and its singular/plural neighbours."""
    found = {key}
    for ending in _ENDINGS[1:]:
        found.add(key + ending)
        if key.endswith(ending) and len(key) - len(ending) >= 3:
            found.add(key[:-len(ending)])
    return found


def base_name(name):
    """The ingredient itself without preparation notes: "Zwiebeln, in Ringen" → "Zwiebeln"."""
    head = re.split(r'[,(;]', str(name or ''), maxsplit=1)[0]
    return ' '.join(head.split())


class Catalog:
    """Active catalog entries indexed for matching."""

    def __init__(self, entries=None):
        entries = list(entries if entries is not None else Ingredient.objects.filter(archived=False))
        self.by_key = {entry.normalized_name: entry for entry in entries}
        self.by_variant = {}
        for entry in entries:
            for variant in _variants(entry.normalized_name):
                self.by_variant.setdefault(variant, []).append(entry)

    def match(self, name):
        """The one catalog entry `name` clearly means, else None."""
        for candidate in (name, base_name(name)):
            key = normalize_name(candidate)
            if not key:
                continue
            if key in self.by_key:
                return self.by_key[key]
            hits = {entry.pk: entry for variant in _variants(key) for entry in self.by_variant.get(variant, [])}
            if len(hits) == 1:
                return next(iter(hits.values()))
        return None
