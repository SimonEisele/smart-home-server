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
