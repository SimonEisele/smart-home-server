import { normalizeWidgetLayout } from './widget-layout';
import { DashboardItem } from './dashboard.models';

const card = (id: string, type: string, x: number, y: number, cols: number, rows: number): DashboardItem => ({ id, widget_type: type, x, y, cols, rows, minItemCols: 1, minItemRows: 1, config: {} });
it('upgrades undersized saved cards and moves overlapping cards without losing identities or configuration', () => {
  const source = [card('weather', 'weather', 0, 0, 2, 2), card('tasks', 'todos', 0, 2, 3, 4)];
  source[0].config = { location: 'Biel' }; source[0].minItemRows = 1;
  const items = normalizeWidgetLayout(source);
  expect(items[0].cols).toBe(3); expect(items[0].rows).toBe(5);
  expect(items[1].y).toBe(5); expect(items[1].rows).toBe(5);
  expect(items.map(item => item.id)).toEqual(['weather', 'tasks']);
  expect(items[0].config).toEqual({ location: 'Biel' });
  expect(source[0].rows).toBe(2);
});
it('preserves usable saved positions and bounds wide cards to the dashboard width', () => {
  const items = normalizeWidgetLayout([card('clock', 'datetime', 0, 0, 3, 4), card('menu', 'menuplan', 18, 5, 20, 8)]);
  expect(items[0]).toMatchObject({ x: 0, y: 0, cols: 3, rows: 4 });
  expect(items[1]).toMatchObject({ x: 0, y: 5, cols: 12, rows: 8 });
});
