import { Component, ChangeDetectorRef, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth/service/auth.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class LandingPage implements AfterViewInit {
  @ViewChild('emailInput') emailInput!: ElementRef<HTMLInputElement>;
  @ViewChild('passwordInput') passwordInput!: ElementRef<HTMLInputElement>;

  step: 'email' | 'password' = 'email';
  email = '';
  password = '';
  rememberMe = false;
  showPassword = false;
  emailError = false;
  passwordError = false;
  loading = false;

  constructor(private auth: AuthService, private router: Router, private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    queueMicrotask(() => this.emailInput?.nativeElement?.focus());
  }

  checkEmail(): void {
    if (!this.email.trim() || this.loading) return;
    this.loading = true;
    this.emailError = false;
    this.auth.checkEmail(this.email.trim()).subscribe({
      next: res => {
        this.loading = false;
        if (!res.exists) { this.emailError = true; this.cdr.detectChanges(); return; }
        this.step = 'password';
        this.cdr.detectChanges();
        queueMicrotask(() => this.passwordInput?.nativeElement?.focus());
      },
      error: () => { this.emailError = true; this.loading = false; this.cdr.detectChanges(); }
    });
  }

  login(): void {
    if (!this.password.trim() || this.loading) return;
    this.loading = true;
    this.passwordError = false;
    this.auth.login({ email: this.email, password: this.password, rememberMe: this.rememberMe }).subscribe({
      next: () => this.router.navigate(['/home']),
      error: () => { this.passwordError = true; this.loading = false; this.cdr.detectChanges(); }
    });
  }

  backToEmail(): void {
    this.step = 'email';
    this.password = '';
    this.passwordError = false;
    queueMicrotask(() => this.emailInput?.nativeElement?.focus());
  }
}
