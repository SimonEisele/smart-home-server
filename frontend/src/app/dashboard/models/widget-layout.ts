import { DashboardItem } from './dashboard.models';
import { WIDGET_REGISTRY } from '../../widgets/widgets.registry';

/** Keep saved layouts readable and move only cards that would overlap after resizing. */
export function normalizeWidgetLayout(items: DashboardItem[], columns = 12): DashboardItem[] {
  const placed: DashboardItem[] = [];
  for (const source of items) {
    const def = WIDGET_REGISTRY.find(widget => widget.type === source.widget_type);
    const minCols = def?.minCols ?? 3;
    const minRows = def?.minRows ?? 5;
    const maxCols = Math.min(columns, def?.maxCols ?? columns);
    const maxRows = def?.maxRows ?? 24;
    const cols = Math.max(minCols, Math.min(maxCols, source.cols || minCols));
    const rows = Math.max(minRows, Math.min(maxRows, source.rows || minRows));
    const item = { ...source, cols, rows,
      x: Math.max(0, Math.min(columns - cols, source.x || 0)),
      y: Math.max(0, source.y || 0),
      minItemCols: minCols, minItemRows: minRows, maxItemCols: maxCols, maxItemRows: maxRows,
      title: source.title || def?.title, icon: source.icon || def?.icon,
    };
    let collision: DashboardItem | undefined;
    while ((collision = placed.find(other => item.x < other.x + other.cols && item.x + item.cols > other.x && item.y < other.y + other.rows && item.y + item.rows > other.y))) {
      item.y = collision.y + collision.rows;
    }
    placed.push(item);
  }
  return placed;
}

/** First position (top to bottom, left to right) where a card of this size fits without overlap. */
export function findFreeSpot(items: DashboardItem[], cols: number, rows: number, columns = 12): { x: number; y: number } {
  const width = Math.min(cols, columns);
  const bottom = items.reduce((max, item) => Math.max(max, item.y + item.rows), 0);
  for (let y = 0; y <= bottom; y++) {
    for (let x = 0; x + width <= columns; x++) {
      const overlaps = items.some(other => x < other.x + other.cols && x + width > other.x && y < other.y + other.rows && y + rows > other.y);
      if (!overlaps) return { x, y };
    }
  }
  return { x: 0, y: bottom };
}
