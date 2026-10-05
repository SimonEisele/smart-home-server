import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import { localIsoDate } from '../../../shared/date-utils';
import { Component, HostListener, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MenuService } from '../service/menuplan.service';
import { Menu } from '../model/menuplan.model';
import { RecipesService } from '../../recipes/service/recipes.service';
import { Recipe } from '../../recipes/model/recipes.model';
import { ShoppinglistService, MenuExportPlan, MenuExportRequest } from '../../shoppinglist/service/shoppinglist.service';

export type MealType = 'breakfast' | 'lunch' | 'dinner';
export type PickerMode = MealType | 'extra';

interface DayEntry { date: Date; dateStr: string; isToday: boolean; }

@Component({
  selector: 'app-menuplan-page',
  standalone: true,
  imports: [DialogDirective, CommonModule, FormsModule, RouterLink],
  templateUrl: './menuplan.page.html',
  styleUrl: './menuplan.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuplanPage implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute, {optional:true});
  private openExportAfterLoad = false;
  private loadRevision = 0;
  private previewRevision = 0;
  loading = false;
  loadError = '';
  preview: MenuExportPlan | null = null;
  previewLoading = false;
  exportError = '';
  exportApplied = false;
  exportStep: 'selection' | 'preview' = 'selection';
  extraServings: Record<string, number> = {};
  weekStart!: Date;
  days: DayEntry[] = [];
  recipes: Recipe[] = [];
  menus: Record<string, Menu> = {};

  activePicker: { dateStr: string; meal: PickerMode } | null = null;
  pickerTab: 'recipe' | 'leftovers' = 'recipe';
  pickerSearch = '';
  leftoverDays: DayEntry[] = [];
  leftoverMenus: Record<string, Menu> = {};

  // ── Export modal state ──────────────────────────────────────────────
  showExportModal = false;
  menuSaving = false;
  menuError = '';
  exporting = false;
  exportWeekStart = '';
  exportMenus: Menu[] = [];
  exportSelected = new Set<string>();
  exportLoading = false;
  exportDone = '';

  readonly DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  readonly MEAL_LABELS: Record<string, string> = { breakfast: 'Frühstück', lunch: 'Mittagessen', dinner: 'Abendessen', extra: 'Extra' };
  readonly MEALS: MealType[] = ['breakfast', 'lunch', 'dinner'];
  readonly RECIPE_CATEGORY_LABELS: Record<string, string> = {
    mahlzeit: 'Mahlzeit', dessert: 'Dessert', backen: 'Backen',
    snack: 'Snack', beilage: 'Beilage', sonstiges: 'Sonstiges',
  };

  constructor(
    private menuService: MenuService,
    private recipesService: RecipesService,
    private shoppingService: ShoppinglistService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.openExportAfterLoad = this.route?.snapshot?.queryParamMap?.get('export')==='true';
    this.initWeek(new Date());
    this.exportWeekStart = this.toIsoDate(this.weekStart);
    this.loadWeek();
  }

  // ── Week navigation ──────────────────────────────────────────────────
  initWeek(date: Date): void {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1) - day);
    this.weekStart = d;
    const todayStr = this.toIsoDate(new Date());
    this.days = Array.from({ length: 7 }, (_, i) => {
      const di = new Date(d);
      di.setDate(d.getDate() + i);
      const dateStr = this.toIsoDate(di);
      return { date: di, dateStr, isToday: dateStr === todayStr };
    });
  }

  prevWeek(): void { if (this.menuSaving) return; const d = new Date(this.weekStart); d.setDate(d.getDate() - 7); this.initWeek(d); this.loadWeek(); }
  nextWeek(): void { if (this.menuSaving) return; const d = new Date(this.weekStart); d.setDate(d.getDate() + 7); this.initWeek(d); this.loadWeek(); }

  goToday(): void { if (this.menuSaving) return; this.initWeek(new Date()); this.loadWeek(); }
  get plannedCount(): number { return this.days.reduce((n,d)=>n+this.MEALS.filter(m=>this.getMealRecipe(d.dateStr,m)||this.getMealLeftoversRef(d.dateStr,m)).length,0); }
  get extrasCount(): number { return this.days.reduce((n,d)=>n+this.getExtras(d.dateStr).length,0); }
  get exportExtras(): Array<{key:string;date:string;recipe:Recipe}> {
    return this.exportMenus.filter(m=>m.date<=this.exportDays[6]?.dateStr).flatMap(m=>(m.extraRecipes??[]).map(recipe=>({key:`${m.date}:extra:${recipe.id}`,date:m.date,recipe})));
  }
  exportDayHasRecipes(date:string): boolean {return this.MEALS.some(m=>this.exportMealRecipe(date,m))||this.exportExtras.some(e=>e.date===date);}
  get selectedKeys(): string[] { return [...this.exportSelected].sort(); }
  get exportPayload(): MenuExportRequest { return {weekStart:this.exportWeekStart,meals:this.selectedKeys,extraServings:{...this.extraServings},strict:true,resetExisting:true}; }

  get weekRange(): string {
    if (!this.days.length) return '';
    const a = this.days[0].date, b = this.days[6].date;
    const fmt = (dt: Date) => `${dt.getDate()}.${dt.getMonth() + 1}.`;
    return `${fmt(a)} – ${fmt(b)}${b.getFullYear()}`;
  }

  // ── Meal accessors ───────────────────────────────────────────────────
  getMealRecipe(dateStr: string, meal: MealType): Recipe | null {
    const m = this.menus[dateStr];
    if (!m) return null;
    if (meal === 'breakfast') return m.breakfastRecipe ?? null;
    if (meal === 'lunch') return m.lunchRecipe ?? null;
    return m.dinnerRecipe ?? null;
  }

  getMealPersons(dateStr: string, meal: MealType): number {
    const m = this.menus[dateStr];
    if (!m) return 0;
    if (meal === 'breakfast') return m.breakfastPersons ?? 0;
    if (meal === 'lunch') return m.lunchPersons ?? 0;
    return m.dinnerPersons ?? 0;
  }

  /** How many people will eat THIS meal's leftovers (from other meals in the current week) */
  getMealLeftoverPersons(dateStr: string, meal: MealType): number {
    const ref = `${dateStr}:${meal}`;
    let total = 0;
    for (const m of Object.values({...this.leftoverMenus,...this.menus})) {
      for (const cm of this.MEALS) {
        const cmRef = cm === 'breakfast' ? m.breakfastLeftoversRef
                    : cm === 'lunch'     ? m.lunchLeftoversRef
                    :                     m.dinnerLeftoversRef;
        if (cmRef === ref) {
          total += cm === 'breakfast' ? (m.breakfastPersons ?? 0)
                 : cm === 'lunch'     ? (m.lunchPersons ?? 0)
                 :                     (m.dinnerPersons ?? 0);
        }
      }
    }
    return total;
  }

  getMealEffectivePersons(dateStr: string, meal: MealType): number {
    return this.getMealPersons(dateStr, meal) + this.getMealLeftoverPersons(dateStr, meal);
  }

  getMealLeftoversRef(dateStr: string, meal: MealType): string | null {
    const m = this.menus[dateStr];
    if (!m) return null;
    if (meal === 'breakfast') return m.breakfastLeftoversRef ?? null;
    if (meal === 'lunch') return m.lunchLeftoversRef ?? null;
    return m.dinnerLeftoversRef ?? null;
  }

  private getLeftoverMealRecipe(dateStr: string, meal: MealType): Recipe | null {
    const m = this.leftoverMenus[dateStr];
    if (!m) return null;
    if (meal === 'breakfast') return m.breakfastRecipe ?? null;
    if (meal === 'lunch') return m.lunchRecipe ?? null;
    return m.dinnerRecipe ?? null;
  }

  formatLeftoversRef(ref: string): string {
    const [dateStr, meal] = ref.split(':');
    const allDays = [...this.days, ...this.leftoverDays];
    const seen = new Set<string>();
    const uniqueDays = allDays.filter(d => { if (seen.has(d.dateStr)) return false; seen.add(d.dateStr); return true; });
    const entry = uniqueDays.find(d => d.dateStr === dateStr);
    const dayName = entry
      ? `${this.DAY_NAMES[entry.date.getDay()]}. ${entry.date.getDate()}.${entry.date.getMonth() + 1}.`
      : dateStr;
    return `Reste: ${dayName} ${this.MEAL_LABELS[meal as MealType] ?? meal}`;
  }

  // ── Picker ───────────────────────────────────────────────────────────
  openPicker(dateStr: string, meal: PickerMode): void {
    if (this.menuSaving || this.loading || this.loadError) return;
    this.menuError = "";
    this.activePicker = { dateStr, meal };
    this.pickerTab = 'recipe';
    this.pickerSearch = '';
  }

  closePicker(): void { if (this.menuSaving) return; this.activePicker = null; }

  onPickerBackdropClick(e: MouseEvent): void { if (e.target === e.currentTarget) this.closePicker(); }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.activePicker) this.closePicker();
    else if (this.showExportModal) this.closeExportModal();
  }

  get pickerDayLabel(): string {
    if (!this.activePicker) return '';
    const entry = this.days.find(d => d.dateStr === this.activePicker!.dateStr);
    if (!entry) return '';
    return `${this.DAY_NAMES[entry.date.getDay()]}., ${entry.date.getDate()}.${entry.date.getMonth() + 1}.`;
  }

  get filteredRecipes(): Recipe[] {
    const q = this.pickerSearch.toLowerCase();
    const isExtra = this.activePicker?.meal === 'extra';
    const byCategory = isExtra
      ? this.recipes.filter(r => r.category && r.category !== 'mahlzeit')
      : this.recipes.filter(r => !r.category || r.category === 'mahlzeit');
    if (!q) return byCategory;
    return byCategory.filter(r =>
      r.name.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q)
    );
  }

  get leftoversOptions(): Array<{ ref: string; label: string; recipeName: string }> {
    if (!this.activePicker) return [];
    const { dateStr: cd, meal: cm } = this.activePicker;
    const result: Array<{ ref: string; label: string; recipeName: string }> = [];
    const seen = new Set<string>();

    // Prefer this.menus (fresh, updated on every upsert) over leftoverMenus (loaded once)
    const allMenuEntries: Array<[string, Menu]> = [
      ...Object.entries(this.menus),
      ...Object.entries(this.leftoverMenus),
    ];

    for (const [dateStr, m] of allMenuEntries) {
      const date = new Date(`${dateStr}T12:00:00`); // noon avoids timezone day-shift
      for (const meal of this.MEALS) {
        const key = `${dateStr}:${meal}`;
        const order = this.MEALS.indexOf(meal), targetOrder = this.MEALS.indexOf(cm as MealType);
        const age = (new Date(cd+'T12:00:00').getTime()-date.getTime())/86400000;
        if (age<0 || age>7 || (dateStr===cd && order>=targetOrder)) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        let recipe: Recipe | null = null;
        if (meal === 'breakfast') recipe = m.breakfastRecipe ?? null;
        else if (meal === 'lunch') recipe = m.lunchRecipe ?? null;
        else recipe = m.dinnerRecipe ?? null;
        if (!recipe) continue;
        result.push({
          ref: key,
          label: `${this.DAY_NAMES[date.getDay()]}. ${date.getDate()}.${date.getMonth() + 1}. – ${this.MEAL_LABELS[meal]}`,
          recipeName: recipe.name,
        });
      }
    }

    result.sort((a, b) => b.ref.localeCompare(a.ref)); // newest first
    return result;
  }

  selectRecipe(recipe: Recipe): void {
    if (!this.activePicker) return;
    const { dateStr, meal } = this.activePicker;
    if (meal === 'extra') {
      this.addExtra(dateStr, recipe.id, () => this.closePicker());
    } else {
      this.upsertMenu(dateStr, this.mealPatch(meal as MealType, recipe.id, null), () => this.closePicker());
    }
  }

  selectLeftovers(ref: string): void {
    if (!this.activePicker) return;
    const { dateStr, meal } = this.activePicker;
    this.upsertMenu(dateStr, this.mealPatch(meal as MealType, null, ref), () => this.closePicker());
  }

  clearMeal(dateStr: string, meal: MealType, e: MouseEvent): void {
    e.stopPropagation();
    const existing = this.menus[dateStr];
    if (!existing?.id) return;
    this.upsertMenu(dateStr, this.mealPatch(meal, null, null));
  }

  getExtras(dateStr: string): Recipe[] {
    return this.menus[dateStr]?.extraRecipes ?? [];
  }

  addExtra(dateStr: string, recipeId: string, onSaved?: () => void): void {
    const ids = [...(this.menus[dateStr]?.extraRecipeIds ?? [])].filter(id => id !== recipeId);
    ids.push(recipeId);
    this.upsertMenu(dateStr, { extraRecipeIds: ids }, onSaved);
  }

  removeExtra(dateStr: string, recipeId: string, e: MouseEvent): void {
    e.stopPropagation();
    const ids = (this.menus[dateStr]?.extraRecipeIds ?? []).filter(id => id !== recipeId);
    this.upsertMenu(dateStr, { extraRecipeIds: ids });
  }

  private mealPatch(meal: MealType, recipeId: string | null, ref: string | null): Partial<Menu> {
    if (meal === 'breakfast') return { breakfastRecipeId: recipeId, breakfastLeftoversRef: ref };
    if (meal === 'lunch')     return { lunchRecipeId: recipeId,      lunchLeftoversRef: ref };
    return                           { dinnerRecipeId: recipeId,     dinnerLeftoversRef: ref };
  }

  // ── Export modal ─────────────────────────────────────────────────────
  get exportDays(): Array<{ date: Date; dateStr: string }> {
    if (!this.exportWeekStart) return [];
    const d = new Date(this.exportWeekStart+'T12:00:00');
    return Array.from({ length: 7 }, (_, i) => {
      const di = new Date(d); di.setDate(d.getDate() + i);
      return { date: di, dateStr: this.toIsoDate(di) };
    });
  }

  get exportWeekRange(): string {
    const days = this.exportDays;
    if (!days.length) return '';
    const fmt = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.`;
    return `${fmt(days[0].date)} – ${fmt(days[6].date)}${days[6].date.getFullYear()}`;
  }

  openExportModal(): void {
    if (this.loading || this.loadError || this.menuSaving) return;
    this.exportWeekStart = this.toIsoDate(this.weekStart);
    this.exportDone=''; this.exportError=''; this.exportApplied=false; this.preview=null; this.exportStep='selection';
    this.showExportModal=true; this.loadExportMenus();
  }
  closeExportModal(): void { if (this.exporting) return; this.showExportModal=false; this.previewRevision++; }
  onExportBackdropClick(e: MouseEvent): void { if (e.target===e.currentTarget) this.closeExportModal(); }
  loadExportMenus(): void {
    const revision=++this.previewRevision;
    this.exportLoading=true; this.exportError=''; this.exportSelected=new Set();
    // Fetch the following week too, so leftover portions across Sunday count.
    this.menuService.getMenus(this.exportWeekStart,14).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({next:menus=>{
      if (revision!==this.previewRevision) return;
      this.exportMenus=menus;
      const last=this.exportDays[6].dateStr;
      for (const m of menus.filter(m=>m.date<=last)) {
        for (const meal of this.MEALS) if (this.exportMealRecipe(m.date,meal) && this.exportMealEffectivePersons(m.date,meal)>0) this.exportSelected.add(`${m.date}:${meal}`);
        for (const recipe of m.extraRecipes??[]) {
          const key=`${m.date}:extra:${recipe.id}`; this.exportSelected.add(key); this.extraServings[key]=recipe.baseServings??4;
        }
      }
      this.exportLoading=false;this.refreshPreview();this.cdr.markForCheck();
    },error:()=>{if(revision!==this.previewRevision)return;this.exportLoading=false;this.exportError='Der Menüplan konnte nicht geladen werden. Bitte erneut versuchen.';this.cdr.markForCheck();}});
  }
  refreshPreview(): void {
    const revision=++this.previewRevision;
    this.preview=null;this.exportDone='';this.exportError='';this.exportApplied=false;
    if (!this.exportSelected.size) {this.previewLoading=false;return;}
    this.previewLoading=true;
    this.shoppingService.previewMenuplan(this.exportPayload).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({next:plan=>{
      if(revision!==this.previewRevision)return;this.preview=plan;this.previewLoading=false;this.cdr.markForCheck();
    },error:()=>{if(revision!==this.previewRevision)return;this.previewLoading=false;this.exportError='Die Zutatenvorschau konnte nicht geladen werden. Bitte Auswahl und Mengen prüfen und erneut versuchen.';this.cdr.markForCheck();}});
  }
  toggleExportKey(key:string): void {
    if(this.exporting)return;const selected=new Set(this.exportSelected);
    if(selected.has(key))selected.delete(key);else selected.add(key);this.exportSelected=selected;this.refreshPreview();
  }
  setExtraServings(key:string,value:number): void {if(this.exporting)return;this.extraServings={...this.extraServings,[key]:value};this.refreshPreview();}
  selectAllExport(selected:boolean): void {
    if(this.exporting)return;this.exportSelected=new Set();
    if(selected)for(const d of this.exportDays) {
      for(const meal of this.MEALS)if(this.exportMealRecipe(d.dateStr,meal)&&this.exportMealEffectivePersons(d.dateStr,meal)>0)this.exportSelected.add(`${d.dateStr}:${meal}`);
      for(const extra of this.exportExtras.filter(e=>e.date===d.dateStr))this.exportSelected.add(extra.key);
    }
    this.refreshPreview();
  }

  exportMealRecipe(dateStr: string, meal: MealType): Recipe | null {
    const m = this.exportMenus.find(m => m.date === dateStr);
    if (!m) return null;
    if (meal === 'breakfast') return m.breakfastRecipe ?? null;
    if (meal === 'lunch')     return m.lunchRecipe ?? null;
    return m.dinnerRecipe ?? null;
  }

  exportMealPersons(dateStr: string, meal: MealType): number {
    const m = this.exportMenus.find(m => m.date === dateStr);
    if (!m) return 0;
    if (meal === 'breakfast') return m.breakfastPersons ?? 0;
    if (meal === 'lunch')     return m.lunchPersons ?? 0;
    return m.dinnerPersons ?? 0;
  }

  /** How many people will eat this meal's LEFTOVERS (from other meals referencing it) */
  exportMealLeftoverPersons(dateStr: string, meal: MealType): number {
    const ref = `${dateStr}:${meal}`;
    let total = 0;
    for (const m of this.exportMenus) {
      for (const cm of this.MEALS) {
        const cmRef = cm === 'breakfast' ? m.breakfastLeftoversRef
                    : cm === 'lunch'     ? m.lunchLeftoversRef
                    :                     m.dinnerLeftoversRef;
        if (cmRef === ref) {
          total += cm === 'breakfast' ? (m.breakfastPersons ?? 0)
                 : cm === 'lunch'     ? (m.lunchPersons ?? 0)
                 :                     (m.dinnerPersons ?? 0);
        }
      }
    }
    return total;
  }

  /** Direct attendance + people who will eat leftovers from this meal */
  exportMealEffectivePersons(dateStr: string, meal: MealType): number {
    return this.exportMealPersons(dateStr, meal) + this.exportMealLeftoverPersons(dateStr, meal);
  }

  isExportSelected(dateStr: string, meal: MealType): boolean {
    return this.exportSelected.has(`${dateStr}:${meal}`);
  }

  toggleExportMeal(dateStr:string,meal:MealType): void {this.toggleExportKey(`${dateStr}:${meal}`);}
  doExport(): void {
    if(this.exporting||this.previewLoading||!this.preview||this.preview.blocked||this.exportApplied)return;
    const payload={...this.exportPayload,previewToken:this.preview.previewToken};
    this.exporting=true;this.exportError='';
    this.shoppingService.applyMenuplan(payload).pipe(takeUntilDestroyed(this.destroyRef),finalize(()=>{this.exporting=false;this.cdr.markForCheck();})).subscribe({next:count=>{
      this.exportApplied=true;this.exportDone=`${count} Zutatenpositionen für diese Woche aktualisiert.`;
    },error:()=>{this.exportError='Der Export wurde nicht abgeschlossen. Bitte die Vorschau neu laden und erneut versuchen.';this.preview=null;}});
  }

  // Week requests are ignored after navigation to a different week.
  loadWeek(): void {
    const revision=++this.loadRevision;
    this.loading=true;this.loadError='';this.menuError='';
    const from=new Date(this.weekStart);from.setDate(from.getDate()-7);
    forkJoin({menus:this.menuService.getMenus(this.toIsoDate(from),21),recipes:this.recipesService.getRecipes()})
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({next:result=>{
        if(revision!==this.loadRevision)return;
        this.leftoverMenus=Object.fromEntries(result.menus.map(m=>[m.date,m]));
        this.menus=Object.fromEntries(result.menus.filter(m=>this.days.some(d=>d.dateStr===m.date)).map(m=>[m.date,m]));
        this.recipes=result.recipes;this.loading=false;
        if(this.openExportAfterLoad){this.openExportAfterLoad=false;this.openExportModal();}
        this.cdr.markForCheck();
      },error:()=>{if(revision!==this.loadRevision)return;this.loading=false;this.loadError='Der Menüplan konnte nicht geladen werden. Bitte erneut versuchen.';this.cdr.markForCheck();}});
  }

  private upsertMenu(dateStr: string, patch: Partial<Menu>, onSaved?: () => void): void {
    if (this.menuSaving) return;
    this.menuSaving = true; this.menuError = '';
    const existing = this.menus[dateStr];
    const request = existing?.id ? this.menuService.updateMenu(existing.id, patch) : this.menuService.createMenu({ date:dateStr, ...patch });
    request.pipe(finalize(() => { this.menuSaving = false; this.cdr.markForCheck(); })).subscribe({
      next: saved => { this.menus = { ...this.menus, [dateStr]: saved }; this.leftoverMenus = {...this.leftoverMenus,[dateStr]:saved}; this.menuSaving = false; onSaved?.(); this.cdr.markForCheck(); },
      error: error => { const detail=error.error?.detail; this.menuError = typeof detail==='string' ? detail : Array.isArray(detail) ? detail.join(' ') : 'Die Planung konnte nicht gespeichert werden. Bitte erneut versuchen.'; this.cdr.markForCheck(); },
    });
  }

  private toIsoDate(d: Date): string { return localIsoDate(d); }


}
