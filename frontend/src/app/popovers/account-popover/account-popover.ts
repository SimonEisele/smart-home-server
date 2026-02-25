import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { AuthService } from '../../core/auth/service/auth.service';
import { Observable } from 'rxjs';
import { User } from '../../core/auth/model/auth.model';

@Component({
  selector: 'account-popover',
  standalone: true,
  imports: [ CommonModule ],
  templateUrl: './account-popover.html',
  styleUrl: './account-popover.css',
})
export class AccountPopover {
  user$: Observable<User | null>;
  
  @Input() arrowLeft = 0;

  @Output() close = new EventEmitter<void>();

  constructor(private authService: AuthService) {
    this.user$ = this.authService.user$;
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
