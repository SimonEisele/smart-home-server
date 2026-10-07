"""Persist structured recipe contents atomically, retaining amount identities."""
from uuid import UUID, uuid4
from .ingredient_units import normalize_name


def save_contents(recipe):
    from .models import Ingredient, RecipeIngredient, RecipeSection, RecipeStep, RecipeStepIngredient, RecipeNote
    pending = [name for name in ('ingredients', 'sections', 'steps', 'side_notes') if hasattr(recipe, '_pending_' + name)]
    if not pending:
        return
    amounts, sections, steps, notes = recipe.ingredients, recipe.sections, recipe.steps, recipe.side_notes
    # Deleting links first permits amount changes without orphaning step references.
    recipe.step_rows.all().delete()
    section_map = {}
    for position, value in enumerate(sections):
        section_map[value['id']], _ = RecipeSection.objects.update_or_create(recipe=recipe, key=value['id'], defaults={'title': value['title'], 'position': position})
    catalog = {i.normalized_name: i for i in Ingredient.objects.all()}
    catalog_ids = {i.id: i for i in catalog.values()}
    old = {str(row.key): row for row in recipe.ingredient_rows.all()}
    # Temporary positions allow swapping rows under the uniqueness constraint.
    offset = max([row.position for row in old.values()] + [len(amounts)]) + len(old) + 1
    for position, row in enumerate(old.values()):
        RecipeIngredient.objects.filter(pk=row.pk).update(position=offset + position)
    new_rows = []
    for position, value in enumerate(amounts):
        row = old.get(str(value.get('id'))) or RecipeIngredient(recipe=recipe, key=UUID(str(value['id'])) if value.get('id') else uuid4())
        row.name = value.get('name', '').strip()
        row.ingredient = catalog_ids.get(value.get('ingredientId')) or catalog.get(normalize_name(row.name))
        row.quantity = value.get('quantityPerPerson', value.get('quantity_per_person'))
        row.unit = value.get('unit') or ''
        row.position = position
        row.section_ref = section_map.get(value.get('sectionId'))
        row.save()
        new_rows.append(row)
    recipe.ingredient_rows.exclude(pk__in=[row.pk for row in new_rows]).delete()
    for order, value in enumerate(sorted(steps, key=lambda v: v.get('order', 0)), 1):
        step = RecipeStep.objects.create(recipe=recipe, order=order, description=value.get('description') or '', section=section_map.get(value.get('sectionId')))
        for position, link in enumerate(value.get('ingredients') or []):
            amount = next((r for r in new_rows if str(r.key) == str(link.get('recipeIngredientId'))), None)
            if amount is None:
                matches = [r for r in new_rows if normalize_name(r.name) == normalize_name(link.get('name', '')) or (r.ingredient_id and r.ingredient_id == link.get('ingredientId'))]
                local = [r for r in matches if r.section_ref_id == step.section_id]
                options = local or matches
                if len(options) != 1:
                    raise ValueError('A cooking step ingredient must match exactly one recipe amount.')
                amount = options[0]
            if amount is None:
                raise ValueError('A cooking step references an ingredient outside its recipe.')
            RecipeStepIngredient.objects.create(step=step, recipe_ingredient=amount, quantity=link.get('quantityPerPerson'), unit=link.get('unit') or '', position=position)
    recipe.section_rows.exclude(pk__in=[row.pk for row in section_map.values()]).delete()
    recipe.note_rows.all().delete()
    RecipeNote.objects.bulk_create([RecipeNote(recipe=recipe, label=value['label'], value=value['value'], position=position) for position, value in enumerate(notes)])
    for name in pending:
        delattr(recipe, '_pending_' + name)
    if hasattr(recipe, '_prefetched_objects_cache'):
        recipe._prefetched_objects_cache.clear()
