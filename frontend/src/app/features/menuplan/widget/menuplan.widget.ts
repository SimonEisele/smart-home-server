import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Menu } from '../model/menuplan.model';
import { MenuService } from '../service/menuplan.service';
import { CalendarService } from '../../calendar/service/calendar.service';
import { UserMealAttendance, ExternalMealGuest } from '../../calendar/model/calendar.model';
import { Recipe } from '../../recipes/model/recipes.model';
import { RecipeCookService, CookSlot } from '../../../shared/services/recipe-cook.service';
import { AuthService } from '../../../core/auth/service/auth.service';

type MealType = 'breakfast' | 'lunch' | 'dinner';

@Component({
  selector: 'menuplan-widget',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './menuplan.widget.html',
  styleUrl: './menuplan.widget.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuplanWidget implements OnInit, AfterViewInit {
  @ViewChild('container', { static: true })
  container!: ElementRef<HTMLDivElement>;

  menus: Menu[] = [];
  visibleMenus: Menu[] = [];
  mealAttendances: UserMealAttendance[] = [];
  externalGuests: ExternalMealGuest[] = [];
  householdMemberCount = 2;
  todayStr = this.toIso(new Date());
  weekMaxHeight = 0;

  readonly GAP = 10;
  readonly MENU_WIDTH = 148;
  readonly MENU_HEIGHT = 118;
  readonly DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  readonly MEAL_LABELS: Record<string, string> = { breakfast: 'Morgen', lunch: 'Mittag', dinner: 'Abend' };

  constructor(
    private menuService: MenuService,
    private calendarService: CalendarService,
    private cookService: RecipeCookService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const startDate = new Date();
    const weekStart = this.toIso(startDate);
    const weekEnd = this.toIso(this.addDays(startDate, 6));

    this.authService.user$.subscribe(user => {
      if (user?.active_household_id) {
        const hh = user.households.find(h => h.id === user.active_household_id);
        this.householdMemberCount = hh?.member_count ?? 2;
      }
      this.cdr.detectChanges();
    });

    this.menuService.getMenus(weekStart, 7).subscribe(menus => {
      const menusByDate = new Map(
        menus
          .filter(menu => menu.date >= weekStart)
          .map(menu => [menu.date, menu]),
      );

      this.menus = Array.from({ length: 7 }, (_, index) => {
        const date = this.toIso(this.addDays(startDate, index));
        return menusByDate.get(date) ?? { id: `empty-${date}`, date };
      });

      this.updateVisibleData();
      this.cdr.detectChanges();
    });

    this.calendarService.getMealAttendance(weekStart, weekEnd).subscribe(att => {
      this.mealAttendances = att;
      this.cdr.detectChanges();
    });

    this.calendarService.getExternalGuests(weekStart, weekEnd).subscribe(guests => {
      this.externalGuests = guests;
      this.cdr.detectChanges();
    });
  }

  ngAfterViewInit(): void {
    const observer = new ResizeObserver(() => {
      setTimeout(() => {
        this.updateVisibleData();
        this.cdr.detectChanges();
      });
    });
    observer.observe(this.container.nativeElement);

    setTimeout(() => {
      this.updateVisibleData();
      this.cdr.detectChanges();
    });
  }

  updateVisibleData(): void {
    const width = this.container.nativeElement.clientWidth;
    const height = this.container.nativeElement.clientHeight;
    if (width <= 0 || height <= 0) return;

    const columns = Math.max(1, Math.floor((width + this.GAP) / (this.MENU_WIDTH + this.GAP)));
    const bannerHeight = this.nextCookSlot ? 58 : 0;
    const availableHeight = Math.max(this.MENU_HEIGHT, height - bannerHeight);
    const rows = Math.max(1, Math.floor((availableHeight + this.GAP) / (this.MENU_HEIGHT + this.GAP)));

    this.weekMaxHeight = availableHeight;
    this.visibleMenus = this.menus.slice(0, columns * rows);
  }

  // ── Next cook slot ──────────────────────────────────────────────────────
  get nextCookSlot(): CookSlot | null {
    const today = new Date();
    const todayStr = this.toIso(today);
    const hour = today.getHours();
    const cutoffs: Record<string, number> = { breakfast: 10, lunch: 14, dinner: 25 };
    const sorted = [...this.menus].sort((a, b) => a.date.localeCompare(b.date));

    for (const menu of sorted) {
      if (menu.date < todayStr) continue;
      for (const meal of ['breakfast', 'lunch', 'dinner'] as MealType[]) {
        if (menu.date === todayStr && (cutoffs[meal] ?? 25) <= hour) continue;
        const recipe = this.menuRecipe(menu, meal);
        if (!recipe) continue;
        const persons = this.attendanceCount(menu.date, meal);
        return { date: menu.date, meal, recipe, persons, weekTag: this.getWeekTag(new Date(menu.date)) };
      }
    }
    return null;
  }

  menuRecipe(menu: Menu, meal: MealType): Recipe | null {
    if (meal === 'breakfast') return menu.breakfastRecipe ?? null;
    if (meal === 'lunch') return menu.lunchRecipe ?? null;
    return menu.dinnerRecipe ?? null;
  }

  attendanceCount(dateStr: string, meal: MealType): number {
    const presentMembers = this.mealAttendances.filter(a => {
      if (a.date !== dateStr) return false;
      if (meal === 'breakfast') return a.breakfastPresent;
      if (meal === 'lunch') return a.lunchPresent;
      return a.dinnerPresent;
    }).length;
    const guestCount = this.externalGuests.filter(g => g.date === dateStr && g.meal === meal).length;
    return Math.max(1, presentMembers + guestCount);
  }

  // ── Cook popup ──────────────────────────────────────────────────────────
  startCooking(slot: CookSlot): void {
    this.cookService.open(slot);
  }

  scaledIngredients(recipe: Recipe, persons: number): Array<{ name: string; qty: string; unit: string }> {
    const base = recipe.baseServings || persons || 2;
    const scale = persons / base;
    return (recipe.ingredients || []).map(ing => {
      const q = ing.quantityPerPerson != null ? ing.quantityPerPerson * scale : null;
      const fmtQty = q != null ? (Math.round(q * 100) / 100).toString().replace(/\.?0+$/, '') : '';
      return { name: ing.name, qty: fmtQty, unit: ing.unit || '' };
    });
  }

  addToShoppingList(slot: { menu: Menu; meal: MealType; recipe: Recipe; persons: number }): void {
    const weekTag = this.getWeekTag(new Date(slot.menu.date));
    this.menuService.exportMeal(slot.menu.date, slot.meal, weekTag).subscribe();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  dayName(dateStr: string): string {
    return this.DAY_NAMES[new Date(dateStr).getDay()];
  }

  dayDate(dateStr: string): string {
    const d = new Date(dateStr);
    return `${d.getDate()}.${d.getMonth() + 1}.`;
  }

  formatRef(ref: string): string {
    if (!ref) return '';
    const [dateStr, meal] = ref.split(':');
    const d = new Date(dateStr);
    return `Reste: ${this.DAY_NAMES[d.getDay()]}. ${this.MEAL_LABELS[meal] ?? meal}`;
  }

  private addDays(input: Date, days: number): Date {
    const result = new Date(input);
    result.setDate(result.getDate() + days);
    return result;
  }

  private toIso(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getWeekTag(d: Date): string {
    const thu = new Date(d);
    thu.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1) + 3);
    const year = thu.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const week = Math.ceil(((thu.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }
}
