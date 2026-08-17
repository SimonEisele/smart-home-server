import { Component, ChangeDetectorRef, HostListener, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { CalendarEvent, HouseholdMember, MemberAvailability, UserMealAttendance, ExternalMealGuest } from './model/calendar.model';
import { CalendarService } from './service/calendar.service';
import { TodosService } from '../todos/service/todos.service';
import { Todo } from '../todos/model/todos.model';
import { AuthService } from '../../core/auth/service/auth.service';
import { CleaningTask } from '../cleaning/model/cleaning.model';

interface DayEntry { date: Date; dateStr: string; isToday: boolean; dayName: string; dayNum: number; month: number; }
interface DropPreview { dateStr: string; top: number; h: number; label: string; hour: number; minute: number; }
interface EvModalForm { title: string; date: string; startTime: string; endTime: string; calendarType: string; description: string; location: string; color: string; allDay: boolean; }
interface ResizePreview { evId: string; newH: number; newEnd: string; }

const DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const START_HOUR = 6;
const END_HOUR   = 23;
const HOUR_PX    = 64; // px per hour

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './calendar.html',
  styleUrl: './calendar.css',
})
export class Calendar implements OnInit, OnDestroy {
  weekStart!: Date;
  weekDays: DayEntry[] = [];

  events:        CalendarEvent[]    = [];
  todos:         Todo[]             = [];
  members:       HouseholdMember[]  = [];
  availabilities: MemberAvailability[] = [];
  mealAttendances: UserMealAttendance[] = [];
  externalGuests: ExternalMealGuest[] = [];
  cleaningTasks: CleaningTask[] = [];
  currentUserId: string | null = null;
  isHouseholdAccount = false;
  todoOccurrences: Record<string, string[]> = {};
  memberName = '';

  // External guest add form
  addingGuestFor: { dateStr: string; meal: 'breakfast' | 'lunch' | 'dinner' } | null = null;
  newGuestName = '';

  // Filters
  showHousehold = true;
  showPrivate   = true;
  showTodos     = true;

  // Drag & drop state
  dragTodo:       Todo | null          = null;
  dragEvent:      CalendarEvent | null = null;
  dragOffsetMin   = 0;
  dropPreview:    DropPreview | null   = null;
  private justDragged = false;

  // Touch drag state (public members used by template)
  touchActive          = false;
  touchDraggingEventId: string | null = null;
  touchOverSidebar     = false;

  // Touch drag state (private)
  private touchIsResize       = false;
  private touchDragTodo:  Todo          | null = null;
  touchDragEvent: CalendarEvent | null = null;
  private touchDragOffsetMin  = 0;
  private touchStartX         = 0;
  private touchStartY         = 0;
  private touchResizeStartY   = 0;
  private touchResizeStartH   = 0;
  private readonly DRAG_THRESHOLD_PX = 8;

  // Resize state
  resizingEvent: CalendarEvent | null = null;
  resizePreview: ResizePreview | null = null;

  // Event modal
  showModal    = false;
  editingEvent: CalendarEvent | null = null;
  modalForm:   EvModalForm = this.emptyForm();

  // Split modal
  showSplitModal = false;
  splitTodo:   Todo | null = null;
  splitCount   = 2;
  splitDate    = '';
  splitHour    = 9;
  splitMinute  = 0;

  // Now-line
  nowTop = 0;
  nowVisible = false;
  private nowTimer: any = null;

  readonly gridHours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  readonly GRID_H = (END_HOUR - START_HOUR) * HOUR_PX;
  readonly MEALS: Array<{ key: 'breakfast' | 'lunch' | 'dinner'; label: string; icon: string }> = [
    { key: 'breakfast', label: 'Frühstück', icon: '🌅' },
    { key: 'lunch', label: 'Mittag', icon: '🍽' },
    { key: 'dinner', label: 'Abend', icon: '🌙' },
  ];

  constructor(
    private calendarService: CalendarService,
    private todosService: TodosService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.authService.user$.subscribe(u => {
      this.currentUserId = u?.id ?? null;
      this.isHouseholdAccount = u?.is_household_account ?? false;
      this.cdr.detectChanges();
    });
    this.initWeek(new Date());
    this.load();
    this.updateNow();
    this.nowTimer = setInterval(() => { this.updateNow(); this.cdr.detectChanges(); }, 30000);
    setTimeout(() => {
      const el = document.getElementById('grid-scroll');
      if (el) el.scrollTop = Math.max(0, this.nowTop - 160);
    }, 300);
  }

  ngOnDestroy(): void { clearInterval(this.nowTimer); }

  // â”€â”€ Week nav â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  prevWeek(): void { const d = new Date(this.weekStart); d.setDate(d.getDate() - 7); this.initWeek(d); this.loadEvents(); }
  nextWeek(): void { const d = new Date(this.weekStart); d.setDate(d.getDate() + 7); this.initWeek(d); this.loadEvents(); }

