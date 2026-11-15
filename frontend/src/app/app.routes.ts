import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LandingPage } from './core/landing/landing';
import { authGuard, guestGuard } from './core/auth/guards/auth.guard';

// Pages load on first visit, so the app starts faster (and stays within the bundle budget).
export const routes: Routes = [
  { path: '', component: LandingPage, canActivate: [guestGuard] },
  { path: 'register', loadComponent: () => import('./core/register/register').then(m => m.Register) },
  { path: 'home', loadComponent: () => import('./dashboard/component/dashboard').then(m => m.Dashboard), canActivate: [authGuard] },
  { path: 'todos', loadComponent: () => import('./features/todos/page/todos.page').then(m => m.TodosPage), canActivate: [authGuard] },
  { path: 'weather', loadComponent: () => import('./features/weather/page/weather.page').then(m => m.WeatherPage), canActivate: [authGuard] },
  { path: 'menuplan', loadComponent: () => import('./features/menuplan/page/menuplan.page').then(m => m.MenuplanPage), canActivate: [authGuard] },
  { path: 'recipes', loadComponent: () => import('./features/recipes/page/recipes.page').then(m => m.RecipesPage), canActivate: [authGuard] },
  { path: 'ingredients', loadComponent: () => import('./features/ingredients/page/ingredients.page').then(m => m.IngredientsPage), canActivate: [authGuard] },
  { path: 'shoppinglist', loadComponent: () => import('./features/shoppinglist/page/shoppinglist.page').then(m => m.ShoppinglistPage), canActivate: [authGuard] },
  { path: 'calendar', loadComponent: () => import('./features/calendar/page/calendar.page').then(m => m.CalendarPage), canActivate: [authGuard] },
  { path: 'cleaning', loadComponent: () => import('./features/cleaning/page/cleaning.page').then(m => m.CleaningPage), canActivate: [authGuard] },
  { path: 'assistant', loadComponent: () => import('./features/assistant/assistant.page').then(m => m.AssistantPage), canActivate: [authGuard] },
  { path: 'account', loadComponent: () => import('./core/account-manager/account-manager').then(m => m.AccountManager), canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRouting {

}