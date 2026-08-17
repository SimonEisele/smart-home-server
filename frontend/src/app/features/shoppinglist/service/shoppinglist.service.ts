import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ShoppingItem } from '../model/shoppinglist.model';

@Injectable({ providedIn: 'root' })
export class ShoppinglistService {
  constructor(private http: HttpClient) {}

  getItems(): Observable<ShoppingItem[]> {
    return this.http.get<{ data: ShoppingItem[] }>(`${environment.apiUrl}/shopping-items/`).pipe(
      map((res) => res.data)
    );
  }

  createItem(item: Partial<ShoppingItem>): Observable<ShoppingItem> {
    return this.http.post<{ data: ShoppingItem }>(`${environment.apiUrl}/shopping-items/`, item).pipe(
      map((res) => res.data)
    );
  }

  updateItem(id: string, patch: Partial<ShoppingItem>): Observable<ShoppingItem> {
    return this.http.patch<{ data: ShoppingItem }>(`${environment.apiUrl}/shopping-items/${id}/`, patch).pipe(
      map((res) => res.data)
    );
  }

  deleteItem(id: string): Observable<void> {
    return this.http.delete<{ success: boolean }>(`${environment.apiUrl}/shopping-items/${id}/`).pipe(
      map(() => void 0)
    );
  }

  getSuggestions(query: string): Observable<Array<Partial<ShoppingItem>>> {
    const encoded = encodeURIComponent(query);
    return this.http
      .get<{ data: Array<Partial<ShoppingItem>> }>(`${environment.apiUrl}/shopping-items/suggestions/?q=${encoded}`)
      .pipe(map((res) => res.data));
  }

  addRecipe(recipeId: string, persons: number): Observable<number> {
    return this.http
      .post<{ count: number }>(`${environment.apiUrl}/shopping-items/add-recipe/`, { recipeId, persons })
      .pipe(map((res) => res.count));
  }

  exportMenuplan(meals: string[], weekTag: string, personCounts: Record<string, number> = {}): Observable<number> {
    return this.http
      .post<{ count: number }>(`${environment.apiUrl}/shopping-items/export-week/`, { meals, weekTag, personCounts })
      .pipe(map((res) => res.count));
  }
}
