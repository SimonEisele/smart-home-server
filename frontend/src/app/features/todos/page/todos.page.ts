import { Component, OnInit } from '@angular/core';
import { TodosList } from '../component/todos';
import { TodosService } from '../services/todos.service';
import { Todo } from '../model/todos.model';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-todos-page',
  standalone: true,
  imports: [ CommonModule, TodosList ],
  templateUrl: './todos.page.html',
  styleUrl: './todos.page.css',
})
export class TodosPage implements OnInit {
  todos: Todo[] = [];

  constructor(private todosService: TodosService) {}

  ngOnInit(): void {
    this.todosService.getUserTodos().subscribe(todos => {
      this.todos = todos;
    });
  }
}