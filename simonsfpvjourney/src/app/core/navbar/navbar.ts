import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ChangeDetectorRef } from '@angular/core';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [ CommonModule, RouterLink, RouterLinkActive, TranslateModule ],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar {
  readonly languages = [
    { code: 'de', label: 'DE' },
    { code: 'en', label: 'EN' },
    { code: 'fr', label: 'FR' },
  ];

  currentLanguage = '';

  constructor(
    public router: Router,
    private languageService: LanguageService,
    private translate: TranslateService
    ,
    private cdr: ChangeDetectorRef
  ) {
    this.currentLanguage = this.languageService.currentLanguage;
    this.languageService.language$.subscribe(lang => {
      this.currentLanguage = lang;
      try { this.translate.use(lang); } catch {}
      // Schedule change detection async to avoid running CD during component
      // construction/update mode which triggers assertions.
      Promise.resolve().then(() => this.cdr.detectChanges());
    });
    // Ensure TranslateService is using the current language so pipes update.
    try { this.translate.use(this.currentLanguage); } catch {}

    // When translations or language change, trigger CD so the pipe refreshes immediately
    this.translate.onLangChange.subscribe(() => Promise.resolve().then(() => this.cdr.detectChanges()));
    this.translate.onTranslationChange.subscribe(() => Promise.resolve().then(() => this.cdr.detectChanges()));
  }

  // Mobile menu state
  isMenuOpen = false;

  toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
  }

  closeMenu(): void {
    this.isMenuOpen = false;
  }

  // Active matcher that ignores query/fragment/matrix params
  isMapActive(): boolean {
    const tree = this.router.createUrlTree(['/', this.currentLanguage]);
    return this.router.isActive(tree, {
      paths: 'exact',
      queryParams: 'ignored',
      fragment: 'ignored',
      matrixParams: 'ignored',
    });
  }

  onLanguageChange(lang: string): void {
    const normalized = lang.toLowerCase();
    if (!normalized) return;
    const urlTree = this.router.parseUrl(this.router.url);
    const segments = urlTree.root.children['primary']?.segments.map(seg => seg.path) ?? [];
    if (segments.length === 0) {
      this.languageService.setLanguage(normalized, true);
      this.router.navigate(['/', normalized]);
      return;
    }
    if (segments[0] && this.languages.some(l => l.code === segments[0])) {
      segments[0] = normalized;
    } else {
      segments.unshift(normalized);
    }
    this.languageService.setLanguage(normalized, true);
    this.router.navigate(['/', ...segments], {
      queryParams: urlTree.queryParams,
      fragment: urlTree.fragment ?? undefined,
    });
  }
}