  goToday(): void {
    this.initWeek(new Date());
    this.loadEvents();
    setTimeout(() => { const el = document.getElementById('grid-scroll'); if (el) el.scrollTop = Math.max(0, this.nowTop - 160); }, 200);
  }

  private initWeek(d: Date): void {
    const day  = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const mon  = new Date(d);
    mon.setDate(d.getDate() + diff);
    this.weekStart = new Date(mon);
    const today = this.iso(new Date());
    this.weekDays = Array.from({ length: 7 }, (_, i) => {
      const di = new Date(mon); di.setDate(mon.getDate() + i);
      return { date: di, dateStr: this.iso(di), isToday: this.iso(di) === today,
               dayName: DAY_NAMES[di.getDay()], dayNum: di.getDate(), month: di.getMonth() + 1 };
    });
  }

  get weekLabel(): string {
    if (!this.weekDays.length) return '';
    const [s, e] = [this.weekDays[0].date, this.weekDays[6].date];
    const fmt = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.`;
    return `${fmt(s)} – ${fmt(e)}${e.getFullYear()}`;
  }

  // â”€â”€ Loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private load(): void {
    this.loadEvents();
    this.calendarService.getMembers().subscribe(m => { this.members = m; this.cdr.detectChanges(); });
    this.calendarService.getCleaningTasks().subscribe(t => { this.cleaningTasks = t; this.cdr.detectChanges(); });
    this.todosService.getUserTodos().subscribe(t => {
      this.todos = t; this.rebuildTodoOcc();
      this.updateActiveProgress(new Date());
      this.cdr.detectChanges();
    });
  }

  private loadEvents(): void {
    if (!this.weekDays.length) return;
    const start = this.weekDays[0].dateStr;
    const end   = this.weekDays[6].dateStr;
    this.calendarService.getEvents(start, end).subscribe(evs => {
      this.events = evs;
      this.updateActiveProgress(new Date());
      this.cdr.detectChanges();
    });
    this.calendarService.getAvailabilities(start, end).subscribe(a => { this.availabilities = a; this.cdr.detectChanges(); });
    this.calendarService.getMealAttendance(start, end).subscribe(a => { this.mealAttendances = a; this.cdr.detectChanges(); });
    this.calendarService.getExternalGuests(start, end).subscribe(g => { this.externalGuests = g; this.cdr.detectChanges(); });
  }

  private rebuildTodoOcc(): void {
    const occ: Record<string, string[]> = {};
    for (const t of this.todos) {
      if (t.done) continue;
      const anchor = t.startDate || t.dueDate;
      if (!anchor) continue;
      const base = new Date(anchor);
      if (isNaN(base.getTime())) continue;
      if (!t.recurrence) {
        const ds = this.iso(base);
        if (this.weekDays.some(w => w.dateStr === ds)) occ[ds] = [...(occ[ds] ?? []), t.title];
      } else {
        const interval = Math.max(1, t.recurrenceInterval ?? 1);
        for (const wd of this.weekDays) {
          const diff = Math.floor((new Date(wd.dateStr).getTime() - base.getTime()) / 86400000);
          if (diff < 0) continue;
          if (t.recurrence === 'daily' && diff % interval === 0)        occ[wd.dateStr] = [...(occ[wd.dateStr] ?? []), t.title];
          if (t.recurrence === 'weekly' && diff % (7 * interval) === 0) occ[wd.dateStr] = [...(occ[wd.dateStr] ?? []), t.title];
        }
      }
    }
    this.todoOccurrences = occ;
  }

  // â”€â”€ Computed views â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  get openTodos(): Todo[] {
    const scheduled = new Set(
      this.events.filter(e => !!e.todoRefId).map(e => e.todoRefId!)
    );
    return this.todos.filter(t => !t.done && !scheduled.has(t.id));
  }

  // ── Cleaning ─────────────────────────────────────────────────────────────

  cleaningEventsForDay(dateStr: string): { task: CleaningTask; overdue: boolean }[] {
    const day = new Date(dateStr);
    day.setHours(0, 0, 0, 0);
    return this.cleaningTasks.filter(task => {
      if (!task.isActive) return false;
      const due = this.cleaningNextDue(task);
      if (!due) return false;
      due.setHours(0, 0, 0, 0);
      return due.getTime() === day.getTime();
    }).map(task => ({ task, overdue: false })).concat(
      this.cleaningTasks.filter(task => {
        if (!task.isActive) return false;
        const due = this.cleaningNextDue(task);
        if (!due) return false;
        due.setHours(0, 0, 0, 0);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        // Show overdue tasks on today
        return due < today && day.getTime() === today.getTime();
      }).map(task => ({ task, overdue: true }))
    );
  }

  private cleaningNextDue(task: CleaningTask): Date | null {
    if (!task.lastDoneAt) {
      // Never done: show as due today
      return new Date();
    }
    const last = new Date(task.lastDoneAt);
    last.setHours(0, 0, 0, 0);
    const d = new Date(last);
    d.setDate(d.getDate() + task.intervalDays);
    return d;
  }

  mealAttendeesForDay(dateStr: string, meal: 'breakfast' | 'lunch' | 'dinner'): UserMealAttendance[] {
    return this.mealAttendances.filter(a => {
      if (a.date !== dateStr) return false;
      if (meal === 'breakfast') return a.breakfastPresent;
      if (meal === 'lunch') return a.lunchPresent;
      return a.dinnerPresent;
    });
  }

  myAttendanceForDay(dateStr: string): UserMealAttendance | undefined {
    return this.mealAttendances.find(a => a.date === dateStr && a.userId === this.currentUserId);
  }

  attendanceDisplayName(a: UserMealAttendance): string {
    const sameFirst = this.mealAttendances.filter(x => x.userFirstName === a.userFirstName).length > 1;
    return sameFirst ? `${a.userFirstName} ${a.userLastName}`.trim() : a.userFirstName;
  }

  mealIsActive(dateStr: string, meal: 'breakfast' | 'lunch' | 'dinner'): boolean {
    const rec = this.myAttendanceForDay(dateStr);
    if (!rec) return false; // opt-in: absent by default
    if (meal === 'breakfast') return rec.breakfastPresent;
    if (meal === 'lunch') return rec.lunchPresent;
    return rec.dinnerPresent;
  }

  toggleMealAttendance(dateStr: string, meal: 'breakfast' | 'lunch' | 'dinner'): void {
    const existing = this.myAttendanceForDay(dateStr);
    // Opt-in model: absent by default. Clicking a meal toggles only that meal; others keep their value (default false).
    const breakfastPresent = meal === 'breakfast' ? !(existing?.breakfastPresent ?? false) : (existing?.breakfastPresent ?? false);
    const lunchPresent = meal === 'lunch' ? !(existing?.lunchPresent ?? false) : (existing?.lunchPresent ?? false);
    const dinnerPresent = meal === 'dinner' ? !(existing?.dinnerPresent ?? false) : (existing?.dinnerPresent ?? false);
    this.calendarService.setMealAttendance(dateStr, breakfastPresent, lunchPresent, dinnerPresent).subscribe(updated => {
      const idx = this.mealAttendances.findIndex(a => a.date === dateStr && a.userId === this.currentUserId);
      if (idx >= 0) { this.mealAttendances = [...this.mealAttendances.slice(0, idx), updated, ...this.mealAttendances.slice(idx + 1)]; }
      else { this.mealAttendances = [...this.mealAttendances, updated]; }
      this.cdr.detectChanges();
    });
  }

  removeMealAttendance(dateStr: string): void {
    this.calendarService.deleteMealAttendance(dateStr).subscribe(() => {
      this.mealAttendances = this.mealAttendances.filter(a => !(a.date === dateStr && a.userId === this.currentUserId));
      this.cdr.detectChanges();
    });
  }

  // ── External guests ──────────────────────────────────────────────────────

  externalGuestsForMeal(dateStr: string, meal: 'breakfast' | 'lunch' | 'dinner'): ExternalMealGuest[] {
    return this.externalGuests.filter(g => g.date === dateStr && g.meal === meal);
  }

  openAddGuest(dateStr: string, meal: 'breakfast' | 'lunch' | 'dinner', e: Event): void {
    e.stopPropagation();
    this.addingGuestFor = { dateStr, meal };
    this.newGuestName = '';
    this.cdr.detectChanges();
  }

  closeAddGuest(): void { this.addingGuestFor = null; this.newGuestName = ''; }

  submitAddGuest(): void {
    const name = this.newGuestName.trim();
    const target = this.addingGuestFor;
    if (!name || !target) return;
    this.calendarService.addExternalGuest(name, target.dateStr, target.meal).subscribe(guest => {
      this.externalGuests = [...this.externalGuests, guest];
      this.addingGuestFor = null;
      this.newGuestName = '';
      this.cdr.detectChanges();
    });
  }

  removeExternalGuest(id: string, e: Event): void {
    e.stopPropagation();
    // Optimistic: remove from UI immediately
    this.externalGuests = this.externalGuests.filter(g => g.id !== id);
    this.cdr.detectChanges();
    this.calendarService.removeExternalGuest(id).subscribe({
      error: () => {
        // Revert on failure by reloading
        const start = this.weekDays[0]?.dateStr;
        const end = this.weekDays[6]?.dateStr;
        if (start && end) this.calendarService.getExternalGuests(start, end).subscribe(g => { this.externalGuests = g; this.cdr.detectChanges(); });
      }
    });
  }

  eventsForDay(dateStr: string): CalendarEvent[] {
    return this.events.filter(ev => {
      if (ev.allDay) return false;
      if (!ev.start?.startsWith(dateStr)) return false;
      if (ev.calendarType === 'private'   && !this.showPrivate)   return false;
      if ((ev.calendarType ?? 'household') === 'household' && !this.showHousehold) return false;
      return true;
    });
  }

  allDayEventsForDay(dateStr: string): CalendarEvent[] {
    return this.events.filter(ev => ev.allDay && ev.start?.startsWith(dateStr));
  }

  evTop(ev: CalendarEvent): number {
    const d = new Date(ev.start);
    const mins = (d.getHours() - START_HOUR) * 60 + d.getMinutes();
    return Math.max(0, mins * (HOUR_PX / 60));
  }

  evHeight(ev: CalendarEvent): number {
    if (this.resizePreview?.evId === ev.id) return this.resizePreview.newH;
    if (!ev.end) return HOUR_PX;
    const mins = (new Date(ev.end).getTime() - new Date(ev.start).getTime()) / 60000;
    return Math.max(20, mins * (HOUR_PX / 60));
  }

  evClass(ev: CalendarEvent): string {
    const type = ev.calendarType ?? 'household';
    const todo = ev.todoRefId ? ' ev-todo' : '';
    return `cal-ev ev-${type}${todo}`;
  }

  evColor(ev: CalendarEvent): string { return ev.color ?? ''; }

  formatDuration(min?: number): string {
    if (!min) return '';
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h}h${m}` : `${h}h`;
  }

