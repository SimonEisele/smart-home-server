import { DateTimeWidget } from "../features/datetime/widget/datetime";
import { MenuplanWidget } from "../features/menuplan/widget/menuplan.widget";
import { TodosWidget } from "../features/todos/widget/todos.widget";
import { WeatherWidget } from "../features/weather/widget/weather.widget";
import { CalendarWidget } from "../features/calendar/widget/calendar.widget";
import { ShoppinglistWidget } from "../features/shoppinglist/widget/shoppinglist.widget";

export interface WidgetDefinition {
  type: string;
  title: string;
  /** One line shown in the widget picker. */
  description: string;
  icon: string;
  /** Page the card header links to; widgets without a page have none. */
  route?: string;
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
    type: 'datetime',
    title: 'Uhr & Datum',
    description: 'Aktuelle Uhrzeit, Wochentag und Datum.',
    icon: 'datetime.svg',
    component: DateTimeWidget,
    defaultCols: 3,
    defaultRows: 4,
    minCols: 3,
    minRows: 4,
  },
  {
    type: 'calendar',
    title: 'Als Nächstes',
    description: 'Termine und fällige Reinigungsaufgaben der nächsten zwei Wochen.',
    icon: 'calendar.svg',
    route: '/calendar',
    component: CalendarWidget,
    defaultCols: 4,
    defaultRows: 8,
    minCols: 3,
    minRows: 5,
  },
  {
    type: 'weather',
    title: 'Wetter',
    description: 'Aktuelles Wetter mit Stunden- und Tagesvorschau.',
    icon: 'weather.svg',
    route: '/weather',
    component: WeatherWidget,
    defaultCols: 4,
    defaultRows: 8,
    minCols: 3,
    minRows: 5,
  },
  {
    type: 'menuplan',
    title: 'Menüplan',
    description: 'Die Mahlzeiten der nächsten sieben Tage und das nächste Rezept zum Kochen.',
    icon: 'menuplan.svg',
    route: '/menuplan',
    component: MenuplanWidget,
    defaultCols: 9,
    defaultRows: 5,
    minCols: 3,
    minRows: 5,
  },
  {
    type: 'todos',
    title: 'Offene Aufgaben',
    description: 'Deine offenen Aufgaben, direkt abhakbar.',
    icon: 'todo.svg',
    route: '/todos',
    component: TodosWidget,
    defaultCols: 3,
    defaultRows: 8,
    minCols: 3,
    minRows: 5,
  },
  {
    type: 'shoppinglist',
    title: 'Einkaufsliste',
    description: 'Artikel schnell hinzufügen und abhaken.',
    icon: 'shoppinglist.svg',
    route: '/shoppinglist',
    component: ShoppinglistWidget,
    defaultCols: 3,
    defaultRows: 8,
    minCols: 3,
    minRows: 5,
  },
];

export function widgetDefinition(type: string): WidgetDefinition | undefined {
  return WIDGET_REGISTRY.find(widget => widget.type === type);
}
