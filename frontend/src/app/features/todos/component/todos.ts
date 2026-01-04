import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Todo } from '../model/todos.model';

@Component({
  selector: 'todos-list',
  standalone: true,
  imports: [ CommonModule ],
  templateUrl: './todos.html',
  styleUrl: './todos.css'
})
export class TodosList {
  @Input() todos: Todo[] = [];
}
