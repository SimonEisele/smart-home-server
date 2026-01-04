import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Navbar } from './core/navbar/navbar';
import { AuthService } from './core/auth/service/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [Navbar, RouterOutlet ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('SmartHome Server');

  constructor(private auth: AuthService) {
  if (localStorage.getItem('access')) {
    this.auth.fetchUser().subscribe();
  }
}
}
