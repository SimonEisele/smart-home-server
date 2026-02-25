import { Component, OnInit, ViewChild, ElementRef, ChangeDetectorRef, NgZone } from '@angular/core';
import { TodosList } from '../component/todos';
import { TodosService } from '../service/todos.service';
import { Todo } from '../model/todos.model';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/auth/service/auth.service';
import { switchMap, catchError, of } from 'rxjs';

@Component({
  selector: 'todos-page',
  standalone: true,
  imports: [ CommonModule, FormsModule, TodosList ],
  templateUrl: './todos.page.html',
  styleUrl: './todos.page.css',
})
export class TodosPage implements OnInit {
  todos: Todo[] = [];
  showModal = false;
  showEditModal = false;
  newTodo: Partial<Todo> = { title: '', startDate: '', dueDate: '', durationMinutes: 30, progress: 0, done: false };
  editTodo: Partial<Todo> & { id?: string } = {};
  @ViewChild('titleInput') titleInput!: ElementRef;
  errors: { title?: string; startDate?: string; dueDate?: string; duration?: string } = {};

  constructor(private todosService: TodosService, private auth: AuthService, private zone: NgZone, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    // Ensure token, then ensure user context, then load todos
    this.auth.ensureAccessToken()
      .pipe(
        switchMap(() => this.auth.fetchUser()),
        catchError(() => of(null)),
        switchMap(() => this.todosService.getUserTodos())
      )
      .subscribe({
        next: todos => {
          // Force change detection in case the stream ran outside Angular zone
          this.zone.run(() => {
            this.todos = todos;
            this.cdr.detectChanges();
          });
        },
        error: err => { console.error('Failed to load todos:', err); }
      });
  }

  openModal() {
    this.showModal = true;
    setTimeout(() => this.titleInput?.nativeElement?.focus(), 0);
  }

  closeModal() {
    this.showModal = false;
    this.newTodo = { title: '', startDate: '', dueDate: '', durationMinutes: 30, progress: 0, done: false };
    this.errors = {};
  }

  openEditModal(todo: Todo) {
    this.editTodo = { ...todo };
    this.errors = {};
    this.showEditModal = true;
  }

  closeEditModal() {
    this.showEditModal = false;
    this.editTodo = {};
    this.errors = {};
  }

  saveTodo() {
    const errs = this.validateTodo(this.newTodo);
    if (Object.keys(errs).length) { this.errors = errs; return; }
    this.errors = {};
    this.todosService.addTodo(this.newTodo).subscribe(todo => {
      this.todos = [todo, ...this.todos];
      this.closeModal();
    });
  }

  onEnter() {
    // Validate on Enter; if valid and has title, save
    const errs = this.validateTodo(this.newTodo);
    if (Object.keys(errs).length) { this.errors = errs; return; }
    if (this.newTodo.title) this.saveTodo();
  }

  private validateTodo(t: Partial<Todo>): { title?: string; startDate?: string; dueDate?: string; duration?: string } {
    const errs: { title?: string; startDate?: string; dueDate?: string; duration?: string } = {};

    if (!t.title || t.title.trim().length === 0) {
      errs.title = 'Titel ist erforderlich.';
    }

    // Optional fields: startDate, dueDate
    let s: Date | null = null;
    let d: Date | null = null;
    if (t.startDate) {
      s = new Date(t.startDate as string);
      if (!isFinite(s.getTime())) {
        errs.startDate = 'Bitte gültiges Startdatum verwenden.';
      }
    }
    if (t.dueDate) {
      d = new Date(t.dueDate as string);
      if (!isFinite(d.getTime())) {
        errs.dueDate = 'Bitte gültiges Fälligkeitsdatum verwenden.';
      }
    }
    if (!errs.startDate && !errs.dueDate && s && d && s > d) {
      errs.dueDate = 'Startdatum darf nicht nach dem Fälligkeitsdatum liegen.';
    }

    // Optional duration
    if (typeof t.durationMinutes === 'number' && t.durationMinutes! < 0) {
      errs.duration = 'Dauer muss 0 oder größer sein.';
    }

    return errs;
  }

  saveEdit() {
    const errs = this.validateTodo(this.editTodo);
    if (Object.keys(errs).length) { this.errors = errs; return; }
    if (!this.editTodo.id) { return; }
    this.errors = {};
    this.todosService.updateTodo(this.editTodo.id, this.editTodo).subscribe(updated => {
      this.todos = this.todos.map(t => t.id === updated.id ? updated : t);
      this.closeEditModal();
    });
  }
}