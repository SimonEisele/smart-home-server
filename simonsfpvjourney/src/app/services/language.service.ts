import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly storageKey = 'simonsfpvjourney.language';
  readonly supportedLanguages = ['en', 'de', 'fr'] as const;
  private languageSubject = new BehaviorSubject<string>('en');
  language$ = this.languageSubject.asObservable();

  constructor() {
    const initial = this.readStoredLanguage() ?? 'en';
    // Initialize subject but avoid calling TranslateService here to prevent
    // circular DI (TranslateService -> HttpClient -> interceptors -> LanguageService).
    this.languageSubject.next(initial);
  }

  get currentLanguage(): string {
    return this.languageSubject.value;
  }

  setLanguage(lang: string, persist = true) {
    const normalized = this.normalizeLanguage(lang);
    if (this.languageSubject.value !== normalized) {
      this.languageSubject.next(normalized);
    }
    // Use inject() here to lazily obtain TranslateService and avoid a circular
    // dependency during the initial provider setup.
    try {
      const translate = inject(TranslateService);
      translate.use(normalized);
      // Force-load the translation file.
      translate.getTranslation(normalized).subscribe({ next: () => {}, error: () => {} });
    } catch {
      // If injection fails (e.g. during certain bootstrap phases), skip.
    }
    if (typeof window !== 'undefined') {
      if (persist) {
        window.localStorage.setItem(this.storageKey, normalized);
      }
      document.documentElement.lang = normalized;
    }
  }

  private normalizeLanguage(lang: string): string {
    const clean = (lang || '').toLowerCase().split('-')[0];
    return this.supportedLanguages.includes(clean as any) ? clean : 'en';
  }

  private readStoredLanguage(): string | null {
    if (typeof window === 'undefined') return null;
    const stored = window.localStorage.getItem(this.storageKey);
    return stored ? this.normalizeLanguage(stored) : null;
  }
}
