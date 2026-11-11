import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TodosPage } from './features/todos/page/todos.page';
import { Dashboard } from './dashboard/component/dashboard';
import { WeatherPage } from './features/weather/page/weather.page';
import { MenuplanPage } from './features/menuplan/page/menuplan.page';
import { Register } from './core/register/register';
import { RecipesPage } from './features/recipes/page/recipes.page';
import { ShoppinglistPage } from './features/shoppinglist/page/shoppinglist.page';
import { CalendarPage } from './features/calendar/page/calendar.page';
import { AccountManager } from './core/account-manager/account-manager';
import { IngredientsPage } from './features/ingredients/page/ingredients.page';
import { CleaningPage } from './features/cleaning/page/cleaning.page';
import { LandingPage } from './core/landing/landing';
import { AssistantPage } from './features/assistant/assistant.page';
import { authGuard, guestGuard } from './core/auth/guards/auth.guard';

export const routes: Routes = [
  { path: '', component: LandingPage, canActivate: [guestGuard] },
  { path: 'register', component: Register },
  { path: 'home', component: Dashboard, canActivate: [authGuard] },
  { path: 'todos', component: TodosPage, canActivate: [authGuard] },
  { path: 'weather', component: WeatherPage, canActivate: [authGuard] },
  { path: 'menuplan', component: MenuplanPage, canActivate: [authGuard] },
  { path: 'recipes', component: RecipesPage, canActivate: [authGuard] },
  { path: 'ingredients', component: IngredientsPage, canActivate: [authGuard] },
  { path: 'shoppinglist', component: ShoppinglistPage, canActivate: [authGuard] },
  { path: 'calendar', component: CalendarPage, canActivate: [authGuard] },
  { path: 'cleaning', component: CleaningPage, canActivate: [authGuard] },
  { path: 'assistant', component: AssistantPage, canActivate: [authGuard] },
  { path: 'account', component: AccountManager, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRouting {

}