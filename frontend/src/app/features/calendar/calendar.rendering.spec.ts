import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Calendar } from './calendar';
import { CalendarService } from './service/calendar.service';
import { TodosService } from '../todos/service/todos.service';
import { AuthService } from '../../core/auth/service/auth.service';

it('renders only the matching calendar layout and keeps ordinary taps out of drag cleanup', async () => {
  TestBed.configureTestingModule({
    imports: [Calendar],
    providers: [
      { provide: AuthService, useValue: { user$: of(null) } },
      { provide: TodosService, useValue: { getUserTodos: () => of([]) } },
      { provide: CalendarService, useValue: {
        getEvents: () => of([]), getMembers: () => of([]), getCleaningTasks: () => of([]),
        getAvailabilities: () => of([]), getMealAttendance: () => of([]), getExternalGuests: () => of([]),
      } },
    ],
  });
  const fixture = TestBed.createComponent(Calendar);
  fixture.componentInstance.isMobile = true;
  await fixture.whenStable();
  expect(fixture.nativeElement.querySelector('.agenda-view')).not.toBeNull();
  expect(fixture.nativeElement.querySelector('.cal-main')).toBeNull();
  document.body.style.overflow = 'hidden';
  fixture.componentInstance.onDocTouchEnd({} as TouchEvent);
  expect(document.body.style.overflow).toBe('hidden');
  document.body.style.overflow = '';
  fixture.componentInstance.isMobile = false;
  fixture.changeDetectorRef.markForCheck();
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('.agenda-view')).toBeNull();
  expect(fixture.nativeElement.querySelector('.cal-main')).not.toBeNull();
  fixture.destroy();
});
