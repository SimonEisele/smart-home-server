import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import 'bootstrap/dist/js/bootstrap.esm.min.js';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import localeFr from '@angular/common/locales/fr';
import { LOCALE_ID } from '@angular/core';
import { LanguageService } from './app/services/language.service';

registerLocaleData(localeDe);
registerLocaleData(localeFr);

const resolveLocale = (language: string): string => {
  switch (language) {
    case 'de':
      return 'de-CH';
    case 'fr':
      return 'fr';
    default:
      return 'en';
  }
};

bootstrapApplication(App, {
  ...appConfig,
  providers: [
    ...(appConfig.providers || []),
    {
      provide: LOCALE_ID,
      deps: [LanguageService],
      useFactory: (languageService: LanguageService) => resolveLocale(languageService.currentLanguage),
    }
  ]
}).catch(err => console.error(err));
