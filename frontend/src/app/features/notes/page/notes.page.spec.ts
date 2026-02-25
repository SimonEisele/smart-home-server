import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NotesPage } from './notes.page';

describe('NotesPage', () => {
  let component: NotesPage;
  let fixture: ComponentFixture<NotesPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotesPage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NotesPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