  updateNow(): void {
    const now = new Date();
    const mins = (now.getHours() - START_HOUR) * 60 + now.getMinutes();
    this.nowTop = Math.max(0, mins * (HOUR_PX / 60));
    this.nowVisible = now.getHours() >= START_HOUR && now.getHours() < END_HOUR;
    this.updateActiveProgress(now);
  }

  splitSessionDuration(): number {
    return Math.ceil((this.splitTodo?.durationMinutes ?? 60) / this.splitCount);
  }

  // ── Split direct ──────────────────────────────────────────────────────────
  openSplitDirect(todo: Todo, e: Event): void {
    e.stopPropagation();
    const now = new Date();
    this.splitTodo = todo;
    this.splitDate = this.iso(now);
    this.splitHour = Math.min(now.getHours() + 1, END_HOUR - 1);
    this.splitMinute = 0;
    this.splitCount = Math.max(2, Math.ceil((todo.durationMinutes ?? 60) / 60));
    this.showSplitModal = true;
    this.cdr.detectChanges();
  }

  get splitTimeStr(): string { return `${pad(this.splitHour)}:${pad(this.splitMinute)}`; }
  set splitTimeStr(v: string) { const p = v.split(':'); this.splitHour = +p[0]; this.splitMinute = +(p[1] ?? 0); }

