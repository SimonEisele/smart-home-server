import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Navbar } from './core/navbar/navbar';
import { Footer } from './core/footer/footer';
import { ConsentBanner } from './core/consent-banner/consent-banner';
import { LanguageService } from './services/language.service';
import { AnalyticsService } from './services/analytics.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ CommonModule, RouterOutlet, Navbar, Footer, ConsentBanner ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('simonsfpvjourney');
  private readonly supportedLanguages = ['en', 'de', 'fr'];
  constructor(
    public router: Router,
    private languageService: LanguageService,
    private analytics: AnalyticsService,
  ) {
    // ensure AnalyticsService gets instantiated early so the cookieless session-duration
    // tracking is attached even if the user doesn't give analytics consent
    // (AnalyticsService initializes on construction)
    void this.analytics;
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.syncLanguageFromUrl();
      }
    });
  }

  isMapPage(): boolean {
    const path = this.router.url.split('?')[0];
    const segments = path.split('/').filter(Boolean);
    return segments.length === 1 && this.supportedLanguages.includes(segments[0]);
  }

  private syncLanguageFromUrl(): void {
    const urlTree = this.router.parseUrl(this.router.url);
    const url = urlTree.root.children['primary']?.segments.map(seg => seg.path).join('/') ?? '';
    const segments = url.split('/').filter(Boolean);
    const lang = segments[0];
    if (lang && this.supportedLanguages.includes(lang)) {
      this.languageService.setLanguage(lang, true);
      return;
    }
    const next = this.languageService.currentLanguage || 'en';
    const rest = segments.length ? segments : [];
    const newSegments = [next, ...rest];
    this.router.navigate(['/', ...newSegments], {
      queryParams: urlTree.queryParams,
      fragment: urlTree.fragment ?? undefined,
    });
  }
}
