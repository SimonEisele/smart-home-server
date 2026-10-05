"""Build a household menu export once for preview and commit."""
import hashlib
import json
import math
from datetime import date, timedelta
from uuid import UUID
from django.db import transaction
from django.utils.dateparse import parse_date
from rest_framework.exceptions import ValidationError
from .models import Ingredient, Menu, Recipe, ShoppingItem

MEALS = ('breakfast', 'lunch', 'dinner')


def safe_date(value):
    try: return parse_date(str(value))
    except (ValueError, TypeError): return None


def number(value, label, integer=False):
    try:
        result = float(value)
    except (TypeError, ValueError):
        raise ValidationError({label: 'Expected a non-negative number.'})
    if isinstance(value, bool) or not math.isfinite(result) or result < 0 or (integer and not result.is_integer()):
        raise ValidationError({label: 'Expected a finite non-negative number.'})
    return result


def build_export(household, payload):
    refs = payload.get('meals')
    week_start = safe_date(payload.get('weekStart', ''))
    if refs is None:
        if not week_start:
            raise ValidationError({'weekStart': 'A date or a meal selection is required.'})
        days = int(number(payload.get('days', 7), 'days', True))
        if not 1 <= days <= 31:
            raise ValidationError({'days': 'Choose 1 to 31 days.'})
        refs = [f'{m.date}:{meal}' for m in Menu.objects.filter(household=household, date__range=(week_start, week_start + timedelta(days=days-1))) for meal in MEALS if getattr(m, meal+'_recipe_id')]
    if not isinstance(refs, list) or len(refs) > 150:
        raise ValidationError({'meals': 'Expected a meal selection of up to 150 entries.'})
    person_counts, extra_servings = payload.get('personCounts') or {}, payload.get('extraServings') or {}
    if not isinstance(person_counts, dict) or not isinstance(extra_servings, dict):
        raise ValidationError({'counts': 'Expected count mappings.'})
    if payload.get('strict') and person_counts:
        raise ValidationError({'personCounts':'The weekly export uses current attendance.'})
    parsed = []
    for ref in dict.fromkeys(str(r) for r in refs):
        parts = ref.split(':')
        d = safe_date(parts[0])
        if not d or len(parts) not in (2, 3) or (len(parts)==2 and parts[1] not in MEALS) or (len(parts)==3 and parts[1]!='extra'):
            raise ValidationError({'meals': 'Invalid meal reference.'})
        if len(parts)==3:
            try: UUID(parts[2])
            except ValueError: raise ValidationError({'meals': 'Invalid extra recipe.'})
        if payload.get('strict') and (not week_start or week_start.weekday()!=0 or not week_start <= d <= week_start+timedelta(days=6)):
            raise ValidationError({'weekStart': 'Selection must belong to the displayed Monday-to-Sunday week.'})
        parsed.append((ref, d, parts[1], parts[2] if len(parts)==3 else None))
    anchor = week_start or min((p[1] for p in parsed), default=date.today())
    iso = anchor.isocalendar()
    week_tag = f'{iso.year}-W{iso.week:02d}'
    supplied_tag = payload.get('weekTag')
    if supplied_tag and supplied_tag != week_tag:
        raise ValidationError({'weekTag': 'Week tag does not match the selection.'})
    # Include later leftover meals, even when they are in a different week.
    menus = {m.date: m for m in Menu.objects.filter(household=household, date__range=(anchor-timedelta(days=7), max((p[1] for p in parsed), default=anchor)+timedelta(days=7))).select_related('breakfast_recipe','lunch_recipe','dinner_recipe')}
    recipes = {str(r.id):r for r in Recipe.objects.filter(household=household)}
    catalog = {i.name.casefold():i for i in Ingredient.objects.all()}
    categories = dict(Ingredient.CATEGORY_CHOICES)
    aggregate, rows, warnings = {}, [], []
    for ref, d, meal, extra_id in parsed:
        menu = menus.get(d)
        if not menu:
            warnings.append(f'{ref}: Die Planung ist nicht mehr vorhanden.'); continue
        if extra_id:
            recipe = recipes.get(extra_id) if extra_id in [str(i) for i in menu.extra_recipe_ids or []] else None
            servings = number(extra_servings.get(ref, recipe.base_servings if recipe else 0), ref)
            persons, leftover = None, 0
        else:
            recipe = getattr(menu, meal+'_recipe')
            persons = number(person_counts.get(ref, getattr(menu, meal+'_persons')), ref, True)
            leftover = sum(getattr(m, cm+'_persons') for m in menus.values() for cm in MEALS if getattr(m, cm+'_leftovers_ref')==ref and 0 <= (m.date-d).days <= 7 and (m.date>d or MEALS.index(cm)>MEALS.index(meal)))
            # Explicit legacy overrides already include leftover diners.
            effective = persons if ref in person_counts else persons+leftover
            servings = effective * (recipe.units_per_person if recipe else 1)
        if not recipe or recipe.household_id != household.id:
            warnings.append(f'{ref}: Kein verfügbares Rezept.'); continue
        base = number(recipe.base_servings, 'baseServings')
        if base <= 0 or not math.isfinite(servings) or servings <= 0:
            warnings.append(f'{recipe.name}: Keine Personen oder Portionen eingetragen.'); continue
        scale = servings/base
        rows.append({'key':ref,'recipe':recipe.name,'persons':persons,'leftoverPersons':leftover,'servings':round(servings, 3),'servingType':recipe.serving_type})
        if not recipe.ingredients:
            warnings.append(f'{recipe.name}: Im Rezept sind keine Zutaten hinterlegt.')
        for ing in recipe.ingredients or []:
            if not isinstance(ing, dict): raise ValidationError({'ingredients':'Invalid recipe ingredient.'})
            name, unit = str(ing.get('name') or '').strip(), str(ing.get('unit') or '').strip()
            if not name: continue
            raw = ing.get('quantityPerPerson', ing.get('quantity_per_person'))
            qty = None if raw is None or raw=='' else number(raw, f'quantity:{name}')*scale
            if qty is not None and not math.isfinite(qty): raise ValidationError({'quantity': 'Scaled quantity is invalid.'})
            key = (name.casefold(), unit.casefold())
            if key not in aggregate:
                entry = catalog.get(name.casefold())
                aggregate[key] = {'name':name,'unit':unit,'quantity':qty,'category':categories.get(entry.category,entry.category) if entry else 'Sonstiges','sources':[recipe.name],'quantityIncomplete':qty is None}
            else:
                entry=aggregate[key]
                entry['quantityIncomplete'] |= qty is None
                if qty is not None: entry['quantity']=(entry['quantity'] or 0)+qty
                if recipe.name not in entry['sources']: entry['sources'].append(recipe.name)
    items = sorted(aggregate.values(),key=lambda i:(i['category'],i['name'].casefold(),i['unit']))
    for item in items:
        if item['quantity'] is not None:
            if not math.isfinite(item['quantity']): raise ValidationError({'quantity':'Total quantity is invalid.'})
            item['quantity']=round(item['quantity'],2)
    result={'data':items,'count':len(items),'meals':rows,'warnings':warnings,'weekTag':week_tag,'blocked':bool(warnings) or not items}
    result['previewToken']=hashlib.sha256(json.dumps(result,sort_keys=True,ensure_ascii=True).encode()).hexdigest()
    return result


def commit_export(household, plan, replace):
    with transaction.atomic():
        # Lock the household to serialize concurrent exports of the same week.
        type(household).objects.select_for_update().get(pk=household.pk)
        existing=list(ShoppingItem.objects.filter(household=household,list_type='menuplan',week_tag=plan['weekTag'])) if replace else []
        by_key={}
        for item in existing: by_key.setdefault((item.name.strip().casefold(),item.unit.strip().casefold()),item)
        saved=[]
        for row in plan['data']:
            item=by_key.get((row['name'].casefold(),row['unit'].casefold()))
            if item is None: item=ShoppingItem(household=household,list_type='menuplan',week_tag=plan['weekTag'])
            elif item.quantity != row['quantity']: item.checked=False
            item.name=row['name'];item.quantity=row['quantity'];item.unit=row['unit'];item.category=row['category'];item.suggestion=' | '.join(row['sources']) + (' · Menge im Rezept prüfen' if row['quantityIncomplete'] else '');item.save();saved.append(item)
        if replace:
            ShoppingItem.objects.filter(household=household,list_type='menuplan',week_tag=plan['weekTag']).exclude(id__in=[i.id for i in saved]).delete()
        return saved
