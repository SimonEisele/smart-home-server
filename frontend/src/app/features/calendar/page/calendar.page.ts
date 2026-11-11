import { DialogDirective } from '../../../shared/directives/dialog.directive';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { localIsoDate } from '../../../shared/utils/date-utils';
import { Component, DestroyRef, inject, ChangeDetectorRef, HostListener, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { CalendarEvent } from '../model/calendar.model';
import { CalendarService } from '../service/calendar.service';
import { TodosService } from '../../todos/service/todos.service';
import { Todo } from '../../todos/model/todos.model';
import { CleaningTask } from '../../cleaning/model/cleaning.model';
import { CleaningService } from '../../cleaning/service/cleaning.service';
import {
  DayEntry, DayTask, END_HOUR, HOUR_PX, START_HOUR, buildWeek, dayTasks, formatDuration, gridHeight, gridTop,
  overlapColumns, pad, parseLocalDate, todoOverdue, weekLabel,
} from '../utils/calendar.utils';

interface DropPreview { dateStr: string; top: number; h: number; label: string; hour: number; minute: number; }
interface PlanForm { date: string; time: string; duration: number; blocks: number; }
interface UndoAction { message: string; run: () => void; }
interface EvModalForm { title: string; date: string; startTime: string; endTime: string; calendarType: string; description: string; location: string; color: string; allDay: boolean; }
interface ResizePreview { evId: string; newH: number; newEnd: string; }


@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [DialogDirective, CommonModule, FormsModule, RouterLink],
  templateUrl: './calendar.page.html',
  styleUrl: './calendar.page.css',
})
export class CalendarPage implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly cleaningService = inject(CleaningService, { optional: true });
  private planAfterLoad: string | null = null;
  weekStart!: Date;
  weekDays: DayEntry[] = [];

  events:        CalendarEvent[]    = [];
  todos:         Todo[]             = [];
  cleaningTasks: CleaningTask[] = [];
  memberName = '';

  // Ticking off tasks and cleaning
  completing = new Set<string>();
  undoAction: UndoAction | null = null;
  private undoTimer: ReturnType<typeof setTimeout> | null = null;

  // "Einplanen" dialog (replaces the old split dialog)
  planTodo: Todo | null = null;
  planForm: PlanForm = { date: '', time: '09:00', duration: 60, blocks: 1 };
  planSaving = false;
  planError = '';

  showMoreOptions = false;

  // Filters
  showHousehold = true;
  showPrivate   = true;
  showTodos     = true;
  showCleaning  = true;

  // Drag & drop state
  dragTodo:       Todo | null          = null;
  dragEvent:      CalendarEvent | null = null;
  dragOffsetMin   = 0;
  dropPreview:    DropPreview | null   = null;
  sidebarDragOver = false;
  planningPending = new Set<string>();
  planningError = '';
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
  showModal = false;
  savingEvent = false;
  eventError = '';

  editingEvent: CalendarEvent | null = null;
  modalForm:   EvModalForm = this.emptyForm();


  // Now-line
  nowTop = 0;
  nowVisible = false;
  private nowTimer: any = null;

  readonly gridHours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  readonly GRID_H = (END_HOUR - START_HOUR) * HOUR_PX;
  constructor(
    private calendarService: CalendarService,
    private todosService: TodosService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // Links from other pages: ?date=YYYY-MM-DD opens that week, ?plan=<todo id> opens the plan dialog.
    const params = this.route?.snapshot?.queryParamMap;
    const date = params?.get('date');
    this.planAfterLoad = params?.get('plan') ?? null;
    this.initWeek(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? parseLocalDate(date) : new Date());
    this.load();
    this.updateNow();
    this.nowTimer = setInterval(() => { this.updateNow(); this.cdr.detectChanges(); }, 30000);
  }

  ngOnDestroy(): void { clearInterval(this.nowTimer); if (this.undoTimer) clearTimeout(this.undoTimer); }

  /** Scrolls the time grid to the current time, or the first appointment of a week without today. */
  private scrollGrid(): void {
    setTimeout(() => {
      // Phone agenda: start at today instead of Monday.
      const today = document.querySelector('.agenda-view .agenda-today');
      const agenda = document.querySelector('.agenda-view');
      if (today && agenda && getComputedStyle(agenda).display !== 'none') today.scrollIntoView({ block: 'start' });
      const el = document.getElementById('grid-scroll');
      if (!el) return;
      const timed = this.events.filter(e => !e.allDay && e.start).map(e => this.evTop(e));
      const target = this.weekDays.some(d => d.isToday) && this.nowVisible ? this.nowTop : Math.min(...timed, 2 * HOUR_PX);
      el.scrollTop = Math.max(0, target - 120);
    }, 50);
  }

  // â”€â”€ Week nav â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  prevWeek(): void { const d = new Date(this.weekStart); d.setDate(d.getDate() - 7); this.initWeek(d); this.loadEvents(); }
  nextWeek(): void { const d = new Date(this.weekStart); d.setDate(d.getDate() + 7); this.initWeek(d); this.loadEvents(); }

  goToday(): void {
    this.initWeek(new Date());
    this.loadEvents();
  }

  get isCurrentWeek(): boolean { return this.weekDays.some(d => d.isToday); }

  private initWeek(d: Date): void {
    const week = buildWeek(d);
    this.weekStart = week.weekStart;
    this.weekDays = week.days;
  }

  get weekLabel(): string { return weekLabel(this.weekDays); }

  // â”€â”€ Loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private load(): void {
    this.loadEvents();
    this.calendarService.getCleaningTasks().subscribe(t => { this.cleaningTasks = t; this.cdr.detectChanges(); });
    this.todosService.getUserTodos().subscribe(t => {
      this.todos = t;
      const plan = this.planAfterLoad && t.find(todo => todo.id === this.planAfterLoad);
      this.planAfterLoad = null;
      if (plan && !plan.done) this.openPlan(plan);
      this.cdr.detectChanges();
    });
  }

  private loadEvents(): void {
    if (!this.weekDays.length) return;
    const start = this.weekDays[0].dateStr;
    const end   = this.weekDays[6].dateStr;
    this.calendarService.getEvents(start, end).subscribe(evs => {
      if (this.weekDays[0]?.dateStr !== start) return;
      this.events = evs;
      this.cdr.detectChanges();
      this.scrollGrid();
    });
  }

  // â”€â”€ Computed views â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  /** One-off tasks that still need a time block (recurring ones show up on their days). */
  get openTodos(): Todo[] {
    const scheduled = new Set(
      this.events.filter(e => !!e.todoRefId).map(e => e.todoRefId!)
    );
    return this.todos
      .filter(t => !t.done && !t.recurrence && !scheduled.has(t.id) && !t.plannedSlots?.length)
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  }

  todoDueLabel(todo: Todo): string {
    if (!todo.dueDate) return '';
    const due = new Date(todo.dueDate);
    return `${todoOverdue(todo) ? 'Überfällig seit' : 'Fällig'} ${due.getDate()}.${due.getMonth() + 1}.`;
  }

  // ── Tasks and cleaning per day ───────────────────────────────────────────

  tasksForDay(dateStr: string): DayTask[] {
    return dayTasks(this.todos, this.cleaningTasks, dateStr)
      .filter(t => (t.kind === 'todo' ? this.showTodos : this.showCleaning));
  }

  /** Ticks off a task (recurring ones move to their next date) or logs a cleaning job. */
  completeTask(item: DayTask, dateStr: string, e?: Event): void {
    e?.stopPropagation();
    if (this.completing.has(item.key)) return;
    this.completing.add(item.key); this.planningError = '';
    const done = () => { this.completing.delete(item.key); this.cdr.markForCheck(); };
    if (item.todo) {
      const original = item.todo;
      this.todosService.completeTodo(original.id, dateStr).pipe(takeUntilDestroyed(this.destroyRef), finalize(done)).subscribe({
        next: result => {
          this.replaceTodo({ ...result.data, plannedSlots: original.plannedSlots });
          const next = result.advancedTo ? parseLocalDate(result.advancedTo) : null;
          this.offerUndo(next ? `„${original.title}“ erledigt · nächstes Mal ${next.getDate()}.${next.getMonth() + 1}.`
                               : `„${original.title}“ erledigt`,
            () => this.todosService.updateTodo(original.id, result.advancedTo
              ? { startDate: result.previous.startDate ?? null, dueDate: result.previous.dueDate ?? null }
              : { done: false }).subscribe(t => this.replaceTodo({ ...t, plannedSlots: original.plannedSlots })));
        },
        error: () => { this.planningError = 'Die Aufgabe konnte nicht abgehakt werden. Bitte erneut versuchen.'; },
      });
    } else if (item.cleaning && this.cleaningService) {
      const task = item.cleaning, today = localIsoDate(new Date());
      const doneAt = dateStr < today ? dateStr : today;
      this.cleaningService.logCompletion(task.id, doneAt).pipe(takeUntilDestroyed(this.destroyRef), finalize(done)).subscribe({
        next: log => {
          const previous = task.lastDoneAt ?? null;
          this.cleaningTasks = this.cleaningTasks.map(t => t.id === task.id
            ? { ...t, logs: [log, ...(t.logs ?? [])], lastDoneAt: previous && previous > log.doneAt ? previous : log.doneAt } : t);
          this.offerUndo(`„${task.name}“ geputzt`, () => this.cleaningService!.deleteLog(log.id).subscribe(() => {
            this.cleaningTasks = this.cleaningTasks.map(t => t.id === task.id
              ? { ...t, logs: (t.logs ?? []).filter(l => l.id !== log.id), lastDoneAt: previous } : t);
            this.cdr.markForCheck();
          }));
        },
        error: () => { this.planningError = 'Die Reinigung konnte nicht gespeichert werden. Bitte erneut versuchen.'; },
      });
    }
  }

  private replaceTodo(todo: Todo): void {
    this.todos = this.todos.map(t => t.id === todo.id ? todo : t);
    this.cdr.markForCheck();
  }

  private offerUndo(message: string, run: () => void): void {
    if (this.undoTimer) clearTimeout(this.undoTimer);
    this.undoAction = { message, run };
    this.undoTimer = setTimeout(() => { this.undoAction = null; this.cdr.markForCheck(); }, 8000);
  }

  undo(): void {
    const action = this.undoAction;
    this.undoAction = null;
    if (this.undoTimer) clearTimeout(this.undoTimer);
    action?.run();
  }

  /** Opens the task behind a calendar item: plan one-off tasks, jump to cleaning otherwise. */
  openDayTask(item: DayTask, dateStr: string): void {
    if (item.todo && !item.todo.recurrence) this.openPlan(item.todo, dateStr);
  }

  eventsForDay(dateStr: string): CalendarEvent[] {
    return this.events.filter(ev => {
      if (ev.allDay) return false;
      if (!ev.start || localIsoDate(new Date(ev.start)) !== dateStr) return false;
      if (ev.calendarType === 'private'   && !this.showPrivate)   return false;
      if ((ev.calendarType ?? 'household') === 'household' && !this.showHousehold) return false;
      return true;
    }).sort((a, b) => a.start.localeCompare(b.start));
  }

  allDayEventsForDay(dateStr: string): CalendarEvent[] {
    return this.events.filter(ev => ev.allDay && ev.start && localIsoDate(new Date(ev.start)) === dateStr && (ev.calendarType === 'private' ? this.showPrivate : this.showHousehold));
  }

  evTop(ev: CalendarEvent): number { return gridTop(new Date(ev.start)); }

  /** Horizontal placement so overlapping appointments sit next to each other. */
  evLane(ev: CalendarEvent, dateStr: string): { left: string; width: string } {
    const lane = overlapColumns(this.eventsForDay(dateStr))[ev.id] ?? { col: 0, cols: 1 };
    return { left: `calc(${(lane.col * 100) / lane.cols}% + 3px)`, width: `calc(${100 / lane.cols}% - 6px)` };
  }

  evHeight(ev: CalendarEvent): number {
    if (this.resizePreview?.evId === ev.id) return this.resizePreview.newH;
    return gridHeight(ev.start, ev.end);
  }

  get hasPrivateEvents(): boolean { return this.events.some(e => e.calendarType === 'private'); }

  evClass(ev: CalendarEvent): string {
    const type = ev.calendarType ?? 'household';
    const todo = ev.todoRefId ? ' ev-todo' + (this.linkedTodo(ev)?.done ? ' ev-task-done' : '') : '';
    return `cal-ev ev-${type}${todo}`;
  }

  evColor(ev: CalendarEvent): string { return ev.color ?? ''; }

  formatDuration(min?: number | null): string { return formatDuration(min); }

  updateNow(): void {
    const now = new Date();
    this.nowTop = gridTop(now);
    this.nowVisible = now.getHours() >= START_HOUR && now.getHours() < END_HOUR;
  }

  // ── Einplanen ─────────────────────────────────────────────────────────────
  /** One dialog for planning a task: date, time, duration and optionally several blocks. */
  openPlan(todo: Todo, dateStr?: string, hour?: number, minute = 0, e?: Event): void {
    e?.stopPropagation();
    const now = new Date();
    const weekDay = this.weekDays.find(d => d.isToday)?.dateStr ?? this.weekDays[0]?.dateStr;
    const start = hour ?? Math.min(Math.max(now.getHours() + 1, START_HOUR + 2), END_HOUR - 2);
    const duration = todo.durationMinutes || 60;
    this.planTodo = todo;
    this.planError = '';
    this.planForm = {
      date: dateStr ?? weekDay ?? this.iso(now),
      time: `${pad(start)}:${pad(minute)}`,
      duration,
      blocks: duration > 120 ? Math.min(4, Math.ceil(duration / 120)) : 1,
    };
    this.cdr.detectChanges();
  }

  get planBlockMinutes(): number {
    return Math.max(5, Math.ceil((this.planForm.duration || 60) / Math.max(1, this.planForm.blocks)));
  }

  setPlanBlocks(delta: number): void {
    this.planForm = { ...this.planForm, blocks: Math.min(8, Math.max(1, this.planForm.blocks + delta)) };
  }

  closePlan(): void { if (!this.planSaving) { this.planTodo = null; this.planError = ''; } }

  confirmPlan(): void {
    const todo = this.planTodo;
    if (!todo || this.planSaving) return;
    if (!this.planForm.date || !/^\d{2}:\d{2}$/.test(this.planForm.time) || !(this.planForm.duration > 0)) {
      this.planError = 'Bitte Datum, Uhrzeit und Dauer angeben.'; return;
    }
    const blocks = Math.max(1, this.planForm.blocks), part = this.planBlockMinutes;
    let start = new Date(`${this.planForm.date}T${this.planForm.time}:00`);
    const requests = Array.from({ length: blocks }, (_, i) => {
      const end = new Date(start.getTime() + part * 60000);
      const request = this.calendarService.createEvent({
        title: blocks > 1 ? `${todo.title} (${i + 1}/${blocks})` : todo.title,
        description: todo.description,
        start: start.toISOString(), end: end.toISOString(),
        calendarType: todo.globalTodo ? 'household' : 'private', todoRefId: todo.id,
      });
      start = new Date(end.getTime() + 15 * 60000); // 15 min pause between blocks
      return request;
    });
    this.planSaving = true; this.planError = '';
    forkJoin(requests).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.planSaving = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: evs => {
          this.addEvents(evs);
          this.planTodo = null;
          if (!this.weekDays.some(d => d.dateStr === this.planForm.date)) this.initWeekAndLoad(parseLocalDate(this.planForm.date));
        },
        error: () => { this.planError = 'Die Aufgabe konnte nicht eingeplant werden. Bitte erneut versuchen.'; },
      });
  }

  private initWeekAndLoad(date: Date): void { this.initWeek(date); this.loadEvents(); }

  /** Adds new blocks to the week and to their task, so it leaves the "Noch einplanen" list. */
  private addEvents(evs: CalendarEvent[]): void {
    this.events = [...this.events, ...evs];
    for (const ev of evs.filter(e => e.todoRefId)) {
      this.todos = this.todos.map(t => t.id === ev.todoRefId
        ? { ...t, plannedSlots: [...(t.plannedSlots ?? []), { id: ev.id, start: ev.start, end: ev.end ?? null }] } : t);
    }
  }

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
    const newOverSidebar = !!this.touchDragEvent?.todoRefId && !!hit?.closest('.todo-sidebar');
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
      this.unscheduleEvent(ev);
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
          if (dur > 120) this.openPlan(todo, day.dateStr, hour, minute);
          else this.doCreateFromTodo(todo, day.dateStr, hour, minute, dur);
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
  linkedTodo(ev: CalendarEvent | null): Todo | undefined { return this.todos.find(t => t.id === ev?.todoRefId); }

  onSidebarDragover(e: DragEvent): void {
    if (!this.dragEvent?.todoRefId || this.resizingEvent) return;
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    this.sidebarDragOver = true; this.dropPreview = null; this.cdr.markForCheck();
  }
  onSidebarDragleave(e: DragEvent): void {
    if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
    this.sidebarDragOver = false; this.cdr.markForCheck();
  }
  onSidebarDrop(e: DragEvent): void {
    e.preventDefault(); e.stopPropagation();
    const ev = this.dragEvent;
    this.onDocDragend();
    if (ev?.todoRefId) this.unscheduleEvent(ev);
  }
  unscheduleEvent(ev: CalendarEvent): void {
    if (!ev.todoRefId || this.planningPending.has(ev.id) || (this.savingEvent && this.editingEvent?.id === ev.id)) return;
    this.planningPending.add(ev.id); this.planningError = ''; this.eventError = '';
    this.calendarService.deleteEvent(ev.id)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.planningPending.delete(ev.id); this.cdr.markForCheck(); }))
      .subscribe({ next: () => {
        this.events = this.events.filter(e => e.id !== ev.id);
        this.todos = this.todos.map(t => t.id === ev.todoRefId
          ? { ...t, plannedSlots: (t.plannedSlots ?? []).filter(slot => slot.id !== ev.id) } : t);
        if (this.editingEvent?.id === ev.id) this.closeModal();
      }, error: () => {
        this.planningError = 'Die Planung konnte nicht entfernt werden. Aufgabe und Termin bleiben erhalten.';
        this.eventError = this.planningError;
      } });
  }

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
      if (dur > 120) this.openPlan(todo, day.dateStr, hour, minute);
      else this.doCreateFromTodo(todo, day.dateStr, hour, minute, dur);
    } else if (this.dragEvent) {
      this.doMoveEvent(this.dragEvent, day.dateStr, hour, minute);
    }

    this.dragTodo = null; this.dragEvent = null; this.dropPreview = null;
    this.cdr.detectChanges();
  }

  @HostListener('document:dragend')
  onDocDragend(): void { this.sidebarDragOver = false; this.dragTodo = null; this.dragEvent = null; this.dropPreview = null; this.resizingEvent = null; this.resizePreview = null; this.cdr.detectChanges(); }

  private doCreateFromTodo(todo: Todo, dateStr: string, h: number, m: number, dur: number): void {
    const start = new Date(`${dateStr}T${pad(h)}:${pad(m)}:00`);
    const end   = new Date(start.getTime() + dur * 60000);
    if (this.planningPending.has(todo.id)) return;
    this.planningPending.add(todo.id); this.planningError = '';
    this.calendarService.createEvent({
      title: todo.title, description: todo.description,
      start: start.toISOString(), end: end.toISOString(),
      calendarType: todo.globalTodo ? 'household' : 'private', todoRefId: todo.id,
    }).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.planningPending.delete(todo.id); this.cdr.markForCheck(); }))
      .subscribe({ next: ev => { this.addEvents([ev]); }, error: () => { this.planningError = 'Die Aufgabe konnte nicht eingeplant werden. Bitte erneut versuchen.'; } });
  }

  private doMoveEvent(ev: CalendarEvent, dateStr: string, h: number, m: number): void {
    const dur   = ev.end ? (new Date(ev.end).getTime() - new Date(ev.start).getTime()) / 60000 : 60;
    const start = new Date(`${dateStr}T${pad(h)}:${pad(m)}:00`);
    const end   = new Date(start.getTime() + dur * 60000);
    this.calendarService.updateEvent(ev.id, { start: start.toISOString(), end: end.toISOString() }).subscribe(u => {
      this.events = this.events.map(e => e.id === u.id ? u : e); this.cdr.detectChanges();
    });
  }

  // â”€â”€ Event modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  openNewEvent(dateStr?: string): void {
    const d = dateStr ?? this.iso(new Date());
    this.editingEvent = null;
    this.modalForm = { ...this.emptyForm(), date: d };
    this.showMoreOptions = false;
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
    this.showMoreOptions = false;
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
      title: ev.title, date: localIsoDate(s),
      startTime: `${pad(s.getHours())}:${pad(s.getMinutes())}`,
      endTime:   `${pad(en.getHours())}:${pad(en.getMinutes())}`,
      calendarType: ev.calendarType ?? 'household',
      description: ev.description ?? '', location: ev.location ?? '',
      color: ev.color ?? '', allDay: ev.allDay ?? false,
    };
    this.showMoreOptions = !!(ev.location || ev.description || ev.color);
    this.showModal = true; this.cdr.detectChanges();
  }

  /** Ticks off the task behind a planned block straight from the appointment dialog. */
  completeLinkedTodo(): void {
    const todo = this.linkedTodo(this.editingEvent);
    if (!todo || todo.done) return;
    const dateStr = this.modalForm.date;
    this.closeModal();
    this.completeTask({ kind: 'todo', key: `todo:${todo.id}`, title: todo.title, overdue: false,
                        recurring: !!todo.recurrence, todo }, dateStr);
  }

  closeModal(): void { if (this.savingEvent) return; this.eventError = ""; this.showModal = false; this.editingEvent = null; }

  saveEvent(): void {
    if (this.savingEvent || (this.editingEvent && this.planningPending.has(this.editingEvent.id))) return;
    this.eventError = '';
    if (!this.modalForm.title.trim() || !this.modalForm.date) { this.eventError = 'Titel und Datum sind erforderlich.'; return; }
    if (!this.modalForm.allDay && (!this.modalForm.startTime || !this.modalForm.endTime || this.modalForm.endTime <= this.modalForm.startTime)) {
      this.eventError = 'Die Endzeit muss nach der Startzeit liegen.'; return;
    }
    let payload: Partial<CalendarEvent>;
    if (this.modalForm.allDay) {
      payload = {
        title: this.modalForm.title.trim(), description: this.modalForm.description,
        location: this.modalForm.location, calendarType: this.modalForm.calendarType as any,
        color: this.modalForm.color, allDay: true,
        start: new Date(this.modalForm.date + 'T00:00:00').toISOString(),
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
    this.savingEvent = true;
    const request = this.editingEvent ? this.calendarService.updateEvent(this.editingEvent.id, payload) : this.calendarService.createEvent(payload);
    request.pipe(finalize(() => { this.savingEvent = false; this.cdr.markForCheck(); })).subscribe({
      next: ev => {
        this.events = this.editingEvent ? this.events.map(e => e.id === ev.id ? ev : e) : [...this.events, ev];
        if (!this.weekDays.some(d => d.dateStr === this.modalForm.date)) this.initWeekAndLoad(parseLocalDate(this.modalForm.date));
        this.savingEvent = false; this.closeModal(); this.cdr.markForCheck();
      },
      error: () => { this.eventError = 'Speichern fehlgeschlagen. Deine Eingaben bleiben erhalten.'; this.cdr.markForCheck(); },
    });
  }

  deleteEvent(): void {
    if (!this.editingEvent) return;
    const id = this.editingEvent.id;
    this.calendarService.deleteEvent(id).subscribe(() => {
      this.events = this.events.filter(e => e.id !== id); this.closeModal(); this.cdr.detectChanges();
    });
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.planTodo) { this.closePlan(); return; }
    if (this.showModal) { this.closeModal(); return; }
  }

  // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private iso(d: Date): string { return localIsoDate(d); }

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