  // ── Resize ────────────────────────────────────────────────────────────────
  onResizeDragstart(e: DragEvent, ev: CalendarEvent): void {
    e.stopPropagation();
    this.resizingEvent = ev;
    this.dragEvent = null; this.dragTodo = null;
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', ev.id);
    this.cdr.detectChanges();
  }

  // ── Todo progress ─────────────────────────────────────────────────────────
  getTodoProgress(todoRefId: string): number {
    return this.todos.find(t => t.id === todoRefId)?.progress ?? 0;
  }

  private updateActiveProgress(_now: Date): void { /* progress tracking removed */ }

  // ── Touch drag & drop ─────────────────────────────────────────────────────

  /** Todo sidebar item: immediate drag activation */
  onTodoTouchStart(e: TouchEvent, todo: Todo): void {
    e.preventDefault();
    this.touchDragTodo  = todo;
    this.touchDragEvent = null;
    this.touchActive    = true;
    this.dragTodo = todo;
    this.dragEvent = null;
    this.lockGridScroll();
  }

  /** Calendar event body: defer to movement threshold (tap = open modal) */
  onEvTouchStart(e: TouchEvent, ev: CalendarEvent): void {
    const touch = e.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.touchDragOffsetMin = Math.floor(((touch.clientY - rect.top) / HOUR_PX) * 60);
    this.touchDragEvent = ev;
    this.touchDragTodo  = null;
    this.touchIsResize  = false;
    // touchActive intentionally stays false until movement threshold crossed
  }

  /** Resize handle: activate resize immediately */
  onResizeTouchStart(e: TouchEvent, ev: CalendarEvent): void {
    e.stopPropagation();
    e.preventDefault();
    const touch = e.touches[0];
    this.touchIsResize       = true;
    this.touchDragEvent      = ev;
    this.touchDragTodo       = null;
    this.touchActive         = true;
    this.touchDraggingEventId = ev.id;
    this.touchResizeStartY   = touch.clientY;
    this.touchResizeStartH   = this.evHeight(ev);
    this.resizingEvent       = ev;
    this.lockGridScroll();
  }

