import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Recipe } from '../model/recipes.model';

@Injectable({ providedIn: 'root' })
export class RecipesService {
  private mock: Recipe[] = [
    { id: 'r1', name: 'Spaghetti Bolognese', ingredients: [], durationMinutes: 30 },
    { id: 'r2', name: 'Pizza Margherita', ingredients: [], durationMinutes: 25 },
    { id: 'r3', name: 'Salat mit Hähnchen', ingredients: [], durationMinutes: 20 }
  ];

  constructor(private http: HttpClient) {}

  getRecipes(): Observable<Recipe[]> {
    const url = `${environment.apiUrl}/recipes/`;
    return this.http ? this.http.get<Recipe[]>(url) : of(this.mock);
  }
}
