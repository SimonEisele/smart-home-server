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


# Same-dimension conversions only (mass and volume); nothing is guessed across dimensions.
_BASE_UNITS = {'g': ('g', 1.0), 'kg': ('g', 1000.0),
               'ml': ('ml', 1.0), 'cl': ('ml', 10.0), 'dl': ('ml', 100.0), 'l': ('ml', 1000.0)}


def to_base(quantity, unit):
    """Return (quantity, unit) in g or ml where a safe conversion exists, else unchanged."""
    unit = normalize_unit(unit)
    base = _BASE_UNITS.get(unit.casefold())
    if base is None:
        return quantity, unit
    return (None if quantity is None else quantity * base[1]), base[0]


def readable(quantity, unit):
    """Present large base amounts in kg or l (1500 g -> 1.5 kg)."""
    if quantity is not None and unit in ('g', 'ml') and quantity >= 1000:
        return quantity / 1000, 'kg' if unit == 'g' else 'l'
    return quantity, unit
