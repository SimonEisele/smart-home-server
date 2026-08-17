import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Menu } from '../model/menuplan.model';

@Injectable({ providedIn: 'root' })
export class MenuService {
  constructor(private http: HttpClient) {}

  getMenus(weekStart: string, days: number = 7): Observable<Menu[]> {
    const url = `${environment.apiUrl}/menus/?weekStart=${weekStart}&days=${days}&autoPersons=true`;
    return this.http.get<{ data: Menu[] }>(url).pipe(map((res) => res.data));
  }

  createMenu(menu: Partial<Menu>): Observable<Menu> {
    return this.http.post<{ data: Menu }>(`${environment.apiUrl}/menus/`, menu).pipe(
      map((res) => res.data)
    );
  }

  updateMenu(id: string, patch: Partial<Menu>): Observable<Menu> {
    return this.http.patch<{ data: Menu }>(`${environment.apiUrl}/menus/${id}/`, patch).pipe(
      map((res) => res.data)
    );
  }

  exportWeekToShoppingList(weekStart: string, days: number = 7, resetExisting: boolean = false): Observable<number> {
    return this.http
      .post<{ data: unknown[] }>(`${environment.apiUrl}/shopping-items/export-week/`, {
        weekStart,
        days,
        resetExisting,
      })
      .pipe(map((res) => res.data.length));
  }

  exportMeal(dateStr: string, meal: string, weekTag: string): Observable<number> {
    return this.http
      .post<{ data: unknown[]; count: number }>(`${environment.apiUrl}/shopping-items/export-week/`, {
        meals: [`${dateStr}:${meal}`],
        weekTag,
      })
      .pipe(map((res) => res.count ?? res.data?.length ?? 0));
  }

  recalculatePersons(weekStart: string, days: number = 7): Observable<Menu[]> {
    return this.http
      .post<{ data: Menu[] }>(`${environment.apiUrl}/menus/recalculate-persons/`, { weekStart, days })
      .pipe(map((res) => res.data));
  }
}