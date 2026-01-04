export interface DashboardItem {
  id: string;
  widget_type: string;
  x: number;
  y: number;
  cols: number;
  minItemCols: number;
  maxItemCols?: number;
  rows: number;
  minItemRows: number;
  maxItemRows?: number;
  title?: string;
  icon?: string;
  config?: any;
}
