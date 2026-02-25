import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Todo } from '../model/todos.model';
import { TodosService } from '../service/todos.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'todos-widget',
  standalone: true,
  imports: [ CommonModule ],
  templateUrl: './todos.widget.html',
  styleUrl: './todos.widget.css',
})
export class TodosWidget implements OnInit, AfterViewInit {
  @ViewChild('container', { static: true })
  container!: ElementRef<HTMLDivElement>;

  openTodos: Todo[] = [];
  visibleTodos: Todo[] = [];

  readonly MARGIN = 12;
  
  constructor(private todosService: TodosService) {}

  ngOnInit(): void {
    this.todosService.getUserTodos().subscribe(todos => {
      this.openTodos = todos
        .filter(t => !t.done)
        .sort((a, b) =>
          new Date(a.dueDate ?? '').getTime() -
          new Date(b.dueDate ?? '').getTime()
        );
      setTimeout(() => this.updateVisibleTodos());
    });
  }

  ngAfterViewInit(): void {
    const observer = new ResizeObserver(() => {
      setTimeout(() => this.updateVisibleTodos());
    });

    observer.observe(this.container.nativeElement);
    setTimeout(() => this.updateVisibleTodos());
  }
  
  updateVisibleTodos() {
    const height = this.container.nativeElement.clientHeight;

    if (height <= 0) return;

    const firstLi = this.container.nativeElement.querySelector('li');
    const rowHeight = firstLi?.getBoundingClientRect().height ?? 48;

    const maxTodos = Math.floor(
      (height + this.MARGIN) / (rowHeight + this.MARGIN)
    );

    this.visibleTodos = this.openTodos.slice(0, Math.max(maxTodos, 1));
  }

  isOverdue(todo: Todo): boolean {
    if (!todo.dueDate) return false;
    const due = new Date(todo.dueDate);
    const now = new Date();
    return due < now && !todo.done && !this.isDueToday(todo);
  }

  isDueToday(todo: Todo): boolean {
    if (!todo.dueDate) return false;
    const due = new Date(todo.dueDate);
    const now = new Date();
    return due.getFullYear() === now.getFullYear() && due.getMonth() === now.getMonth() && due.getDate() === now.getDate() && !todo.done;
  }
}