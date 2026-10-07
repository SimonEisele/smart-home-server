"""Shared catalog identity and unit spelling; no inferred density conversions."""
import unicodedata


def normalize_name(value):
    return unicodedata.normalize('NFKC', ' '.join(str(value).split())).casefold()


UNIT_ALIASES = {'stk': 'Stück', 'stk.': 'Stück', 'stück': 'Stück', 'stueck': 'Stück',
                'gramm': 'g', 'kilogramm': 'kg', 'liter': 'l', 'milliliter': 'ml',
                'el': 'EL', 'tl': 'TL'}
UNITS = ('', 'g', 'kg', 'ml', 'cl', 'dl', 'l', 'Stück', 'EL', 'TL', 'Prise', 'Bund',
         'Zehe', 'Dose', 'Packung', 'Becher', 'Scheibe', 'Stange', 'Kopf', 'cm')


def normalize_unit(value):
    value = str(value or '').strip()
    return UNIT_ALIASES.get(value.casefold(), value)
