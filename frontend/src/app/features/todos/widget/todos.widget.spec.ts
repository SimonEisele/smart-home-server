import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TodosWidget } from './todos.widget';

describe('TodosWidget', () => {
  let component: TodosWidget;
  let fixture: ComponentFixture<TodosWidget>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TodosWidget]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TodosWidget);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
