import { DateTimeWidget } from "../features/datetime/widget/datetime";
import { MenuplanWidget } from "../features/menuplan/widget/menuplan.widget";
import { NotesWidget } from "../features/notes/widget/notes.widget";
import { TodosWidget } from "../features/todos/widget/todos.widget";
import { WeatherWidget } from "../features/weather/widget/weather.widget";

export interface WidgetDefinition {
  type: string;
  title: string;
  icon: string;
  component: any;
  defaultCols: number;
  defaultRows: number;
  minCols: number;
  maxCols?: number;
  minRows: number;
  maxRows?: number;
}

export const WIDGET_REGISTRY: WidgetDefinition[] = [
  {
    type: 'todos',
    title: "ToDo's",
    icon: 'todo.svg',
    component: TodosWidget,
    defaultCols: 3,
    defaultRows: 8,
    minCols: 2,
    minRows: 4,
  },
  {
    type: 'notes',
    title: "Notizen",
    icon: 'notes.svg',
    component: NotesWidget,
    defaultCols: 3,
    defaultRows: 8,
    minCols: 2,
    minRows: 4,
  },
  {
    type: 'weather',
    title: 'Wetter',
    icon: 'weather.svg',
    component: WeatherWidget,
    defaultCols: 4,
    defaultRows: 8,
    minCols: 2,
    minRows: 8,
  },
  {
    type: 'datetime',
    title: 'Datum und Uhrzeit',
    icon: 'datetime.svg',
    component: DateTimeWidget,
    defaultCols: 3,
    defaultRows: 4,
    minCols: 3,
    minRows: 4,
  },
  {
    type: 'menuplan',
    title: 'Menüplan',
    icon: 'menuplan.svg',
    component: MenuplanWidget,
    defaultCols: 9,
    defaultRows: 4,
    minCols: 2,
    minRows: 4,
  }
];
