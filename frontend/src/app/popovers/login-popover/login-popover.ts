import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Output, ViewChild } from '@angular/core';
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
  showPasswordForm = false;
  emailError = false;
  passwordError = false;
  showPassword = false;
  passwordToggleIcon = 'icons/visible.svg'

  @Output() loginSuccess = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  constructor(private authService: AuthService, private cdr: ChangeDetectorRef) {}

  checkEmail() {
    this.authService.checkEmail(this.email).subscribe({
      next: res => {
        if (res.exists) {
          this.emailError = false;
          this.showPasswordForm = true;
          this.emailInput.nativeElement.disabled = true;
          this.cdr.detectChanges();
          setTimeout(() => {
            this.passwordInput.nativeElement.focus();
          }, 10);
        } else {
          this.emailError = true;
          this.cdr.detectChanges();
        }
      },
      error: () => {
        this.emailError = true;
        this.cdr.detectChanges();
      }
    });
  }

  checkPassword() {
    this.authService.login(this.email, this.password).subscribe({
      next: () => this.loginSuccess.emit(),
      error: () => {
        this.passwordError = true;
        this.cdr.detectChanges();
      }
    });
    this.cdr.detectChanges();
  }

  togglePassword() {
    this.showPassword = ! this.showPassword;
    if(this.showPassword) {
      this.passwordInput.nativeElement.type = "text";
      this.passwordToggleIcon = 'icons/not-visible.svg'
    } else {
      this.passwordInput.nativeElement.type = "password";
      this.passwordToggleIcon = 'icons/visible.svg'
    }
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.emailInput.nativeElement.focus();
    }, 0);
  }

  @HostListener('document:click', ['$event'])
  onOutsideClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.login-popover')) {
      this.close.emit();
    }
  }
}
