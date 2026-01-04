import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth/service/auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ CommonModule, FormsModule ],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  username = '';
  password = '';
  newUser: any = {
    username: '',
    password: '',
    firstname: '',
    lastname: '',
    email: '',
    phone_number: '',
    is_guest: false
  };
  isRegister = false;

  constructor(public authService: AuthService) {}

  login() {
    this.authService.login(this.username, this.password).subscribe({
      next: () => console.log('Login erfolgreich'),
      error: err => console.error(err)
    });
  }

  register() {
    this.authService.register(this.newUser).subscribe({
      next: user => {
        console.log('User erstellt', user);
        this.isRegister = false; // Nach Registrierung zurück zu Login
      },
      error: err => console.error(err)
    });
  }

  logout() {
    this.authService.logout();
  }
}
