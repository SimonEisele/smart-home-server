import { ApplicationConfig, provideBrowserGlobalErrorListeners, APP_INITIALIZER } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { HttpClient, provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { TranslateLoader, provideTranslateService } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { firstValueFrom, timeout } from 'rxjs';
import { languageInterceptor } from './interceptors/language.interceptor';
import { apiBaseUrlInterceptor } from './interceptors/api-base-url.interceptor';

export function translateLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http, '/assets/i18n/', '.json');
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withHashLocation()), provideClientHydration(withEventReplay()),
    provideHttpClient(
      withFetch(),
      withInterceptors([apiBaseUrlInterceptor, languageInterceptor])
    ),
    provideTranslateService({
      defaultLanguage: 'en',
      useDefaultLang: true,
      loader: {
        provide: TranslateLoader,
        useFactory: translateLoaderFactory,
        deps: [HttpClient],
      },
    })
    ,{
      provide: APP_INITIALIZER,
      useFactory: (http: HttpClient) => {
        return () => {
          // Preload the English translations file to avoid initial key flash.
          return firstValueFrom(http.get('/assets/i18n/en.json').pipe(timeout(3000)))
            .then(() => { console.debug('[i18n] en.json preloaded'); })
            .catch((err) => { console.warn('[i18n] en.json preload failed or timed out', err); });
        };
      },
      deps: [HttpClient],
      multi: true,
    }
  ]
};
