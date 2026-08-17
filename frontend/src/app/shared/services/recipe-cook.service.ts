import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Recipe } from '../../features/recipes/model/recipes.model';

export interface CookSlot {
  date: string;
  meal: 'breakfast' | 'lunch' | 'dinner';
  recipe: Recipe;
  persons: number;
  weekTag: string;
}

@Injectable({ providedIn: 'root' })
export class RecipeCookService {
  private slotSubject = new BehaviorSubject<CookSlot | null>(null);
  slot$ = this.slotSubject.asObservable();

  open(slot: CookSlot): void { this.slotSubject.next(slot); }
  close(): void { this.slotSubject.next(null); }
}
