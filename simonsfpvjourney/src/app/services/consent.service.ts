import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ConsentState = 'granted' | 'denied' | null;

@Injectable({ providedIn: 'root' })
export class ConsentService {
  private readonly key = 'simonsfpvjourney.consent.analytics';
  private readonly isBrowser: boolean;
  private readonly stateSubject = new BehaviorSubject<ConsentState>(null);

  readonly state$ = this.stateSubject.asObservable();

  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    this.isBrowser = isPlatformBrowser(platformId);
    this.stateSubject.next(this.readStored());
  }

  hasConsent(): boolean {
    return this.stateSubject.value === 'granted';
  }

  accept(): void {
    this.setState('granted');
  }

  reject(): void {
    this.setState('denied');
  }

  private setState(next: ConsentState): void {
    this.stateSubject.next(next);
    if (!this.isBrowser) return;
    try {
      if (next == null) {
        localStorage.removeItem(this.key);
      } else {
        localStorage.setItem(this.key, next);
      }
    } catch {}
  }

  private readStored(): ConsentState {
    if (!this.isBrowser) return null;
    try {
      const value = localStorage.getItem(this.key);
      if (value === 'granted' || value === 'denied') return value;
    } catch {}
    return null;
  }
}
