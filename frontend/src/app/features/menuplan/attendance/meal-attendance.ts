import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, OnChanges, OnInit, Output, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize, forkJoin } from 'rxjs';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import { AuthService } from '../../../core/auth/service/auth.service';
import { CalendarService } from '../../calendar/service/calendar.service';
import { ExternalMealGuest, UserMealAttendance } from '../../calendar/model/calendar.model';
import { DayEntry } from '../../calendar/utils/calendar.utils';

export type Meal = 'breakfast' | 'lunch' | 'dinner';

/**
 * "Wer isst mit?" for one week: own attendance per meal plus guests.
 * Lives in the menu plan, where the person counts are used; emits `changed`
 * after every save so the plan can refresh its counts.
 */
@Component({
  selector: 'app-meal-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogDirective],
  templateUrl: './meal-attendance.html',
  styleUrl: './meal-attendance.css',
})
export class MealAttendance implements OnInit, OnChanges {
  private readonly destroyRef = inject(DestroyRef);
  private readonly calendarService = inject(CalendarService);
  private readonly authService = inject(AuthService, { optional: true });
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() days: DayEntry[] = [];
  @Output() changed = new EventEmitter<void>();

  readonly MEALS: Array<{ key: Meal; label: string }> = [
    { key: 'breakfast', label: 'Frühstück' },
    { key: 'lunch', label: 'Mittag' },
    { key: 'dinner', label: 'Abend' },
  ];

  currentUserId: string | null = null;
  isHouseholdAccount = false;
  mealAttendances: UserMealAttendance[] = [];
  externalGuests: ExternalMealGuest[] = [];
  attendanceLoading = false;
  attendanceReady = false;
  attendanceError = '';
  attendancePending = new Set<string>();

  addingGuestFor: { dateStr: string; meal: Meal } | null = null;
  newGuestName = '';
  guestSaving = false;
  guestError = '';
  guestDeleting = new Set<string>();

  private loadedStart = '';

  ngOnInit(): void {
    this.authService?.user$?.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(u => {
      this.currentUserId = u?.id ?? null;
      this.isHouseholdAccount = u?.is_household_account ?? false;
      this.cdr.markForCheck();
    });
  }

  ngOnChanges(): void {
    const start = this.days[0]?.dateStr ?? '';
    if (start && start !== this.loadedStart) this.loadAttendance();
  }

