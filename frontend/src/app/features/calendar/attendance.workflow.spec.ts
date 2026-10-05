import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { Calendar } from './calendar';
import { CalendarService } from './service/calendar.service';
import { TodosService } from '../todos/service/todos.service';
import { AuthService } from '../../core/auth/service/auth.service';
import { UserMealAttendance, ExternalMealGuest } from './model/calendar.model';

describe('Meal attendance workflows', () => {
  const service = {setMealAttendance:vi.fn(),addExternalGuest:vi.fn(),removeExternalGuest:vi.fn(),getMealAttendance:vi.fn(),getExternalGuests:vi.fn()};
  let page: Calendar;
  const date = '2026-10-05';
  const record: UserMealAttendance = { id:'a',userId:'me',userFirstName:'Simon',userLastName:'Eisele',date,breakfastPresent:false,lunchPresent:false,dinnerPresent:true };
  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({imports:[Calendar],providers:[{provide:CalendarService,useValue:service},{provide:TodosService,useValue:{}},{provide:AuthService,useValue:{}}]});
    page=TestBed.createComponent(Calendar).componentInstance;
    page.currentUserId='me';page.attendanceReady=true;
    page.weekDays=Array.from({length:7},(_,i)=>({date:new Date(date),dateStr:i===0?date:'2026-10-'+(6+i),isToday:i===0,dayName:'Mo',dayNum:5+i,month:10}));page.mealAttendances=[{...record}];
  });
  it('preserves other meals and prevents overlapping updates for the same day',()=>{
    const pending=new Subject<UserMealAttendance>();service.setMealAttendance.mockReturnValue(pending);
    page.toggleMealAttendance(date,'lunch');page.toggleMealAttendance(date,'breakfast');
    expect(service.setMealAttendance).toHaveBeenCalledExactlyOnceWith(date,false,true,true);
    expect(page.mealIsActive(date,'lunch')).toBe(false);
    pending.next({...record,lunchPresent:true});pending.complete();expect(page.mealIsActive(date,'lunch')).toBe(true);expect(page.attendancePending.size).toBe(0);
  });
  it('keeps the existing attendance on failure and permits retry',()=>{
    service.setMealAttendance.mockReturnValue(throwError(()=>new Error('offline')));page.toggleMealAttendance(date,'dinner');
    expect(page.mealIsActive(date,'dinner')).toBe(true);expect(page.attendanceError).toContain('nicht gespeichert');expect(page.attendancePending.size).toBe(0);
  });
  it('sets or clears the whole day in a single request',()=>{
    service.setMealAttendance.mockReturnValue(of({...record,breakfastPresent:true,lunchPresent:true}));page.toggleWholeDay(date);
    expect(service.setMealAttendance).toHaveBeenLastCalledWith(date,true,true,true);
    service.setMealAttendance.mockReturnValue(of({...record,dinnerPresent:false}));page.toggleWholeDay(date);expect(service.setMealAttendance).toHaveBeenLastCalledWith(date,false,false,false);
  });
  it('does not edit on behalf of the shared account or before data has loaded',()=>{
    page.isHouseholdAccount=true;page.toggleWholeDay(date);page.isHouseholdAccount=false;page.attendanceReady=false;page.toggleWholeDay(date);expect(service.setMealAttendance).not.toHaveBeenCalled();
  });
  it('retains a guest name on failure, blocks duplicate saves and adds after success',()=>{
    page.openAddGuest(date,'dinner',new Event('click'));page.newGuestName=' Alex ';
    service.addExternalGuest.mockReturnValue(throwError(()=>new Error('offline')));page.submitAddGuest();expect(page.newGuestName).toBe(' Alex ');expect(page.addingGuestFor).not.toBeNull();
    const pending=new Subject<ExternalMealGuest>();service.addExternalGuest.mockReturnValue(pending);page.submitAddGuest();page.submitAddGuest();expect(service.addExternalGuest).toHaveBeenCalledTimes(2);
    pending.next({id:'guest',name:'Alex',date,meal:'dinner',created_at:date});pending.complete();expect(page.externalGuests[0].name).toBe('Alex');expect(page.addingGuestFor).toBeNull();
  });
  it('keeps guests after failed deletion',()=>{
    page.externalGuests=[{id:'g',name:'Alex',date,meal:'dinner',created_at:date}];service.removeExternalGuest.mockReturnValue(throwError(()=>new Error('offline')));page.removeExternalGuest('g',new Event('click'));expect(page.externalGuests).toHaveLength(1);
  });
  it('does not confuse one person across several days with people having the same first name',()=>{
    page.mealAttendances=[record,{...record,id:'b',date:'2026-10-06'}];expect(page.attendanceDisplayName(record)).toBe('Simon');
    page.mealAttendances.push({...record,id:'c',userId:'other',userLastName:'Müller'});expect(page.attendanceDisplayName(record)).toBe('Simon Eisele');
  });
  it('discards a previous week response after navigating',()=>{
    const pending=new Subject<UserMealAttendance[]>();service.getMealAttendance.mockReturnValue(pending);service.getExternalGuests.mockReturnValue(of([]));page.loadAttendance();page.weekDays=[{...page.weekDays[0],dateStr:'2026-10-12'}];pending.next([record]);pending.complete();expect(page.attendanceReady).toBe(false);
  });
});
