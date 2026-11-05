import { DatePipe } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { interval, Subscription } from 'rxjs';

@Component({
  selector: 'app-datetime',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './datetime.html',
  styleUrl: './datetime.css',
})
export class DateTimeWidget implements OnInit, OnDestroy {
  now = new Date();
  private sub?: Subscription;

  constructor(private cdr: ChangeDetectorRef) {}

  /** Share of the day that has passed, in percent. */
  get dayProgress(): number {
    const minutes = this.now.getHours() * 60 + this.now.getMinutes();
    return Math.round(minutes / 1440 * 100);
  }

  /** ISO 8601 calendar week. */
  get weekNumber(): number {
    const date = new Date(Date.UTC(this.now.getFullYear(), this.now.getMonth(), this.now.getDate()));
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

  get dayOfYear(): number {
    const start = new Date(this.now.getFullYear(), 0, 1);
    const today = new Date(this.now.getFullYear(), this.now.getMonth(), this.now.getDate());
    return Math.round((today.getTime() - start.getTime()) / 86400000) + 1;
  }

  ngOnInit() {
    this.sub = interval(1000).subscribe(() => {
      this.now = new Date();
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }
}