  loadAttendance(): void {
    const start = this.days[0]?.dateStr, end = this.days[this.days.length - 1]?.dateStr;
    if (!start || !end) return;
    this.loadedStart = start;
    this.attendanceLoading = true; this.attendanceReady = false; this.attendanceError = '';
    forkJoin({ attendance: this.calendarService.getMealAttendance(start, end), guests: this.calendarService.getExternalGuests(start, end) })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: result => {
          if (this.days[0]?.dateStr !== start) return;
          this.mealAttendances = result.attendance; this.externalGuests = result.guests;
          this.attendanceLoading = false; this.attendanceReady = true; this.cdr.markForCheck();
        },
        error: () => {
          if (this.days[0]?.dateStr !== start) return;
          this.attendanceLoading = false;
          this.attendanceError = 'Die Anwesenheiten konnten nicht geladen werden. Bitte erneut versuchen.';
          this.cdr.markForCheck();
        },
      });
  }

  mealAttendeesForDay(dateStr: string, meal: Meal): UserMealAttendance[] {
    return this.mealAttendances.filter(a => a.date === dateStr && (
      meal === 'breakfast' ? a.breakfastPresent : meal === 'lunch' ? a.lunchPresent : a.dinnerPresent));
  }

  mealCount(dateStr: string, meal: Meal): number {
    return this.mealAttendeesForDay(dateStr, meal).length + this.externalGuestsForMeal(dateStr, meal).length;
  }

  myAttendanceForDay(dateStr: string): UserMealAttendance | undefined {
    return this.mealAttendances.find(a => a.date === dateStr && a.userId === this.currentUserId);
  }

  attendanceDisplayName(a: UserMealAttendance): string {
    const sameFirst = new Set(this.mealAttendances.filter(x => x.userFirstName === a.userFirstName).map(x => x.userId)).size > 1;
    return sameFirst ? `${a.userFirstName} ${a.userLastName}`.trim() : a.userFirstName;
  }

  mealIsActive(dateStr: string, meal: Meal): boolean {
    const rec = this.myAttendanceForDay(dateStr);
    if (!rec) return false; // opt-in: absent by default
    return meal === 'breakfast' ? rec.breakfastPresent : meal === 'lunch' ? rec.lunchPresent : rec.dinnerPresent;
  }

  mealLabel(meal: string): string { return this.MEALS.find(m => m.key === meal)?.label ?? meal; }
  allMealsActive(date: string): boolean { return this.MEALS.every(m => this.mealIsActive(date, m.key)); }

  toggleWholeDay(date: string): void {
    const value = !this.allMealsActive(date);
    this.saveAttendance(date, value, value, value);
  }

  toggleMealAttendance(dateStr: string, meal: Meal): void {
    const existing = this.myAttendanceForDay(dateStr);
    this.saveAttendance(dateStr,
      meal === 'breakfast' ? !existing?.breakfastPresent : existing?.breakfastPresent ?? false,
      meal === 'lunch' ? !existing?.lunchPresent : existing?.lunchPresent ?? false,
      meal === 'dinner' ? !existing?.dinnerPresent : existing?.dinnerPresent ?? false);
  }

  /** Signs up for every meal of the week at once (or off again when already in for all). */
  get allWeekActive(): boolean { return this.days.every(d => this.allMealsActive(d.dateStr)); }

  toggleWholeWeek(): void {
    const value = !this.allWeekActive;
    for (const day of this.days) {
      if (this.allMealsActive(day.dateStr) !== value) this.saveAttendance(day.dateStr, value, value, value);
    }
  }

  private saveAttendance(date: string, breakfast: boolean, lunch: boolean, dinner: boolean): void {
    if (this.isHouseholdAccount || !this.currentUserId || !this.attendanceReady || this.attendanceLoading || this.attendancePending.has(date)) return;
    this.attendancePending.add(date); this.attendanceError = '';
    this.calendarService.setMealAttendance(date, breakfast, lunch, dinner)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.attendancePending.delete(date); this.cdr.markForCheck(); }))
      .subscribe({
        next: updated => {
          // A week switch during a request must not insert an old week's record.
          if (!this.days.some(d => d.dateStr === date)) return;
          this.mealAttendances = [...this.mealAttendances.filter(a => !(a.date === date && a.userId === this.currentUserId)), updated];
          this.changed.emit();
        },
        error: () => { this.attendanceError = 'Die Änderung wurde nicht gespeichert. Deine bisherige Anwesenheit bleibt erhalten.'; },
      });
  }

  externalGuestsForMeal(dateStr: string, meal: Meal): ExternalMealGuest[] {
    return this.externalGuests.filter(g => g.date === dateStr && g.meal === meal);
  }

  openAddGuest(dateStr: string, meal: Meal, e: Event): void {
    e.stopPropagation();
    if (this.guestSaving) return;
    this.guestError = '';
    this.addingGuestFor = { dateStr, meal };
    this.newGuestName = '';
  }

  closeAddGuest(): void { if (this.guestSaving) return; this.addingGuestFor = null; this.newGuestName = ''; this.guestError = ''; }

  submitAddGuest(): void {
    const name = this.newGuestName.trim(), target = this.addingGuestFor;
    if (!name || !target || this.guestSaving) return;
    this.guestSaving = true; this.guestError = '';
    this.calendarService.addExternalGuest(name, target.dateStr, target.meal)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.guestSaving = false; this.cdr.markForCheck(); }))
      .subscribe({ next: guest => {
        if (this.days.some(d => d.dateStr === target.dateStr)) this.externalGuests = [...this.externalGuests, guest];
        this.addingGuestFor = null; this.newGuestName = '';
        this.changed.emit();
      }, error: () => { this.guestError = 'Der Gast konnte nicht gespeichert werden. Bitte erneut versuchen.'; } });
  }

  removeExternalGuest(id: string, e: Event): void {
    e.stopPropagation();
    if (this.guestDeleting.has(id)) return;
    this.guestDeleting.add(id); this.attendanceError = '';
    this.calendarService.removeExternalGuest(id)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.guestDeleting.delete(id); this.cdr.markForCheck(); }))
      .subscribe({ next: () => { this.externalGuests = this.externalGuests.filter(g => g.id !== id); this.changed.emit(); },
        error: () => { this.attendanceError = 'Der Gast konnte nicht entfernt werden. Bitte erneut versuchen.'; } });
  }
}
