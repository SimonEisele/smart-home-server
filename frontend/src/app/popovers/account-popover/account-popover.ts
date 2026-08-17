import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/service/auth.service';
import { HouseholdService } from '../../shared/services/household.service';
import { Observable } from 'rxjs';
import { User, Household } from '../../core/auth/model/auth.model';

@Component({
  selector: 'account-popover',
  standalone: true,
  imports: [ CommonModule, RouterLink ],
  templateUrl: './account-popover.html',
  styleUrl: './account-popover.css',
})
export class AccountPopover {
  user$: Observable<User | null>;
  activeHousehold$: Observable<Household | null>;

  @Input() arrowLeft = 0;

  @Output() close = new EventEmitter<void>();

  constructor(private authService: AuthService, public householdService: HouseholdService) {
    this.user$ = this.authService.user$;
    this.activeHousehold$ = this.householdService.activeHousehold$;
  }

  logout() {
    this.authService.logout();
    this.closePopover();
  }

  closePopover() {
    this.close.emit();
  }

  @HostListener('document:click', ['$event'])
  onOutsideClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('account-popover')) {
      this.closePopover();
    }
  }
}
