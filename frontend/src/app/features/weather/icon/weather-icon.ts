import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { wmoLabel } from '../pipes/weather.pipe';

@Component({
  selector: 'weather-symbol',
  standalone: true,
  imports: [CommonModule],
  template: `
    <svg viewBox="0 0 48 48" role="img" [attr.aria-label]="label" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <g *ngIf="code < 3" class="sun">
        <ng-container *ngIf="isDay; else moon">
          <circle cx="19" cy="18" r="8"/><path d="M19 3v3m0 24v3M4 18h3m24 0h3M8 7l3 3m16 16 3 3M8 29l3-3M27 10l3-3"/>
        </ng-container>
        <ng-template #moon><path d="M26 7a12 12 0 1 0 7 19A12 12 0 0 1 26 7z"/></ng-template>
      </g>
      <path *ngIf="code > 0" d="M13 33a7 7 0 0 1-1-14 10 10 0 0 1 19-1 8 8 0 1 1 4 15z" class="cloud"/>
      <path *ngIf="code >= 45 && code <= 48" d="M10 39h28M16 44h18"/>
      <path *ngIf="code >= 51 && code <= 67 || code >= 80 && code <= 82" d="M16 38l-2 5m11-5-2 5m11-5-2 5" class="rain"/>
      <path *ngIf="code >= 71 && code <= 77 || code >= 85 && code <= 86" d="M16 38v6m-3-3h6m12-3v6m-3-3h6"/>
      <path *ngIf="code >= 95" d="M26 34l-5 7h6l-4 6" class="sun"/>
    </svg>`,
  styles: [`:host { display:inline-flex; width:1em; height:1em; vertical-align:middle; } svg { width:100%; height:100%; } .sun { color:#d8a438; } .cloud { fill:var(--color-surface-soft); color:#667970; } .rain { color:#467fab; }`],
})
export class WeatherSymbol {
  @Input() code = 0;
  @Input() isDay = true;
  get label(): string { return wmoLabel(this.code); }
}
