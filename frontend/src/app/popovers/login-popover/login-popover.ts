import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { AuthService } from '../../core/auth/service/auth.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; 
import { RouterLink } from '@angular/router';

@Component({
  selector: 'login-popover',
  standalone: true,
  imports: [ CommonModule, FormsModule, RouterLink ],
  templateUrl: './login-popover.html',
  styleUrl: './login-popover.css',
})
export class LoginPopover implements AfterViewInit {
  @ViewChild('emailInput') emailInput!: ElementRef<HTMLInputElement>;
  @ViewChild('passwordInput') passwordInput!: ElementRef<HTMLInputElement>;

  email = '';
  password = '';
  rememberMe = false;

  showPasswordForm = false;
  showPassword = false;

  emailError = false;
  passwordError = false;

  passwordToggleIcon = 'icons/visible.svg'

  @Input() arrowLeft = 0;

  @Output() loginSuccess = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  constructor(
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngAfterViewInit(): void {
    queueMicrotask(() => this.emailInput.nativeElement.focus())
  }

  checkEmail() {
    this.authService.checkEmail(this.email).subscribe({
      next: res => {
        if (!res.exists) {
          this.emailError = true;
          return;
        }
        this.emailError = false;
        this.showPasswordForm = true;
        this.emailInput.nativeElement.disabled = true;

        this.cdr.detectChanges();
        queueMicrotask(() => this.passwordInput.nativeElement.focus())
      },
      error: () => this.emailError = true
    });
  }

  checkPassword() {
    this.authService.login({
      email: this.email,
      password: this.password,
      rememberMe: this.rememberMe
    }).subscribe({
      next: () => this.loginSuccess.emit(),
      error: () => this.passwordError = true
    });
  }

  togglePassword() {
    this.showPassword = ! this.showPassword;
    this.passwordInput.nativeElement.type = this.showPassword ? 'text' : 'password';
    this.passwordToggleIcon = this.showPassword ? 'icons/not-visible.svg' : 'icons/visible.svg';
  }

  closePopover() {
    this.close.emit();
  }

  @HostListener('document:click', ['$event'])
  onOutsideClick(event: MouseEvent) {
    if (!(event.target as HTMLElement).closest('login-popover')) {
      this.closePopover();
    }
  }
}
