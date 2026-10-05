import { Component, signal, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { Navbar } from './core/navbar/navbar';
import { AuthService } from './core/auth/service/auth.service';
import { ErrorNoticeService } from './shared/services/error-notice.service';
import { RecipeCookOverlay } from './shared/recipe-cook-overlay/recipe-cook-overlay';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AsyncPipe, Navbar, RouterOutlet, RecipeCookOverlay],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  readonly errorNotice = inject(ErrorNoticeService);
  protected readonly title = signal('SmartHome Server');

  constructor(public auth: AuthService) {
  if (localStorage.getItem('access') || sessionStorage.getItem('access') ||
      localStorage.getItem('refresh') || sessionStorage.getItem('refresh')) {
    this.auth.ensureAccessToken().subscribe(token => {
      if (token) this.auth.fetchUser().subscribe({
        error: error => { if (error.status === 401 || error.status === 403) this.auth.logout(); }
      });
    }, () => { /* Keep stored credentials during a temporary connection failure. */ });
  }
}
}