  @HostListener('document:touchmove', ['$event'])
  onDocTouchMove(e: TouchEvent): void {
    // ── Resize mode ──────────────────────────────────────────────────────────
    if (this.touchIsResize && this.resizingEvent) {
      e.preventDefault();
      const dy   = e.touches[0].clientY - this.touchResizeStartY;
      const rawH = Math.max(20, this.touchResizeStartH + dy);
      const durMin = Math.max(5, Math.round((rawH / (HOUR_PX / 60)) / 5) * 5);
      const startD = new Date(this.resizingEvent.start);
      const newEnd = new Date(startD.getTime() + durMin * 60000);
      this.resizePreview = {
        evId: this.resizingEvent.id,
        newH: Math.max(20, durMin * (HOUR_PX / 60)),
        newEnd: newEnd.toISOString(),
      };
      this.cdr.detectChanges();
      return;
    }

    // ── Activate event drag once threshold exceeded ───────────────────────────
    if (this.touchDragEvent && !this.touchActive) {
      const t  = e.touches[0];
      const dx = Math.abs(t.clientX - this.touchStartX);
      const dy = Math.abs(t.clientY - this.touchStartY);
      if (dx <= this.DRAG_THRESHOLD_PX && dy <= this.DRAG_THRESHOLD_PX) return;
      this.touchActive          = true;
      this.touchDraggingEventId = this.touchDragEvent.id;
      this.dragEvent = this.touchDragEvent;
      this.dragTodo  = null;
      this.lockGridScroll();
    }

    if (!this.touchActive) return;
    e.preventDefault();

    const touch = e.touches[0];
    const hit = document.elementFromPoint(touch.clientX, touch.clientY) as Element | null;

    // Check sidebar hover (for "drop to remove event" affordance)
    const newOverSidebar = !!hit?.closest('.todo-sidebar');
    if (this.touchOverSidebar !== newOverSidebar) {
      this.touchOverSidebar = newOverSidebar;
      if (newOverSidebar) this.dropPreview = null;
      this.cdr.detectChanges();
    }
    if (newOverSidebar) return;

    // Map to day column
    const dayColEl = hit?.closest('[data-date]') as HTMLElement | null;
    if (!dayColEl) { this.dropPreview = null; this.cdr.detectChanges(); return; }
    const dateStr = dayColEl.getAttribute('data-date')!;
    const day = this.weekDays.find(d => d.dateStr === dateStr);
    if (!day) { this.dropPreview = null; this.cdr.detectChanges(); return; }
    const rect = dayColEl.getBoundingClientRect();
    this.calcDropPreviewFromY(Math.max(0, touch.clientY - rect.top), day);
    this.cdr.detectChanges();
  }

  @HostListener('document:touchend', ['$event'])
  onDocTouchEnd(_e: TouchEvent): void {
    // ── Resize commit ─────────────────────────────────────────────────────────
    if (this.touchIsResize && this.resizingEvent && this.resizePreview) {
      const ev     = this.resizingEvent;
      const newEnd = this.resizePreview.newEnd;
      const durMin = Math.round((new Date(newEnd).getTime() - new Date(ev.start).getTime()) / 60000);
      this.calendarService.updateEvent(ev.id, { end: newEnd }).subscribe(updated => {
        this.events = this.events.map(e => e.id === updated.id ? updated : e);
        if (ev.todoRefId) {
          this.todosService.updateTodo(ev.todoRefId, { durationMinutes: durMin }).subscribe(() => {
            this.todos = this.todos.map(t => t.id === ev.todoRefId ? { ...t, durationMinutes: durMin } : t);
          });
        }
        this.cdr.detectChanges();
      });
      this.resetTouchState();
      return;
    }

    // ── Tap → open modal ─────────────────────────────────────────────────────
    if (this.touchDragEvent && !this.touchActive) {
      const ev = this.touchDragEvent;
      this.resetTouchState();
      this.openEditEvent(ev);
      return;
    }

    if (!this.touchActive) { this.resetTouchState(); return; }

    // ── Drop on sidebar → delete event, keep todo ────────────────────────────
    if (this.touchOverSidebar && this.touchDragEvent) {
      const ev = this.touchDragEvent;
      this.calendarService.deleteEvent(ev.id).subscribe(() => {
        this.events = this.events.filter(e => e.id !== ev.id);
        this.cdr.detectChanges();
      });
      this.resetTouchState();
      return;
    }

    // ── Drop on calendar grid ────────────────────────────────────────────────
    if (this.dropPreview) {
      const day = this.weekDays.find(d => d.dateStr === this.dropPreview!.dateStr);
      if (day) {
        const { hour, minute } = this.dropPreview;
        if (this.touchDragTodo) {
          const todo = this.touchDragTodo;
          const dur  = todo.durationMinutes ?? 60;
          if (dur > 120) {
            this.splitTodo = todo; this.splitDate = day.dateStr;
            this.splitHour = hour; this.splitMinute = minute;
            this.splitCount = Math.min(4, Math.ceil(dur / 60));
            this.showSplitModal = true;
          } else {
            this.doCreateFromTodo(todo, day.dateStr, hour, minute, dur);
          }
        } else if (this.touchDragEvent) {
          this.doMoveEvent(this.touchDragEvent, day.dateStr, hour, minute);
        }
      }
    }
    this.resetTouchState();
  }

