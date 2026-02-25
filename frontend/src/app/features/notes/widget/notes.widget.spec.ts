import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NotesWidget } from './notes.widget';

describe('NotesWidget', () => {
  let component: NotesWidget;
  let fixture: ComponentFixture<NotesWidget>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotesWidget]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NotesWidget);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
