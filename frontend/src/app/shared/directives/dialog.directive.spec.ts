import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { DialogDirective } from './dialog.directive';

@Component({ standalone:true, imports:[CommonModule, DialogDirective], template:`<button (click)="open = true">Öffnen</button><div *ngIf="open" appDialog [dialogFocusInput]="focusInput" (dialogDismiss)="open = false" aria-label="Testdialog"><label>Name</label><input/><button>Speichern</button></div>` })
class Host { open = false; focusInput = true; }

describe('Shared dialog keyboard behavior', () => {
  it('can focus the dialog without activating its input keyboard', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.focusInput = false;
    await fixture.whenStable();
    document.body.appendChild(fixture.nativeElement);
    fixture.nativeElement.querySelector('button').click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('[role=dialog]'));
    expect(document.activeElement).not.toBe(fixture.nativeElement.querySelector('input'));
    fixture.destroy();
  });
  it('focuses the field, labels it, and restores the opener after Escape', async () => {
    const fixture = TestBed.createComponent(Host); await fixture.whenStable();
    const opener = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    document.body.appendChild(fixture.nativeElement); opener.focus(); opener.click(); await fixture.whenStable();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(fixture.nativeElement.querySelector('label').htmlFor).toBe(input.id);
    expect(document.body.style.overflow).toBe('hidden');
    input.dispatchEvent(new KeyboardEvent('keydown',{ key:'Escape', bubbles:true })); await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role=dialog]')).toBeNull();
    expect(document.activeElement).toBe(opener); expect(document.body.style.overflow).not.toBe('hidden');
    fixture.destroy();
  });
});
