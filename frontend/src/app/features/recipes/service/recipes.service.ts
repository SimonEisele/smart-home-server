import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Ingredient, Recipe } from '../model/recipes.model';
import { UnlinkedIngredient } from '../../ingredients/model/ingredient.model';

@Injectable({ providedIn: 'root' })
export class RecipesService {
  constructor(private http: HttpClient) {}

  getRecipes(): Observable<Recipe[]> {
    return this.http.get<{ data: Recipe[] }>(`${environment.apiUrl}/recipes/`).pipe(map(r => r.data));
  }

  createRecipe(recipe: Partial<Recipe>): Observable<Recipe> {
    return this.http.post<{ data: Recipe }>(`${environment.apiUrl}/recipes/`, recipe).pipe(map(r => r.data));
  }

  updateRecipe(id: string, patch: Partial<Recipe>): Observable<Recipe> {
    return this.http.patch<{ data: Recipe }>(`${environment.apiUrl}/recipes/${id}/`, patch).pipe(map(r => r.data));
  }

  deleteRecipe(id: string): Observable<void> {
    return this.http.delete<{ success: boolean }>(`${environment.apiUrl}/recipes/${id}/`).pipe(map(() => void 0));
  }

  getIngredients(): Observable<Ingredient[]> {
    return this.http.get<{ data: Ingredient[] }>(`${environment.apiUrl}/ingredients/`).pipe(map(r => r.data));
  }

  createIngredient(data: Partial<Ingredient>): Observable<Ingredient> {
    return this.http.post<{ data: Ingredient }>(`${environment.apiUrl}/ingredients/`, data).pipe(map(r => r.data));
  }

  updateIngredient(id: number, data: Partial<Ingredient>): Observable<Ingredient> {
    return this.http.patch<{ data: Ingredient }>(`${environment.apiUrl}/ingredients/${id}/`, data).pipe(map(r => r.data));
  }

  /** Freely typed recipe ingredients of the active WG that are not in the catalog. */
  getUnlinkedIngredients(): Observable<UnlinkedIngredient[]> {
    return this.http
      .get<{ data: UnlinkedIngredient[] }>(`${environment.apiUrl}/ingredients/unlinked/`)
      .pipe(map((r) => r.data));
  }

  /** Folds `id` into `targetId`; recipes using the duplicate then use the target. */
  mergeIngredient(id: number, targetId: number): Observable<Ingredient> {
    return this.http
      .post<{ data: Ingredient }>(`${environment.apiUrl}/ingredients/${id}/merge/`, { targetId })
      .pipe(map((r) => r.data));
  }

  deleteIngredient(id: number): Observable<void> {
    return this.http.delete<{ success: boolean }>(`${environment.apiUrl}/ingredients/${id}/`).pipe(map(() => void 0));
  }
}
