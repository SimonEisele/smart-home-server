import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { CleaningEditor } from './cleaning-editor';
import { CleaningService } from '../service/cleaning.service';
import { CleaningTask } from '../model/cleaning.model';

describe('Cleaning editor', () => {
  const service = { createTask: vi.fn(), updateTask: vi.fn(), deleteTask: vi.fn(), undo: vi.fn() };

  function create(task: CleaningTask | null = null) {
    TestBed.configureTestingModule({ imports: [CleaningEditor], providers: [{ provide: CleaningService, useValue: service }] });
    const editor = TestBed.createComponent(CleaningEditor).componentInstance;
    editor.task = task;
    editor.people = [{ id: 's', name: 'Simon', isMe: true }, { id: 'l', name: 'Lisa', isMe: false },
                     { id: 't', name: 'Tom', isMe: false }];
    editor.ngOnInit();
    return editor;
  }

  beforeEach(() => vi.clearAllMocks());

  it('creates a job with room, interval, rotation, steps and duration', () => {
    const editor = create();
    const saved = vi.fn();
    editor.saved.subscribe(saved);
    editor.form.name = '  Bad putzen ';
    editor.form.category = 'bathroom';
    editor.setInterval(14);
    editor.setMode('rotation');
    expect(editor.form.rotation).toEqual(['s', 'l', 't']); // everyone takes part by default
    editor.toggleRotation('t');
    editor.moveRotation(1, -1);
    editor.newStep = 'Lavabo'; editor.addStep();
    editor.newStep = 'Boden';
    editor.setDuration(30);
    service.createTask.mockReturnValue(of({ id: 'x', name: 'Bad putzen', category: 'bathroom', intervalDays: 14 }));
    editor.save();
    expect(service.createTask.mock.calls[0][0]).toMatchObject({
      name: 'Bad putzen', category: 'bathroom', intervalDays: 14, rotation: ['l', 's'], assignedTo: 's',
      checklist: ['Lavabo', 'Boden'], durationMinutes: 30, isActive: true,
    });
    expect(saved).toHaveBeenCalled();
  });

  it('checks the name, interval and people before saving', () => {
    const editor = create();
    editor.customInterval = true;
    editor.form.intervalDays = 0;
    editor.setMode('fixed');
    editor.save();
    expect(editor.errors).toMatchObject({ name: expect.any(String), interval: expect.any(String), rotation: expect.any(String) });
    editor.form.name = 'Küche';
    editor.form.intervalDays = 5;
    editor.setMode('rotation');
    editor.form.rotation = ['s'];
    editor.save();
    expect(editor.errors.rotation).toContain('zwei');
    expect(service.createTask).not.toHaveBeenCalled();
  });

  it('opens an existing job, keeps it on error and removes history entries after confirming', () => {
    const task: CleaningTask = { id: 'b', name: 'Bad', category: 'bathroom', intervalDays: 10, assignedTo: 'l',
      rotation: [], logs: [{ id: 'log', task: 'b', doneAt: '2026-11-10', doneBy: 'l', doneByName: 'Lisa' }] };
    const editor = create(task);
    expect([editor.form.mode, editor.customInterval]).toEqual(['fixed', true]);
    service.updateTask.mockReturnValue(throwError(() => new Error('x')));
    editor.form.isActive = false;
    editor.save();
    expect(service.updateTask.mock.calls[0][1]).toMatchObject({ assignedTo: 'l', rotation: [], isActive: false });
    expect(editor.formError).toContain('Speichern');
    const changed = vi.fn();
    editor.changed.subscribe(changed);
    service.undo.mockReturnValue(of({ ...task, logs: [] }));
    editor.removeLog(task.logs![0]);
    expect(service.undo).not.toHaveBeenCalled();
    editor.removeLog(task.logs![0]);
    expect(service.undo).toHaveBeenCalledWith('log');
    expect(changed).toHaveBeenCalled();
    expect(editor.task?.logs).toEqual([]);
  });
});
