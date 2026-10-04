import { Component, ElementRef, HostListener, ViewChild, DestroyRef, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoginPopover } from '../../popovers/login-popover/login-popover';
import { AuthService } from '../auth/service/auth.service';
import { Observable } from 'rxjs';
import { User, Household } from '../auth/model/auth.model';
import { DashboardService } from '../../dashboard/service/dashboard.service';
import { AccountPopover } from '../../popovers/account-popover/account-popover';
import { HouseholdService } from '../../shared/services/household.service';

const LOGIN_POPOVER_WIDTH = 400;
const ACCOUNT_POPOVER_WIDTH = 400;
const VIEWPORT_PADDING = 8;
const ARROW_WIDTH = 20;

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [ CommonModule, FormsModule, RouterLink, RouterLinkActive, LoginPopover, AccountPopover ],
  templateUrl: './navbar.html',
  styleUrls: ['./navbar.css']
})
export class Navbar {
  private readonly destroyRef = inject(DestroyRef);
  menuOpen = false;
  readonly navItems = [
    { path: "/home", label: "Übersicht", icon: "datetime.svg" },
    { path: "/calendar", label: "Kalender", icon: "calendar.svg" },
    { path: "/menuplan", label: "Menüplan", icon: "menuplan.svg" },
    { path: "/shoppinglist", label: "Einkauf", icon: "todo.svg" },
    { path: "/todos", label: "Aufgaben", icon: "todo.svg" },
    { path: "/cleaning", label: "Reinigung", icon: "todo.svg" },
    { path: "/recipes", label: "Rezepte", icon: "menuplan.svg" },
    { path: "/ingredients", label: "Zutaten", icon: "menuplan.svg" },
    { path: "/weather", label: "Wetter", icon: "weather.svg" },
  ];
  get isDashboard(): boolean { return this.router.url.split("?")[0] === "/home"; }
  @ViewChild('loginButton', { read: ElementRef }) loginBtn!: ElementRef;
  @ViewChild('accountButton', { read: ElementRef }) accountBtn!: ElementRef;
  @ViewChild('userText', { read: ElementRef }) userText!: ElementRef;
  @ViewChild('navbarCollapse', { read: ElementRef }) navbarCollapse!: ElementRef;

  showLogin: boolean = false;
  showWgDropdown = false;
  loginPopoverTop = 0;
  loginPopoverLeft = 0;
  loginPopoverArrowLeft = 0;

  showAccount: boolean = false;
  accountPopoverTop = 0;
  accountPopoverLeft = 0;
  accountPopoverArrowLeft = 0;

  user$: Observable<User | null>;
  editMode$: Observable<boolean>;
  households$: Observable<Household[]>;
  activeHousehold$: Observable<Household | null>;

  constructor(public dashboardService: DashboardService, public auth: AuthService, private router: Router, public householdService: HouseholdService) {
    this.user$ = this.auth.user$;
    this.editMode$ = this.dashboardService.editMode$;
    this.households$ = this.householdService.households$;
    this.activeHousehold$ = this.householdService.activeHousehold$;

    // Close menu on route changes (robust on mobile)
    this.router.events.pipe(filter(evt => evt instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.closeMenu();
    });
  }

  // Login Popup
  toggleLogin() {
    this.showLogin = !this.showLogin;
    this.showAccount = false;

    if (this.showLogin) {
      queueMicrotask(() => {
        const rect = this.loginBtn.nativeElement.getBoundingClientRect();

        this.loginPopoverTop = rect.bottom + 24;

        let left = rect.left + rect.width / 2 - Math.min(LOGIN_POPOVER_WIDTH, window.innerWidth - 16) / 2;
        const minLeft = VIEWPORT_PADDING;
        const maxLeft = window.innerWidth - Math.min(LOGIN_POPOVER_WIDTH, window.innerWidth - 16) - VIEWPORT_PADDING;
        this.loginPopoverLeft = Math.round(Math.max(minLeft, Math.min(left, maxLeft)));

        this.loginPopoverArrowLeft = Math.round(rect.left + rect.width / 2 - this.loginPopoverLeft - ARROW_WIDTH / 2);
      });
    }
  }

  // Account Popup
  toggleAccount() {
    this.showAccount = !this.showAccount;
    this.showLogin = false;

    if (this.showAccount) {
      queueMicrotask(() => {
        const rect = this.accountBtn.nativeElement.getBoundingClientRect();

        this.accountPopoverTop = rect.bottom + 24;

        let left = rect.left + rect.width / 2 - Math.min(ACCOUNT_POPOVER_WIDTH, window.innerWidth - 16) / 2;
        const minLeft = VIEWPORT_PADDING;
        const maxLeft = window.innerWidth - Math.min(ACCOUNT_POPOVER_WIDTH, window.innerWidth - 16) - VIEWPORT_PADDING;
        this.accountPopoverLeft = Math.round(Math.max(minLeft, Math.min(left, maxLeft)));

        this.accountPopoverArrowLeft = Math.round(rect.left + rect.width / 2 - this.accountPopoverLeft - ARROW_WIDTH / 2);
      });
    }
  }

  onLoginSuccess() {
    this.showLogin = false;
    this.router.navigate(['/home']);
  }

  switchHousehold(id: string) {
    this.householdService.switchHousehold(id).subscribe({
      next: () => {
        // Refresh all household-dependent data and persist the selected household.
        this.auth.fetchUser().subscribe({ next: () => window.location.reload() });
      }
    });
  }

  navigateToAccount() {
    this.router.navigate(['/account']);
    this.showAccount = false;
  }

  toggleWgDropdown() {
    this.showWgDropdown = !this.showWgDropdown;
  }

  // Fullscreen
  isFullscreen = false;

  toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      const elem = document.documentElement;
      if (elem.requestFullscreen) elem.requestFullscreen();
      else if ((elem as any).webkitRequestFullscreen) (elem as any).webkitRequestFullscreen();
      else if ((elem as any).msRequestFullscreen) (elem as any).msRequestFullscreen();
    }
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange() {
    this.isFullscreen = !!document.fullscreenElement;
  }

  // Key Listener
  @HostListener('document:keydown.escape')
  onEscape() {
    this.dashboardService.setEditMode(false);
    this.showLogin = false;
    this.showWgDropdown = false;
    this.showAccount = false;
    this.menuOpen = false;
  }

  closeMenu() { this.menuOpen = false; }
  toggleMenu() { this.menuOpen = !this.menuOpen; }
}
