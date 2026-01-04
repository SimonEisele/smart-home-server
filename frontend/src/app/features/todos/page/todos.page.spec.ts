import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TodosPage } from './todos.page';

describe('TodosPage', () => {
  let component: TodosPage;
  let fixture: ComponentFixture<TodosPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TodosPage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TodosPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