  private lockGridScroll(): void {
    // Lock the whole body so nothing scrolls during touch drag
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    const el = document.getElementById('grid-scroll');
    if (el) el.style.overflow = 'hidden';
  }

  private unlockGridScroll(): void {
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
    const el = document.getElementById('grid-scroll');
    if (el) el.style.overflow = '';
  }

  private resetTouchState(): void {
    this.unlockGridScroll();
    this.touchActive          = false;
    this.touchIsResize        = false;
    this.touchOverSidebar     = false;
    this.touchDraggingEventId = null;
    this.touchDragTodo        = null;
    this.touchDragEvent       = null;
    this.dragTodo             = null;
    this.dragEvent            = null;
    this.dropPreview          = null;
    this.resizingEvent        = null;
    this.resizePreview        = null;
    this.cdr.detectChanges();
  }

  private calcDropPreviewFromY(y: number, day: DayEntry): void {
    const rawM   = (y / HOUR_PX) * 60;
    const absRaw = START_HOUR * 60 + rawM - (this.touchDragEvent ? this.touchDragOffsetMin : 0);
    const clampM = Math.max(START_HOUR * 60, Math.min((END_HOUR - 1) * 60, Math.round(absRaw / 5) * 5));
    const hour   = Math.floor(clampM / 60), minute = clampM % 60;
    const durMin = this.touchDragTodo?.durationMinutes
      ?? (this.touchDragEvent?.end
        ? (new Date(this.touchDragEvent.end).getTime() - new Date(this.touchDragEvent.start).getTime()) / 60000
        : 60);
    this.dropPreview = {
      dateStr: day.dateStr,
      top:  (clampM - START_HOUR * 60) * (HOUR_PX / 60),
      h:    Math.max(20, durMin * (HOUR_PX / 60)),
      label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      hour, minute,
    };
  }

