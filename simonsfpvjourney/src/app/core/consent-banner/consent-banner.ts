import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ConsentService } from '../../services/consent.service';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-consent-banner',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule],
  templateUrl: './consent-banner.html',
  styleUrl: './consent-banner.css',
})
export class ConsentBanner {
  readonly consentState$;
  currentLanguage = '';

  constructor(
    private consent: ConsentService,
    private languageService: LanguageService
  ) {
    this.consentState$ = this.consent.state$;
    this.currentLanguage = this.languageService.currentLanguage;
    this.languageService.language$.subscribe(lang => {
      this.currentLanguage = lang;
    });
  }

  acceptConsent(): void {
    this.consent.accept();
  }

  rejectConsent(): void {
    this.consent.reject();
  }
}
