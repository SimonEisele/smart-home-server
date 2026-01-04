import { Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoginPopover } from '../../popovers/login-popover/login-popover';
import { AuthService } from '../auth/service/auth.service';
import { Observable } from 'rxjs';
import { User } from '../auth/model/auth.model';
import { DashboardService } from '../../dashboard/service/dashboard.service';

declare const bootstrap: any;

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [ CommonModule, FormsModule, RouterLink, LoginPopover],
  templateUrl: './navbar.html',
  styleUrls: ['./navbar.css']
})
export class Navbar {
  @ViewChild('loginButton', { read: ElementRef }) loginBtn!: ElementRef;
  @ViewChild('userText', { read: ElementRef }) userText!: ElementRef;

  showLogin: boolean = false;
  loginPopoverTop = 0;
  loginPopoverLeft = 0;

  user$: Observable<User | null>;
  editMode$: Observable<boolean>;

  constructor(public dashboardService: DashboardService, public auth: AuthService) {
    this.user$ = this.auth.user$;
    this.editMode$ = this.dashboardService.editMode$;
  }

  // Login Popup
  toggleLogin() {
    this.showLogin = !this.showLogin;
    if (this.showLogin && this.loginBtn) {
    const rect = this.loginBtn.nativeElement.getBoundingClientRect();
      this.loginPopoverTop = rect.bottom + window.scrollY + 18;
      this.loginPopoverLeft = rect.left + window.scrollX + 106;
    }
  }

  onLoginSuccess() {
    this.showLogin = false;
  }

  // Fullscreen
  openFullscreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) elem.requestFullscreen();
    else if ((elem as any).webkitRequestFullscreen) (elem as any).webkitRequestFullscreen();
    else if ((elem as any).msRequestFullscreen) (elem as any).msRequestFullscreen();
  }

  // Key Listener
  @HostListener('document:keydown.escape')
  onEscape() {
    this.dashboardService.setEditMode(false);
    this.showLogin = false;
  }
}
