import { DialogDirective } from '../directives/dialog.directive';
import {
  Component,
  ChangeDetectorRef,
  DestroyRef,
  ElementRef,
  ViewChild,
  HostListener,
  OnInit,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RecipeCookService, CookSlot } from '../services/recipe-cook.service';
import { ShoppinglistService } from '../../features/shoppinglist/service/shoppinglist.service';
import { Recipe, RecipeIngredient, RecipeStep } from '../../features/recipes/model/recipes.model';

interface CookTimer { id: number; label: string; minutes: number; endsAt: number; remaining: number; done: boolean; }

/** What is kept when the cooking view is minimized, so a reload or a closed tab can pick it up again. */
interface CookSession {
  slot: CookSlot;
  activeTab: 'full' | 'steps';
  currentStep: number;
  selectedSection: number | null;
  checked: string[];
  completed: number[];
  timers: CookTimer[];
  finished: boolean;
  localPersons: number;
  localUnitsPerPerson: number;
  selectedServings: number;
  savedAt: number;
}

const SESSION_KEY = 'cook:session';
const SESSION_MAX_AGE = 12 * 60 * 60_000;

/** "20 Minuten", "1 Std.", "10–15 Min." → minutes (upper bound of a range). */
export function timersInText(text: string): Array<{ minutes: number; label: string }> {
  const found: Array<{ minutes: number; label: string }> = [];
  const pattern = /(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|bis)\s*(\d+(?:[.,]\d+)?))?\s*(Stunden?|Std\.?|h\b|Minuten?|Min\.?|min\b)/gi;
  for (const match of text.matchAll(pattern)) {
    const value = Number((match[2] ?? match[1]).replace(',', '.'));
    const hours = /^(stunde|std|h)/i.test(match[3]);
    const minutes = Math.round(hours ? value * 60 : value);
    if (minutes > 0 && minutes <= 24 * 60 && !found.some(t => t.minutes === minutes)) {
      found.push({ minutes, label: minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60} Std.` : `${minutes} Min.` });
    }
  }
  return found;
}

@Component({
  selector: 'recipe-cook-overlay',
  standalone: true,
  imports: [DialogDirective, CommonModule, FormsModule],
  templateUrl: './recipe-cook-overlay.html',
  styleUrl: './recipe-cook-overlay.css',
})
export class RecipeCookOverlay implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  @ViewChild('cookingBody') body?: ElementRef<HTMLElement>;
  @ViewChild('stepLaunch') stepLaunch?: ElementRef<HTMLButtonElement>;
  @ViewChild('preparation') preparation?: ElementRef<HTMLElement>;
  private revision = 0;
  private exported = new Set<string>();
  private wakeLock: { release(): Promise<void> } | null = null;
  slot: CookSlot | null = null;
  addingToShoppingList = false;
  addedMessage = '';
  exportError = '';
  activeTab: 'full' | 'steps' = 'full';
  currentStep = 0;
  selectedSection: number | null = null;
  localPersons = 1;
  localUnitsPerPerson = 1;
  selectedServings = 4;
  checkedIngredients = new Set<string>();
  completedSteps = new Set<number>();
  /** Phone/tablet portrait: which half of the overview is shown. */
  phonePane: 'ingredients' | 'steps' = 'ingredients';
  finished = false;
  /** Cooking keeps going in the background; only a small bar is shown. */
  minimized = false;
  /** The ✕ asks first when there is progress to lose. */
  confirmingEnd = false;
  /** Set when opening a recipe replaced one that was still cooking in the background. */
  replacedName = '';
  private started = false;
  timers: CookTimer[] = [];
  private timerSeq = 0;
  private timerTick: ReturnType<typeof setInterval> | null = null;
  private touchStart: { x: number; y: number } | null = null;
  readonly MEAL_LABELS: Record<string, string> = {
    breakfast: 'Frühstück',
    lunch: 'Mittagessen',
    dinner: 'Abendessen',
  };
  constructor(
    private cookService: RecipeCookService,
    private shoppingService: ShoppinglistService,
    private cdr: ChangeDetectorRef,
  ) {}
  ngOnInit(): void {
    const restore = this.readSession();
    this.cookService.slot$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((slot) => {
      if (slot && this.slot && this.minimized && slot.recipe.id === this.slot.recipe.id) {
        // Opening the recipe that is cooking in the background continues it.
        this.resume();
        return;
      }
      const previous = this.slot;
      this.replacedName = slot && this.slot && this.hasProgress && slot.recipe.id !== this.slot.recipe.id
        ? this.slot.recipe.name : '';
      this.minimized = false;
      this.confirmingEnd = false;
      this.started = false;
      this.revision++;
      this.slot = slot;
      this.addedMessage = '';
      this.exportError = '';
      this.exported.clear();
      this.addingToShoppingList = false;
      this.activeTab = 'full';
      this.currentStep = 0;
      this.selectedSection = null;
      this.checkedIngredients.clear();
      this.completedSteps.clear();
      this.finished = false;
      this.phonePane = 'ingredients';
      this.clearTimers();
      this.localPersons = slot?.persons ?? 1;
      this.localUnitsPerPerson = slot?.recipe.unitsPerPerson ?? 1;
      this.selectedServings = slot?.servings ?? slot?.recipe.baseServings ?? 4;
      if (restore && slot === restore.slot) this.applySession(restore);
      else if (!slot && previous) this.clearSession();
      this.updateWakeLock();
      this.cdr.markForCheck();
    });
    if (restore) this.cookService.open(restore.slot);
    this.destroyRef.onDestroy(() => { this.releaseWakeLock(); this.clearTimers(); });
  }

  /** Keeps the screen on while a recipe is open, so it does not lock mid-step in the kitchen. */
  private updateWakeLock(): void {
    if (!this.slot || (this.minimized && !this.timers.some(t => !t.done))) {
      this.releaseWakeLock();
      return;
    }
    const wakeLock = (navigator as Navigator & {
      wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> };
    }).wakeLock;
    if (this.wakeLock || !wakeLock || document.visibilityState !== 'visible') return;
    wakeLock
      .request('screen')
      .then((lock) => {
        if (this.slot) this.wakeLock = lock;
        else lock.release().catch(() => undefined);
      })
      .catch(() => undefined);
  }

  private releaseWakeLock(): void {
    this.wakeLock?.release().catch(() => undefined);
    this.wakeLock = null;
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    // The browser drops the lock when the tab is hidden; take it again on return.
    if (document.visibilityState === 'visible') {
      this.wakeLock = null;
      this.updateWakeLock();
    } else {
      this.saveSession();
    }
  }
  get directRecipe(): boolean {
    return this.slot?.source === 'recipe';
  }
  get totalServings(): number {
    return this.directRecipe ? this.selectedServings : this.localPersons * this.localUnitsPerPerson;
  }
  get validQuantity(): boolean {
    return (
      Number.isFinite(this.totalServings) &&
      this.totalServings > 0 &&
      (this.directRecipe || Number.isInteger(this.localPersons))
    );
  }
  get servingLabel(): string {
    return this.slot?.recipe.servingType === 'Stücke' ? 'Stücke' : 'Portionen';
  }
  get scale(): number {
    return this.validQuantity ? this.totalServings / (this.slot?.recipe.baseServings || 4) : 0;
  }
  get steps(): RecipeStep[] {
    return [...(this.slot?.recipe.steps ?? [])]
      .sort((a, b) => a.order - b.order)
      .filter((s) => this.selectedSection == null || s.sectionId === this.selectedSection);
  }
  get step(): RecipeStep | null {
    return this.steps[this.currentStep] ?? null;
  }
  get completedCount(): number {
    return this.steps.filter((s) => this.completedSteps.has(s.order)).length;
  }
  get progress(): number {
    return this.steps.length ? (this.completedCount / this.steps.length) * 100 : 0;
  }
  get ingredients(): Array<{
    key: string;
    name: string;
    qty: string;
    unit: string;
    section: string;
  }> {
    return (this.slot?.recipe.ingredients ?? [])
      .filter(
        (i) =>
          this.selectedSection == null ||
          i.sectionId == null ||
          i.sectionId === this.selectedSection,
      )
      .map((i, index) => ({
        key: i.id ?? `${i.name}:${i.sectionId ?? ''}:${index}`,
        name: i.name,
        qty: this.formatQuantity(i.quantityPerPerson),
        unit: i.unit ?? '',
        section: this.sectionTitle(i.sectionId),
      }));
  }
  get stepIngredients(): Array<{ name: string; qty: string; unit: string }> {
    return (this.step?.ingredients ?? []).map((link) => {
      const amount = this.slot?.recipe.ingredients.find(
        (i) =>
          i.id === link.recipeIngredientId ||
          (!link.recipeIngredientId &&
            i.name === link.name &&
            (i.sectionId == null || i.sectionId === this.step?.sectionId)),
      );
      return {
        name: amount?.name ?? link.name,
        qty: this.formatQuantity(link.quantityPerPerson ?? amount?.quantityPerPerson),
        unit: (link.quantityPerPerson != null ? link.unit : '') || amount?.unit || '',
      };
    });
  }
  sectionTitle(id?: number): string {
    return this.slot?.recipe.sections?.find((s) => s.id === id)?.title ?? '';
  }
  formatQuantity(value?: number | null): string {
    return value == null
      ? 'Nach Bedarf'
      : new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(value * this.scale);
  }
  scaledIngredients(
    recipe: Recipe,
    persons: number,
    unitsPerPerson: number,
  ): Array<{ name: string; qty: string; unit: string }> {
    const scale = (persons * unitsPerPerson) / (recipe.baseServings || 4);
    return recipe.ingredients.map((i: RecipeIngredient) => ({
      name: i.name,
      qty:
        i.quantityPerPerson == null
          ? ''
          : String(Math.round(i.quantityPerPerson * scale * 100) / 100),
      unit: i.unit ?? '',
    }));
  }
  private scrollContent(): void {
    requestAnimationFrame(() => {
      if (this.body) this.body.nativeElement.scrollTop = 0;
      if (this.preparation) this.preparation.nativeElement.scrollTop = 0;
    });
  }
  get preparedCount(): number {
    return this.ingredients.filter(i => this.checkedIngredients.has(i.key)).length;
  }
  /** Main button of the overview: start, or continue where cooking stopped. */
  get startLabel(): string {
    if (!this.completedCount) return '▶ Kochen starten';
    if (this.completedCount === this.steps.length) return 'Schritte ansehen';
    return `▶ Weiter bei Schritt ${this.firstOpenStep + 1}`;
  }
  private get firstOpenStep(): number {
    const index = this.steps.findIndex(s => !this.completedSteps.has(s.order));
    return index === -1 ? 0 : index;
  }
  get stepTimers(): Array<{ minutes: number; label: string }> {
    return this.step ? timersInText(this.step.description) : [];
  }
  setTab(tab: 'full' | 'steps'): void {
    if (tab === 'steps' && (!this.steps.length || !this.validQuantity || this.addingToShoppingList)) return;
    if (tab === 'steps') this.started = true;
    if (tab === 'steps' && this.activeTab === 'full' && this.completedCount && this.completedSteps.has(this.step?.order ?? -1)) {
      this.currentStep = this.firstOpenStep;
    }
    this.finished = false;
    this.activeTab = tab;
    this.cdr.markForCheck();
    this.scrollContent();
    if (tab === 'full') requestAnimationFrame(() => this.stepLaunch?.nativeElement.focus());
  }
  onStepBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.setTab('full');
  }
  setSection(id: number | null): void {
    this.selectedSection = id; this.currentStep = 0;
    if (!this.steps.length) this.activeTab = 'full';
    this.scrollContent();
  }
  prevStep(): void { if (this.currentStep > 0) { this.currentStep--; this.scrollContent(); } }
  nextStep(_total?: number): void { if (this.currentStep < this.steps.length - 1) { this.currentStep++; this.scrollContent(); } }
  goToStep(index: number): void {
    if (Number.isInteger(index) && index >= 0 && index < this.steps.length) { this.currentStep = index; this.scrollContent(); }
  }
  /** "Weiter": marks the step done and moves on; after the last one, shows the finish screen or the first open step. */
  completeStep(): void {
    if (!this.step) return;
    this.completedSteps.add(this.step.order);
    if (this.currentStep < this.steps.length - 1) { this.nextStep(); return; }
    if (this.completedCount === this.steps.length) this.finished = true;
    else this.goToStep(this.firstOpenStep);
  }
  reviewSteps(): void { this.finished = false; this.goToStep(this.steps.length - 1); }
  onDismiss(): void { this.activeTab === 'steps' ? this.setTab('full') : this.close(); }

  // ── Timers ────────────────────────────────────────────────────────────────
  timerRunning(minutes: number, stepIndex: number): boolean {
    return this.timers.some(t => !t.done && t.label === `Schritt ${stepIndex + 1}` && t.minutes === minutes);
  }
  startTimer(minutes: number, stepIndex: number): void {
    if (this.timerRunning(minutes, stepIndex)) return;
    this.timers = [...this.timers, { id: ++this.timerSeq, label: `Schritt ${stepIndex + 1}`, minutes,
      endsAt: Date.now() + minutes * 60_000, remaining: minutes * 60, done: false }];
    this.timerTick ??= setInterval(() => this.tickTimers(), 1000);
  }
  dismissTimer(id: number): void {
    this.timers = this.timers.filter(t => t.id !== id);
    if (!this.timers.length) this.clearTimers();
  }
  formatTimer(seconds: number): string {
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
    const two = (n: number) => String(n).padStart(2, '0');
    return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
  }
  tickTimers(now = Date.now()): void {
    let rang = false;
    this.timers = this.timers.map(t => {
      if (t.done) return t;
      const remaining = Math.max(0, Math.ceil((t.endsAt - now) / 1000));
      if (remaining === 0) rang = true;
      return { ...t, remaining, done: remaining === 0 };
    });
    if (rang) this.ring();
    this.cdr.markForCheck();
  }
  private clearTimers(): void {
    if (this.timerTick) clearInterval(this.timerTick);
    this.timerTick = null;
    this.timers = [];
  }
  /** Three short beeps plus vibration; silently skipped where the browser does not allow it. */
  private ring(): void {
    try { navigator.vibrate?.([400, 150, 400, 150, 400]); } catch { /* not supported */ }
    try {
      const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      [0, 0.35, 0.7].forEach(offset => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.frequency.value = 880; gain.gain.value = 0.25;
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(ctx.currentTime + offset); osc.stop(ctx.currentTime + offset + 0.2);
      });
      setTimeout(() => ctx.close().catch(() => undefined), 1500);
    } catch { /* audio blocked */ }
  }

  // ── Swipe between steps ───────────────────────────────────────────────────
  onTouchStart(event: TouchEvent): void {
    const touch = event.changedTouches[0];
    this.touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }
  onTouchEnd(event: TouchEvent): void {
    const touch = event.changedTouches[0], start = this.touchStart;
    this.touchStart = null;
    if (!touch || !start || this.finished) return;
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) this.completeStep(); else this.prevStep();
  }
  toggleComplete(): void {
    if (!this.step) return;
    const order = this.step.order;
    this.completedSteps.has(order)
      ? this.completedSteps.delete(order)
      : this.completedSteps.add(order);
  }
  toggleIngredient(key: string): void {
    this.checkedIngredients.has(key)
      ? this.checkedIngredients.delete(key)
      : this.checkedIngredients.add(key);
  }
  adjustPersons(delta: number): void {
    if (!this.addingToShoppingList) this.localPersons = Math.max(1, this.localPersons + delta);
  }
  adjustUnitsPerPerson(delta: number): void {
    if (!this.addingToShoppingList)
      this.localUnitsPerPerson = Math.max(
        0.1,
        Math.round((this.localUnitsPerPerson + delta) * 10) / 10,
      );
  }
  adjustServings(delta: number): void {
    if (!this.addingToShoppingList)
      this.selectedServings = Math.max(1, this.selectedServings + delta);
  }
  private get exportKey(): string { return `${this.slot?.recipe.id}:${this.totalServings}`; }
  get ingredientsAdded(): boolean {
    return this.exported.has(this.exportKey);
  }
  addToShoppingList(slot: CookSlot): void {
    if (
      slot !== this.slot ||
      this.addingToShoppingList ||
      this.ingredientsAdded ||
      !this.validQuantity
    )
      return;
    const key = this.exportKey,
      revision = this.revision;
    this.addingToShoppingList = true;
    this.exportError = '';
    this.addedMessage = '';
    this.shoppingService
      .addRecipe(
        slot.recipe.id,
        this.directRecipe ? 1 : this.localPersons,
        this.directRecipe ? this.selectedServings : this.localUnitsPerPerson,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (count) => {
          if (revision !== this.revision) return;
          this.addingToShoppingList = false;
          this.exported.add(key);
          this.addedMessage = `${count} Zutaten zur manuellen Einkaufsliste hinzugefügt.`;
          this.cdr.markForCheck();
        },
        error: () => {
          if (revision !== this.revision) return;
          this.addingToShoppingList = false;
          this.exportError = 'Hinzufügen fehlgeschlagen. Bitte erneut versuchen.';
          this.cdr.markForCheck();
        },
      });
  }
  /** Cooking was started or something was ticked off, so closing would lose something. */
  get hasProgress(): boolean {
    return this.started || this.timers.length > 0 || this.completedSteps.size > 0 || this.checkedIngredients.size > 0;
  }

  /** Backdrop, Escape and back: keep a started recipe in the background, close an untouched one. */
  close(): void {
    if (this.addingToShoppingList) return;
    if (this.hasProgress) this.minimize();
    else this.cookService.close();
  }

  minimize(): void {
    if (!this.slot || this.addingToShoppingList) return;
    this.minimized = true;
    this.confirmingEnd = false;
    this.replacedName = '';
    this.saveSession();
    this.updateWakeLock();
    this.cdr.markForCheck();
  }

  resume(): void {
    this.minimized = false;
    this.updateWakeLock();
    this.cdr.markForCheck();
    this.scrollContent();
  }

  /** ✕: ends cooking right away when nothing would be lost, otherwise asks first. */
  requestEnd(): void {
    if (this.addingToShoppingList) return;
    if (!this.hasProgress) { this.cookService.close(); return; }
    if (this.minimized) this.resume();
    this.confirmingEnd = true;
  }

  endCooking(): void {
    this.confirmingEnd = false;
    this.clearSession();
    this.cookService.close();
  }

  /** Text of the small bar while cooking runs in the background. */
  get miniStatus(): string {
    if (this.finished) return 'Alle Schritte erledigt';
    if (this.activeTab === 'steps' && this.steps.length) return `Schritt ${this.currentStep + 1} von ${this.steps.length}`;
    if (this.completedCount) return `${this.completedCount} von ${this.steps.length} Schritten erledigt`;
    return 'Vorbereitung';
  }

  /** The timer to show in the small bar: a finished one first, else the one ending soonest. */
  get miniTimer(): CookTimer | null {
    return this.timers.find(t => t.done) ?? [...this.timers].sort((a, b) => a.endsAt - b.endsAt)[0] ?? null;
  }

  private saveSession(): void {
    if (!this.slot || !this.hasProgress) return;
    const session: CookSession = {
      slot: this.slot, activeTab: this.activeTab, currentStep: this.currentStep, selectedSection: this.selectedSection,
      checked: [...this.checkedIngredients], completed: [...this.completedSteps], timers: this.timers,
      finished: this.finished, localPersons: this.localPersons, localUnitsPerPerson: this.localUnitsPerPerson,
      selectedServings: this.selectedServings, savedAt: Date.now(),
    };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* storage unavailable */ }
  }

  private readSession(): CookSession | null {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as CookSession | null;
      if (session?.slot?.recipe && Date.now() - session.savedAt < SESSION_MAX_AGE) return session;
    } catch { /* ignore broken data */ }
    this.clearSession();
    return null;
  }

  private clearSession(): void {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* storage unavailable */ }
  }

  private applySession(session: CookSession): void {
    this.activeTab = session.activeTab === 'steps' ? 'steps' : 'full';
    this.started = true;
    this.selectedSection = session.selectedSection ?? null;
    this.currentStep = Math.min(Math.max(0, session.currentStep || 0), Math.max(0, this.steps.length - 1));
    this.checkedIngredients = new Set(session.checked ?? []);
    this.completedSteps = new Set(session.completed ?? []);
    this.finished = !!session.finished;
    this.localPersons = session.localPersons || this.localPersons;
    this.localUnitsPerPerson = session.localUnitsPerPerson || this.localUnitsPerPerson;
    this.selectedServings = session.selectedServings || this.selectedServings;
    this.timers = (session.timers ?? []).map(t => ({ ...t }));
    this.timerSeq = Math.max(0, ...this.timers.map(t => t.id));
    this.minimized = true;
    if (this.timers.some(t => !t.done)) {
      this.tickTimers();
      this.timerTick ??= setInterval(() => this.tickTimers(), 1000);
    }
  }
  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }
  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    if (!this.slot) return;
    const element = event.target as HTMLElement;
    if (element?.matches('input,textarea,select')) return;
    if (this.minimized) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.confirmingEnd) { this.confirmingEnd = false; return; }
      this.activeTab === 'steps' ? this.setTab('full') : this.close();
      return;
    }
    if (this.activeTab !== 'steps') return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.completeStep();
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.prevStep();
    }
  }
}
