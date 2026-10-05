import { localIsoDate } from '../../../shared/date-utils';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, of } from 'rxjs';
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

  addRecipe(recipeId: string, persons: number, unitsPerPerson: number = 1): Observable<number> {
    return this.http
      .post<{ count: number }>(`${environment.apiUrl}/shopping-items/add-recipe/`, { recipeId, persons, unitsPerPerson })
      .pipe(map((res) => res.count));
  }

  previewMenuplan(payload: MenuExportRequest): Observable<MenuExportPlan> {
    return this.http.post<MenuExportPlan>(`${environment.apiUrl}/shopping-items/export-week/`, {...payload,dryRun:true});
  }
  applyMenuplan(payload: MenuExportRequest): Observable<number> {
    return this.http.post<{count:number}>(`${environment.apiUrl}/shopping-items/export-week/`,payload).pipe(map(res=>res.count));
  }

  exportMenuplan(meals: string[], weekTag: string, personCounts: Record<string, number> = {}): Observable<number> {
    if (!meals.length) return of(0);
    const monday=new Date(meals[0].split(':')[0]+'T12:00:00');
    monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
    // Week identifiers and attendance totals are calculated by the server.
    return this.applyMenuplan({weekStart:localIsoDate(monday),meals,extraServings:{},strict:true,resetExisting:true});
  }
}

export interface MenuExportPlan {
  data: Array<{name:string;quantity:number|null;unit:string;category:string;sources:string[];quantityIncomplete:boolean}>;
  count:number;
  meals:Array<{key:string;recipe:string;persons:number|null;leftoverPersons:number;servings:number;servingType:string}>;
  warnings:string[];
  weekTag:string;
  blocked:boolean;
  previewToken:string;
}
export interface MenuExportRequest {
  weekStart:string;
  meals:string[];
  extraServings:Record<string,number>;
  strict:true;
  resetExisting:true;
  previewToken?:string;
}
