import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { Calendar } from './calendar';
import { CalendarService } from './service/calendar.service';
import { TodosService } from '../todos/service/todos.service';
import { AuthService } from '../../core/auth/service/auth.service';
import { CalendarEvent } from './model/calendar.model';

describe('Linked task planning',()=>{
  const service={deleteEvent:vi.fn(),updateEvent:vi.fn(),createEvent:vi.fn()};
  const tasks={updateTodo:vi.fn()};let page:Calendar;
  const ev:CalendarEvent={id:'block',title:'Task',todoRefId:'task',start:'2026-10-05T08:00:00Z',end:'2026-10-05T09:00:00Z'};
  beforeEach(()=>{
    vi.resetAllMocks();TestBed.configureTestingModule({imports:[Calendar],providers:[{provide:CalendarService,useValue:service},{provide:TodosService,useValue:tasks},{provide:AuthService,useValue:{}}]});
    page=TestBed.createComponent(Calendar).componentInstance;
    page.weekDays=Array.from({length:7},(_,i)=>({date:new Date('2026-10-05'),dateStr:'2026-10-'+(5+i),isToday:false,dayName:'Mo',dayNum:5+i,month:10}));
    page.todos=[{id:'task',title:'Task',done:false,durationMinutes:180}];page.events=[{...ev}];
  });
  it('drops a linked block into the sidebar and keeps the original task',()=>{
    service.deleteEvent.mockReturnValue(of(undefined));page.dragEvent=ev;page.onSidebarDrop(new Event('drop') as DragEvent);
    expect(service.deleteEvent).toHaveBeenCalledExactlyOnceWith('block');expect(page.events).toHaveLength(0);expect(page.openTodos).toHaveLength(1);expect(page.todos[0].durationMinutes).toBe(180);expect(tasks.updateTodo).not.toHaveBeenCalled();
  });
  it('keeps other split blocks and only returns the task after the final block is removed',()=>{
    service.deleteEvent.mockReturnValue(of(undefined));page.events.push({...ev,id:'part2'});page.unscheduleEvent(ev);expect(page.events[0].id).toBe('part2');expect(page.openTodos).toHaveLength(0);
    page.unscheduleEvent(page.events[0]);expect(page.openTodos).toHaveLength(1);
  });
  it('ignores ordinary appointments dropped into the task sidebar',()=>{
    page.dragEvent={...ev,todoRefId:null};page.onSidebarDrop(new Event('drop') as DragEvent);expect(service.deleteEvent).not.toHaveBeenCalled();
  });
  it('retains the event on failure and allows retry',()=>{
    service.deleteEvent.mockReturnValue(throwError(()=>new Error('offline')));page.unscheduleEvent(ev);expect(page.events).toHaveLength(1);expect(page.planningError).toContain('bleiben erhalten');expect(page.planningPending.size).toBe(0);
  });
  it('prevents duplicate removals while awaiting the server',()=>{
    const pending=new Subject<void>();service.deleteEvent.mockReturnValue(pending);page.unscheduleEvent(ev);page.unscheduleEvent(ev);expect(service.deleteEvent).toHaveBeenCalledTimes(1);pending.next();pending.complete();expect(page.events).toHaveLength(0);
  });
  it('resizing a split block does not change the total task duration',()=>{
    service.updateEvent.mockReturnValue(of({...ev,end:'2026-10-05T08:30:00Z'}));page.resizingEvent=ev;page.resizePreview={evId:ev.id,newH:32,newEnd:'2026-10-05T08:30:00Z'};
    page.onColDrop(new Event('drop') as DragEvent,page.weekDays[0]);expect(tasks.updateTodo).not.toHaveBeenCalled();expect(page.todos[0].durationMinutes).toBe(180);
  });
});
