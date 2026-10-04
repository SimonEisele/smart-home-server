import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TodosList } from './todos';

describe('TodosList', () => {
  let component: TodosList;
  let fixture: ComponentFixture<TodosList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TodosList]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TodosList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
