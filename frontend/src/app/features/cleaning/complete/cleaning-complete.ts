import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import { localIsoDate } from '../../../shared/utils/date-utils';
import { initials, personColor } from '../../todos/utils/todo-utils';
import { CleaningPerson, CleaningTask } from '../model/cleaning.model';
import { room } from '../utils/cleaning-utils';

export interface CompletionEntry { doneAt: string; doneBy: string | null; note: string; }

/**
 * Log a completion with details: another day, someone else, a note. Steps are
 * shown to tick through while cleaning; they are a guide and are not stored.
 */
@Component({
  selector: 'app-cleaning-complete',
  standalone: true,
  imports: [DialogDirective, FormsModule],
  templateUrl: './cleaning-complete.html',
  styleUrls: ['../../todos/editor/todo-editor.css', './cleaning-complete.css'],
})
export class CleaningComplete implements OnInit {
  @Input({ required: true }) task!: CleaningTask;
  @Input() people: CleaningPerson[] = [];
  @Input() saving = false;
  @Input() error = '';
  @Output() confirmed = new EventEmitter<CompletionEntry>();
  @Output() closed = new EventEmitter<void>();

  doneAt = '';
  doneBy: string | null = null;
  note = '';
  ticked = new Set<number>();
  dateError = '';

  readonly today = localIsoDate(new Date());
  readonly days = [0, 1, 2].map(back => {
    const d = new Date();
    d.setDate(d.getDate() - back);
    return { date: localIsoDate(d), label: back === 0 ? 'Heute' : back === 1 ? 'Gestern' : 'Vorgestern' };
  });
  readonly initials = initials;
  readonly personColor = personColor;

  get icon(): string { return room(this.task.category).icon; }
  get steps(): string[] { return this.task.checklist ?? []; }
  get otherDay(): boolean { return !this.days.some(d => d.date === this.doneAt); }

  ngOnInit(): void {
    this.doneAt = this.today;
    this.doneBy = this.people.find(p => p.isMe)?.id ?? null;
  }

  toggleStep(index: number): void {
    const next = new Set(this.ticked);
    if (next.has(index)) next.delete(index); else next.add(index);
    this.ticked = next;
  }

  close(): void { if (!this.saving) this.closed.emit(); }

  submit(): void {
    if (this.saving) return;
    if (!this.doneAt || this.doneAt > this.today) { this.dateError = 'Bitte ein Datum bis heute wählen.'; return; }
    this.dateError = '';
    this.confirmed.emit({ doneAt: this.doneAt, doneBy: this.doneBy, note: this.note.trim() });
  }
}
