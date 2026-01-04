import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { interval, Observable, Subscription } from 'rxjs';
import { AuthService } from '../../../core/auth/service/auth.service';
import { GreetingPipe } from '../pipes/datetime.pipe';
import { User } from '../../../core/auth/model/auth.model';

@Component({
  selector: 'app-datetime',
  standalone: true,
  imports: [ CommonModule, GreetingPipe ],
  templateUrl: './datetime.html',
  styleUrl: './datetime.css',
})
export class DateTimeWidget implements OnInit, OnDestroy {
  now = new Date();
  private sub!: Subscription;
  user$!: Observable<User | null>;

  constructor(private cdr: ChangeDetectorRef, private auth: AuthService) {}

  ngOnInit() {
    this.user$ = this.auth.user$;
    this.sub = interval(1000).subscribe(() => {
      this.now = new Date();
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }
}