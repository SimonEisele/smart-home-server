import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { Dish, Menu } from '../model/menuplan.model';

@Injectable({ providedIn: 'root' })
export class DishService {
  private dishes: Dish[] = [
    {
      id: '1',
      name: 'Spaghetti Bolognese',
      ingredients: [{ name: 'Spaghetti', quantityPerPerson: 100, unit: 'g' }, { name: 'Hackfleisch', quantityPerPerson: 150, unit: 'g' }]
    },
    {
      id: '2',
      name: 'Pizza Margherita',
      ingredients: [{ name: 'Mehl', quantityPerPerson: 200, unit: 'g' }, { name: 'Tomaten', quantityPerPerson: 80, unit: 'g' }]
    },
    {
      id: '3',
      name: 'Salat mit Hähnchen',
      ingredients: [{ name: 'Salat', quantityPerPerson: 50, unit: 'g' }, { name: 'Hähnchenbrust', quantityPerPerson: 100, unit: 'g' }]
    }
  ];

  private dishes$ = new BehaviorSubject<Dish[]>(this.dishes);

  // Observable liefert die aktuellen Dishes
  getDishes(): Observable<Dish[]> {
    return this.dishes$.asObservable();
  }

  addDish(dish: Dish) {
    this.dishes.push(dish);
    this.dishes$.next(this.dishes);
  }

  // Später: Backend-Integration
  fetchDishesFromBackend(): Observable<Dish[]> {
    // return this.http.get<Dish[]>('/api/dishes');
    return of(this.dishes); // aktuell Mock
  }
}

@Injectable({ providedIn: 'root' })
export class MenuService {
  private menus: Menu[] = [];
  private menus$ = new BehaviorSubject<Menu[]>(this.menus);

  constructor(private dishService: DishService) {}

  getMenus(): Observable<Menu[]> {
    return this.menus$.asObservable();
  }

  addMenu(menu: Menu) {
    this.menus.push(menu);
    this.menus$.next(this.menus);
  }

  setMenuForDate(date: string, menu: Partial<Menu>) {
    const idx = this.menus.findIndex(m => m.date === date);
    if (idx >= 0) {
      this.menus[idx] = { ...this.menus[idx], ...menu } as Menu;
    } else {
      this.menus.push({ id: `${this.menus.length + 1}`, date, ...menu } as Menu);
    }
    this.menus$.next(this.menus);
  }

  // Woche oder beliebig viele Tage mit Dishes erzeugen
  generateMockMenus(startDate: Date, numberOfDays: number = 14) {
    this.dishService.getDishes().subscribe(dishes => {
      this.menus = [];

      for (let i = 0; i < numberOfDays; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);

        // Zufällige Auswahl der Dishes
        const lunch = dishes[Math.floor(Math.random() * dishes.length)];
        const dinner = dishes[Math.floor(Math.random() * dishes.length)];

        this.menus.push({
          id: `${i + 1}`,
          date: date.toISOString().split('T')[0],
          lunch,
          dinner,
          lunchPersons: 2,
          dinnerPersons: 2
        });
      }

      this.menus$.next(this.menus);
    });
  }

  // Später: Backend-Integration
  fetchMenusFromBackend(): Observable<Menu[]> {
    // return this.http.get<Menu[]>('/api/menus');
    return of(this.menus); // aktuell Mock
  }
}