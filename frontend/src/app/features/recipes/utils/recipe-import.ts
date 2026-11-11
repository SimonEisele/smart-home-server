import { INGREDIENT_UNITS } from '../../ingredients/model/ingredient.model';

export interface ParsedIngredient {
  name: string;
  quantity: number | null;
  unit: string;
}

const UNIT_ALIASES: Record<string, string> = {
  gramm: 'g',
  gr: 'g',
  'gr.': 'g',
  kilogramm: 'kg',
  kilo: 'kg',
  milliliter: 'ml',
  liter: 'l',
  stk: 'Stück',
  'stk.': 'Stück',
  stück: 'Stück',
  stueck: 'Stück',
  el: 'EL',
  'el.': 'EL',
  esslöffel: 'EL',
  tl: 'TL',
  'tl.': 'TL',
  teelöffel: 'TL',
  prisen: 'Prise',
  bunde: 'Bund',
  zehen: 'Zehe',
  dosen: 'Dose',
  packungen: 'Packung',
  pck: 'Packung',
  'pck.': 'Packung',
  päckchen: 'Packung',
  becher: 'Becher',
  scheiben: 'Scheibe',
  stangen: 'Stange',
  köpfe: 'Kopf',
};

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '¼': 0.25,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 0.125,
};

function resolveUnit(token: string): string | null {
  const key = token.toLocaleLowerCase('de');
  if (UNIT_ALIASES[key]) return UNIT_ALIASES[key];
  return INGREDIENT_UNITS.find((unit) => unit && unit.toLocaleLowerCase('de') === key) ?? null;
}

/** Parses "1 1/2", "1,5", "½", "2-3" (uses the upper bound) into a number. */
function parseQuantity(token: string): number | null {
  let text = token.trim();
  for (const [symbol, value] of Object.entries(UNICODE_FRACTIONS)) {
    text = text.replace(new RegExp(`(\\d)?\\s*${symbol}`), (_m, whole) =>
      String((whole ? Number(whole) : 0) + value),
    );
  }
  const range = text.match(/^(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)$/);
  if (range) text = range[2];
  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = text.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[2]) ? Number(fraction[1]) / Number(fraction[2]) : null;
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

const QUANTITY = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d*\s*[½¼¾⅓⅔⅛]|\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?)`;

/**
 * One ingredient per line, as copied from a cookbook or website:
 * "200 g Mehl", "1/2 TL Salz", "2 Zwiebeln, gehackt", "Pfeffer".
 * Bullets and checkboxes in front of the line are ignored.
 */
export function parseIngredientLine(raw: string): ParsedIngredient | null {
  let line = raw.replace(/^\s*(?:[-*•·▢□☐]|\d+[.)](?=\s))\s*/, '').trim();
  if (!line) return null;
  let quantity: number | null = null;
  let unit = '';
  const leading = line.match(new RegExp(`^(${QUANTITY})\\s*(.*)$`));
  if (leading && leading[2]) {
    quantity = parseQuantity(leading[1]);
    line = leading[2].trim();
    const [first, ...rest] = line.split(/\s+/);
    const known = rest.length ? resolveUnit(first) : null;
    if (known) {
      unit = known;
      line = rest.join(' ');
    }
  }
  const name = line.replace(/\s+/g, ' ').trim();
  return name ? { name, quantity, unit } : null;
}

export function parseIngredientList(text: string): ParsedIngredient[] {
  return text
    .split(/\r?\n/)
    .map(parseIngredientLine)
    .filter((item): item is ParsedIngredient => item !== null);
}

/**
 * Steps are separated by blank lines; when there are none, each line is a step.
 * Leading numbering such as "1.", "2)" or "Schritt 3:" is removed.
 */
export function parseStepList(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const blocks = /\n\s*\n/.test(normalized) ? normalized.split(/\n\s*\n/) : normalized.split('\n');
  return blocks
    .map((block) =>
      block
        .replace(/^\s*(?:schritt\s*)?\d+\s*[.):]\s*/i, '')
        .replace(/^\s*[-*•]\s*/, '')
        .replace(/\s*\n\s*/g, ' ')
        .trim(),
    )
    .filter(Boolean);
}