  // â”€â”€ Drag & drop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  onTodoDragstart(e: DragEvent, todo: Todo): void {
    this.dragTodo = todo; this.dragEvent = null;
    e.dataTransfer!.effectAllowed = 'copy';
    e.dataTransfer!.setData('text/plain', todo.id);
  }

  onEvDragstart(e: DragEvent, ev: CalendarEvent): void {
    e.stopPropagation();
    this.justDragged = true;
    this.dragEvent = ev; this.dragTodo = null;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.dragOffsetMin = Math.floor(((e.clientY - rect.top) / HOUR_PX) * 60);
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', ev.id);
    this.cdr.detectChanges();
  }

  onColDragover(e: DragEvent, day: DayEntry): void {
    e.preventDefault();
    if (this.resizingEvent) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const y = Math.max(0, e.clientY - rect.top);
      const snapM = Math.round((y / HOUR_PX * 60) / 5) * 5;
      const startD = new Date(this.resizingEvent.start);
      const startAbsM = startD.getHours() * 60 + startD.getMinutes();
      const durMin = Math.max(5, START_HOUR * 60 + snapM - startAbsM);
      const newEnd = new Date(startD.getTime() + durMin * 60000);
      this.resizePreview = { evId: this.resizingEvent.id, newH: Math.max(20, durMin * (HOUR_PX / 60)), newEnd: newEnd.toISOString() };
      this.cdr.detectChanges();
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y    = Math.max(0, e.clientY - rect.top);
    const rawM = (y / HOUR_PX) * 60;
    const absRaw = START_HOUR * 60 + rawM - (this.dragEvent ? this.dragOffsetMin : 0);
    const clampM = Math.max(START_HOUR * 60, Math.min((END_HOUR - 1) * 60, Math.round(absRaw / 5) * 5));
    const hour = Math.floor(clampM / 60), minute = clampM % 60;

    const durMin = this.dragTodo?.durationMinutes
      ?? (this.dragEvent?.end ? (new Date(this.dragEvent.end).getTime() - new Date(this.dragEvent.start).getTime()) / 60000 : 60);

    this.dropPreview = {
      dateStr: day.dateStr,
      top: (clampM - START_HOUR * 60) * (HOUR_PX / 60),
      h: Math.max(20, durMin * (HOUR_PX / 60)),
      label: `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`,
      hour, minute,
    };
    this.cdr.detectChanges();
  }

  onColDrop(e: DragEvent, day: DayEntry): void {
    e.preventDefault();
    if (this.resizingEvent && this.resizePreview) {
      const ev = this.resizingEvent;
      const newEnd = this.resizePreview.newEnd;
      const durMin = Math.round((new Date(newEnd).getTime() - new Date(ev.start).getTime()) / 60000);
      this.calendarService.updateEvent(ev.id, { end: newEnd }).subscribe(updated => {
        this.events = this.events.map(e => e.id === updated.id ? updated : e);
        if (ev.todoRefId) {
          this.todosService.updateTodo(ev.todoRefId, { durationMinutes: durMin }).subscribe(() => {
            this.todos = this.todos.map(t => t.id === ev.todoRefId ? { ...t, durationMinutes: durMin } : t);
            this.cdr.detectChanges();
          });
        }
        this.cdr.detectChanges();
      });
      this.resizingEvent = null; this.resizePreview = null;
      this.cdr.detectChanges();
      return;
    }
    if (!this.dropPreview) return;
    const { hour, minute } = this.dropPreview;

    if (this.dragTodo) {
      const todo = this.dragTodo;
      const dur  = todo.durationMinutes ?? 60;
      if (dur > 120) {
        this.splitTodo = todo; this.splitDate = day.dateStr;
        this.splitHour = hour; this.splitMinute = minute;
        this.splitCount = Math.min(4, Math.ceil(dur / 60));
        this.showSplitModal = true;
      } else {
        this.doCreateFromTodo(todo, day.dateStr, hour, minute, dur);
      }
    } else if (this.dragEvent) {
      this.doMoveEvent(this.dragEvent, day.dateStr, hour, minute);
    }

    this.dragTodo = null; this.dragEvent = null; this.dropPreview = null;
    this.cdr.detectChanges();
  }

  @HostListener('document:dragend')
  onDocDragend(): void { this.dragTodo = null; this.dragEvent = null; this.dropPreview = null; this.resizingEvent = null; this.resizePreview = null; this.cdr.detectChanges(); }

  private doCreateFromTodo(todo: Todo, dateStr: string, h: number, m: number, dur: number): void {
    const start = new Date(`${dateStr}T${pad(h)}:${pad(m)}:00`);
    const end   = new Date(start.getTime() + dur * 60000);
    this.calendarService.createEvent({
      title: todo.title, description: todo.description,
      start: start.toISOString(), end: end.toISOString(),
      calendarType: todo.globalTodo ? 'household' : 'private',
      todoRefId: todo.id,
    }).subscribe(ev => { this.events = [...this.events, ev]; this.cdr.detectChanges(); });
  }

  private doMoveEvent(ev: CalendarEvent, dateStr: string, h: number, m: number): void {
    const dur   = ev.end ? (new Date(ev.end).getTime() - new Date(ev.start).getTime()) / 60000 : 60;
    const start = new Date(`${dateStr}T${pad(h)}:${pad(m)}:00`);
    const end   = new Date(start.getTime() + dur * 60000);
    this.calendarService.updateEvent(ev.id, { start: start.toISOString(), end: end.toISOString() }).subscribe(u => {
      this.events = this.events.map(e => e.id === u.id ? u : e); this.cdr.detectChanges();
    });
  }

  // â”€â”€ Split modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  addSplitWhole(): void {
    if (!this.splitTodo) return;
    this.doCreateFromTodo(this.splitTodo, this.splitDate, this.splitHour, this.splitMinute, this.splitTodo.durationMinutes ?? 60);
    this.showSplitModal = false; this.splitTodo = null;
  }

  confirmSplit(): void {
    if (!this.splitTodo) return;
    const partDur = this.splitSessionDuration();
    let h = this.splitHour, m = this.splitMinute;
    const requests = Array.from({ length: this.splitCount }, (_, i) => {
      const start = new Date(`${this.splitDate}T${pad(h)}:${pad(m)}:00`);
      const end   = new Date(start.getTime() + partDur * 60000);
      const next  = new Date(end.getTime() + 15 * 60000);
      h = next.getHours(); m = next.getMinutes();
      return this.calendarService.createEvent({
        title: `${this.splitTodo!.title} (${i + 1}/${this.splitCount})`,
        start: start.toISOString(), end: end.toISOString(),
        calendarType: this.splitTodo!.globalTodo ? 'household' : 'private',
        todoRefId: this.splitTodo!.id,
      });
    });
    forkJoin(requests).subscribe(evs => {
      this.events = [...this.events, ...evs]; this.showSplitModal = false; this.splitTodo = null; this.cdr.detectChanges();
    });
  }

  cancelSplit(): void { this.showSplitModal = false; this.splitTodo = null; }

  // â”€â”€ Event modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  openNewEvent(dateStr?: string): void {
    const d = dateStr ?? this.iso(new Date());
    this.editingEvent = null;
    this.modalForm = { ...this.emptyForm(), date: d };
    this.showModal = true; this.cdr.detectChanges();
  }

  onColClick(e: MouseEvent, day: DayEntry): void {
    if (this.justDragged) { this.justDragged = false; return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y    = Math.max(0, e.clientY - rect.top);
    const snapM = Math.round((y / HOUR_PX * 60) / 30) * 30;
    const absM  = START_HOUR * 60 + snapM;
    const h = Math.floor(absM / 60), m = absM % 60;
    this.editingEvent = null;
    this.modalForm = { ...this.emptyForm(), date: day.dateStr,
      startTime: `${pad(h)}:${pad(m)}`, endTime: `${pad(Math.min(h + 1, 22))}:${pad(m)}` };
    this.showModal = true; this.cdr.detectChanges();
  }

  onEvClick(ev: CalendarEvent, e: MouseEvent): void {
    e.stopPropagation();
    if (this.justDragged) { this.justDragged = false; return; }
    this.openEditEvent(ev);
  }

  private openEditEvent(ev: CalendarEvent): void {
    this.editingEvent = ev;
    const s = new Date(ev.start);
    const en = ev.end ? new Date(ev.end) : new Date(s.getTime() + 3600000);
    this.modalForm = {
      title: ev.title, date: ev.start.split('T')[0],
      startTime: `${pad(s.getHours())}:${pad(s.getMinutes())}`,
      endTime:   `${pad(en.getHours())}:${pad(en.getMinutes())}`,
      calendarType: ev.calendarType ?? 'household',
      description: ev.description ?? '', location: ev.location ?? '',
      color: ev.color ?? '', allDay: ev.allDay ?? false,
    };
    this.showModal = true; this.cdr.detectChanges();
  }

  closeModal(): void { this.showModal = false; this.editingEvent = null; }

  saveEvent(): void {
    if (!this.modalForm.title.trim()) return;
    let payload: Partial<CalendarEvent>;
    if (this.modalForm.allDay) {
      payload = {
        title: this.modalForm.title.trim(), description: this.modalForm.description,
        location: this.modalForm.location, calendarType: this.modalForm.calendarType as any,
        color: this.modalForm.color, allDay: true,
        start: new Date(this.modalForm.date).toISOString(),
      };
    } else {
      const s = new Date(`${this.modalForm.date}T${this.modalForm.startTime}:00`);
      const en = new Date(`${this.modalForm.date}T${this.modalForm.endTime}:00`);
      if (en <= s) en.setTime(s.getTime() + 3600000);
      payload = {
        title: this.modalForm.title.trim(), description: this.modalForm.description,
        location: this.modalForm.location, calendarType: this.modalForm.calendarType as any,
        color: this.modalForm.color, allDay: false,
        start: s.toISOString(), end: en.toISOString(),
      };
    }
    if (this.editingEvent) {
      this.calendarService.updateEvent(this.editingEvent.id, payload).subscribe(ev => {
        this.events = this.events.map(e => e.id === ev.id ? ev : e); this.closeModal(); this.cdr.detectChanges();
      });
    } else {
      this.calendarService.createEvent(payload).subscribe(ev => {
        this.events = [...this.events, ev]; this.closeModal(); this.cdr.detectChanges();
      });
    }
  }

  deleteEvent(): void {
    if (!this.editingEvent) return;
    const id = this.editingEvent.id;
    this.calendarService.deleteEvent(id).subscribe(() => {
      this.events = this.events.filter(e => e.id !== id); this.closeModal(); this.cdr.detectChanges();
    });
  }

  // â”€â”€ Availability â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  addMember(): void {
    if (!this.memberName.trim()) return;
    this.calendarService.createMember({ name: this.memberName.trim() }).subscribe(m => {
      this.members = [...this.members, m]; this.memberName = ''; this.cdr.detectChanges();
    });
  }

  getAvailability(memberId: string, ds: string): MemberAvailability | undefined {
    return this.availabilities.find(a => a.memberId === memberId && a.date === ds);
  }

  toggleLunch(memberId: string, ds: string, v: boolean): void {
    const cur = this.getAvailability(memberId, ds);
    this.calendarService.upsertAvailability({ id: cur?.id, memberId, date: ds, lunchPresent: v, dinnerPresent: cur?.dinnerPresent ?? true })
      .subscribe(s => { this.availabilities = [...this.availabilities.filter(a => a.id !== s.id), s]; this.cdr.detectChanges(); });
  }

  toggleDinner(memberId: string, ds: string, v: boolean): void {
    const cur = this.getAvailability(memberId, ds);
    this.calendarService.upsertAvailability({ id: cur?.id, memberId, date: ds, lunchPresent: cur?.lunchPresent ?? true, dinnerPresent: v })
      .subscribe(s => { this.availabilities = [...this.availabilities.filter(a => a.id !== s.id), s]; this.cdr.detectChanges(); });
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.showSplitModal) { this.cancelSplit(); return; }
    if (this.showModal) { this.closeModal(); return; }
  }

  // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private iso(d: Date): string { return d.toISOString().split('T')[0]; }

  private emptyForm(): EvModalForm {
    const now = new Date();
    const h = now.getHours(), m = Math.round(now.getMinutes() / 30) * 30 % 60;
    return {
      title: '', date: this.iso(now),
      startTime: `${pad(h)}:${pad(m)}`, endTime: `${pad(Math.min(h + 1, 22))}:${pad(m)}`,
      calendarType: 'household', description: '', location: '', color: '', allDay: false,
    };
  }
}

function pad(n: number): string { return String(n).padStart(2, '0'); }

