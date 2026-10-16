import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Shoppinglist } from './shoppinglist';
import { ShoppinglistService } from './service/shoppinglist.service';
import { RecipesService } from '../recipes/service/recipes.service';

it('retains article and summary DOM nodes when opening a dialog or updating an article', async () => {
  TestBed.configureTestingModule({
    imports: [Shoppinglist],
    providers: [
      { provide: ShoppinglistService, useValue: { getItems: () => of([
        { id: 'one', name: 'Milch', category: 'Milchprodukte', checked: false, quantity: 1 },
      ]) } },
      { provide: RecipesService, useValue: { getIngredients: () => of([]), getRecipes: () => of([]) } },
    ],
  });
  const fixture = TestBed.createComponent(Shoppinglist);
  await fixture.whenStable();
  const row = fixture.nativeElement.querySelector('.item-row');
  const summary = fixture.nativeElement.querySelector('.summary-row');
  expect(row).not.toBeNull();
  fixture.componentInstance.openAdd();
  fixture.changeDetectorRef.markForCheck();
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('.item-row')).toBe(row);
  expect(fixture.nativeElement.querySelector('.summary-row')).toBe(summary);
  fixture.componentInstance.items = fixture.componentInstance.items.map(item => ({ ...item, quantity: 2 }));
  fixture.changeDetectorRef.markForCheck();
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('.item-row')).toBe(row);
  expect(row.querySelector('.item-qty').textContent).toContain('2');
  expect(fixture.nativeElement.querySelector('.summary-row')).toBe(summary);
  fixture.destroy();
});
