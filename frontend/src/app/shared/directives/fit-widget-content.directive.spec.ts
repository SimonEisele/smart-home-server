import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { FitWidgetContentDirective } from './fit-widget-content.directive';

@Component({ standalone: true, imports: [FitWidgetContentDirective], template: '<div fitWidgetContent=".entry"><button class="entry">First</button><button class="entry">Second</button></div>' })
class Host {}

it('hides a partial row completely and restores it when more height is available', () => {
  const fixture = TestBed.createComponent(Host); fixture.detectChanges();
  const root: HTMLElement = fixture.nativeElement.firstElementChild;
  const entries = root.querySelectorAll<HTMLElement>('.entry');
  let height = 90;
  Object.defineProperty(root, 'clientHeight', { get: () => height });
  root.getBoundingClientRect = () => ({ top: 0, bottom: height } as DOMRect);
  entries[0].getBoundingClientRect = () => ({ top: 0, bottom: 50, height: 50 } as DOMRect);
  entries[1].getBoundingClientRect = () => ({ top: 58, bottom: 108, height: 50 } as DOMRect);
  const directive = fixture.debugElement.children[0].injector.get(FitWidgetContentDirective);
  directive.fit(); expect(entries[0].style.display).toBe(''); expect(entries[1].style.display).toBe('none');
  height = 120; directive.fit(); expect(entries[1].style.display).toBe('');
  fixture.destroy();
});
