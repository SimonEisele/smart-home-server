import { AfterViewInit, Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoginPopover } from '../../popovers/login-popover/login-popover';
import { AuthService } from '../auth/service/auth.service';
import { Observable } from 'rxjs';
import { User } from '../auth/model/auth.model';
import { DashboardService } from '../../dashboard/service/dashboard.service';
import { AccountPopover } from '../../popovers/account-popover/account-popover';

declare const bootstrap: any;
const LOGIN_POPOVER_WIDTH = 400;
const ACCOUNT_POPOVER_WIDTH = 400;
const VIEWPORT_PADDING = 8;
const ARROW_WIDTH = 20;

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [ CommonModule, FormsModule, RouterLink, LoginPopover, AccountPopover ],
  templateUrl: './navbar.html',
  styleUrls: ['./navbar.css']
})
export class Navbar implements AfterViewInit {
  @ViewChild('loginButton', { read: ElementRef }) loginBtn!: ElementRef;
  @ViewChild('accountButton', { read: ElementRef }) accountBtn!: ElementRef;
  @ViewChild('userText', { read: ElementRef }) userText!: ElementRef;
  @ViewChild('navbarCollapse', { read: ElementRef }) navbarCollapse!: ElementRef;

  showLogin: boolean = false;
  loginPopoverTop = 0;
  loginPopoverLeft = 0;
  loginPopoverArrowLeft = 0;

  showAccount: boolean = false;
  accountPopoverTop = 0;
  accountPopoverLeft = 0;
  accountPopoverArrowLeft = 0;

  user$: Observable<User | null>;
  editMode$: Observable<boolean>;

  constructor(public dashboardService: DashboardService, public auth: AuthService, private router: Router) {
    this.user$ = this.auth.user$;
    this.editMode$ = this.dashboardService.editMode$;

    // Close menu on route changes (robust on mobile)
    this.router.events.pipe(filter(evt => evt instanceof NavigationEnd)).subscribe(() => {
      this.closeMenu();
    });
  }

  private collapseInstance: any;

  ngAfterViewInit(): void {
    if (this.navbarCollapse?.nativeElement && typeof bootstrap !== 'undefined') {
      this.collapseInstance = new bootstrap.Collapse(this.navbarCollapse.nativeElement, { toggle: false });
    }
  }

  // Login Popup
  toggleLogin() {
    this.showLogin = !this.showLogin;

    if (this.showLogin) {
      queueMicrotask(() => {
        const rect = this.loginBtn.nativeElement.getBoundingClientRect();

        this.loginPopoverTop = rect.bottom + 24;

        let left = rect.left + rect.width / 2 - LOGIN_POPOVER_WIDTH / 2;
        const minLeft = VIEWPORT_PADDING;
        const maxLeft = window.innerWidth - LOGIN_POPOVER_WIDTH - VIEWPORT_PADDING;
        this.loginPopoverLeft = Math.round(Math.max(minLeft, Math.min(left, maxLeft)));

        this.loginPopoverArrowLeft = Math.round(rect.left + rect.width / 2 - this.loginPopoverLeft - ARROW_WIDTH / 2);
      });
    }
  }

  // Account Popup
  toggleAccount() {
    this.showAccount = !this.showAccount;

    if (this.showAccount) {
      queueMicrotask(() => {
        const rect = this.accountBtn.nativeElement.getBoundingClientRect();

        this.accountPopoverTop = rect.bottom + 24;

        let left = rect.left + rect.width / 2 - ACCOUNT_POPOVER_WIDTH / 2;
        const minLeft = VIEWPORT_PADDING;
        const maxLeft = window.innerWidth - ACCOUNT_POPOVER_WIDTH - VIEWPORT_PADDING;
        this.accountPopoverLeft = Math.round(Math.max(minLeft, Math.min(left, maxLeft)));

        this.accountPopoverArrowLeft = Math.round(rect.left + rect.width / 2 - this.accountPopoverLeft - ARROW_WIDTH / 2);
      });
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

  // Close mobile menu when an item is clicked
  closeMenu() {
    if (this.isMobile() && this.collapseInstance) {
      this.collapseInstance.hide();
    }
  }

  // Explicit toggle via hamburger button
  toggleMenu() {
    if (this.collapseInstance) {
      this.collapseInstance.toggle();
    }
  }

  private isMobile(): boolean {
    return window.innerWidth < 992; // Bootstrap lg breakpoint
  }
}
