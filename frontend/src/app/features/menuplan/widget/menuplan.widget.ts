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
  todayStr = new Date().toISOString().split('T')[0];

  readonly GAP = 10;
  readonly MENU_WIDTH = 148;
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
    const weekStart = this.getWeekStartIso(new Date());
    const weekEnd = this.getWeekEndIso(new Date());
    this.authService.user$.subscribe(user => {
      if (user?.active_household_id) {
        const hh = user.households.find(h => h.id === user.active_household_id);
        this.householdMemberCount = hh?.member_count ?? 2;
      }
      this.cdr.detectChanges();
    });
    this.menuService.getMenus(weekStart, 7).subscribe(menus => {
      this.menus = menus;
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
      setTimeout(() => { this.updateVisibleData(); this.cdr.detectChanges(); });
    });
    observer.observe(this.container.nativeElement);
    setTimeout(() => { this.updateVisibleData(); this.cdr.detectChanges(); });
  }

  updateVisibleData(): void {
    if (!this.menus?.length) return;
    const width = this.container.nativeElement.clientWidth;
    if (width <= 0) return;
    const count = Math.max(1, Math.floor((width + this.GAP) / (this.MENU_WIDTH + this.GAP)));
    this.visibleMenus = this.menus.slice(0, count);
  }

  // ── Next cook slot ──────────────────────────────────────────────────────
  get nextCookSlot(): CookSlot | null {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
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
    // Opt-in: count only members explicitly marked present + external guests for this meal
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

  private getWeekStartIso(input: Date): string {
    const d = new Date(input);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1) - day);
    return d.toISOString().split('T')[0];
  }

  private getWeekEndIso(input: Date): string {
    const d = new Date(input);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? 0 : 7) - day);
    return d.toISOString().split('T')[0];
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
