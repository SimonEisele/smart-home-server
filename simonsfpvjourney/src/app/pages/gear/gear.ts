import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { Drone } from '../../models/video.model';
import { MetaService } from '../../services/meta.service';
import { Gearmodal } from '../../popups/gearmodal/gearmodal';
import { AnalyticsService } from '../../services/analytics.service';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-gear',
  standalone: true,
  imports: [ CommonModule, Gearmodal, TranslateModule ],
  templateUrl: './gear.html',
  styleUrl: './gear.css',
})
export class Gear {
  drones$!: Observable<Drone[]>;
  dronesCache: Drone[] = [];
  selectedIndex = -1;
  selectedDrone?: Drone;
  private modalStartTs?: number;

  constructor(
    private metaService: MetaService,
    private analytics: AnalyticsService
  ) {}

  ngOnInit(): void {
    this.drones$ = this.metaService.getDrones().pipe(
      catchError(() => {
        return of([]);
      })
    );
  }

  isDroneRetired(drone: Drone): boolean {
    const d = drone as Drone & { isActive?: boolean | string | number | null };
    const state = d.is_active ?? d.isActive;

    if (state === true) return false;
    if (state === false) return true;
    if (typeof state === 'number') return state === 0;
    if (typeof state === 'string') return state.trim().toLowerCase() === 'false' || state.trim() === '0';

    // Requirement: when "is active" is not set, mark as retired.
    return state == null;
  }

  openModal(drones: Drone[], index: number): void {
    this.dronesCache = drones;
    this.selectedIndex = index;
    this.selectedDrone = drones[index];
    this.modalStartTs = Date.now();
    this.trackDroneView(this.selectedDrone);
  }

  closeModal(): void {
    this.finishDroneDuration('close');
    this.selectedIndex = -1;
    this.selectedDrone = undefined;
  }

  showPrev(): void {
    if (this.selectedIndex > 0) {
      this.finishDroneDuration('switch');
      this.selectedIndex -= 1;
      this.selectedDrone = this.dronesCache[this.selectedIndex];
      this.modalStartTs = Date.now();
      this.trackDroneView(this.selectedDrone);
    }
  }

  showNext(): void {
    if (this.selectedIndex < this.dronesCache.length - 1) {
      this.finishDroneDuration('switch');
      this.selectedIndex += 1;
      this.selectedDrone = this.dronesCache[this.selectedIndex];
      this.modalStartTs = Date.now();
      this.trackDroneView(this.selectedDrone);
    }
  }

  private trackDroneView(drone?: Drone): void {
    if (!drone?.id) return;
    this.analytics.trackDroneView(drone.id, { name: drone.name });
  }

  private finishDroneDuration(reason: 'close' | 'switch'): void {
    if (!this.selectedDrone || !this.modalStartTs) return;
    const seconds = Math.max(1, Math.round((Date.now() - this.modalStartTs) / 1000));
    this.analytics.trackPopupDuration('drone', seconds, { drone_id: this.selectedDrone.id, name: this.selectedDrone.name, reason });
    this.modalStartTs = undefined;
  }
}
