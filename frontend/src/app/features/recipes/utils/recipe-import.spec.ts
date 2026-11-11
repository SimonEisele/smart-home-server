import { describe, expect, it } from 'vitest';
import { parseIngredientLine, parseIngredientList, parseStepList } from './recipe-import';

describe('recipe import', () => {
  it('reads quantity, unit and name from common ingredient lines', () => {
    expect(parseIngredientLine('200 g Mehl')).toEqual({ name: 'Mehl', quantity: 200, unit: 'g' });
    expect(parseIngredientLine('200g Mehl')).toEqual({ name: 'Mehl', quantity: 200, unit: 'g' });
    expect(parseIngredientLine('1,5 l Milch')).toEqual({ name: 'Milch', quantity: 1.5, unit: 'l' });
    expect(parseIngredientLine('1/2 TL Salz')).toEqual({ name: 'Salz', quantity: 0.5, unit: 'TL' });
    expect(parseIngredientLine('1 1/2 EL Öl')).toEqual({ name: 'Öl', quantity: 1.5, unit: 'EL' });
    expect(parseIngredientLine('½ Bund Petersilie')).toEqual({ name: 'Petersilie', quantity: 0.5, unit: 'Bund' });
    expect(parseIngredientLine('2 Zehen Knoblauch')).toEqual({ name: 'Knoblauch', quantity: 2, unit: 'Zehe' });
    expect(parseIngredientLine('2-3 Karotten')).toEqual({ name: 'Karotten', quantity: 3, unit: '' });
  });

  it('keeps lines without amounts and drops bullets', () => {
    expect(parseIngredientLine('- Pfeffer')).toEqual({ name: 'Pfeffer', quantity: null, unit: '' });
    expect(parseIngredientLine('• 2 Zwiebeln, gehackt')).toEqual({ name: 'Zwiebeln, gehackt', quantity: 2, unit: '' });
    expect(parseIngredientLine('   ')).toBeNull();
  });

  it('parses a pasted block and ignores empty lines', () => {
    expect(parseIngredientList('500 g Spaghetti\n\nSalz\n2 Stk. Eier').map((i) => i.name)).toEqual([
      'Spaghetti',
      'Salz',
      'Eier',
    ]);
  });

  it('splits steps by blank lines or single lines and strips numbering', () => {
    expect(parseStepList('1. Wasser kochen\n2) Nudeln dazugeben')).toEqual([
      'Wasser kochen',
      'Nudeln dazugeben',
    ]);
    expect(parseStepList('Schritt 1: Teig kneten,\n30 Min. ruhen lassen.\n\nSchritt 2: Backen.')).toEqual([
      'Teig kneten, 30 Min. ruhen lassen.',
      'Backen.',
    ]);
  });
});
