import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { Login } from './core/login/login';
import { TodosPage } from './features/todos/page/todos.page';
import { Dashboard } from './dashboard/component/dashboard';
import { WeatherPage } from './features/weather/page/weather.page';
import { MenuplanPage } from './features/menuplan/page/menuplan.page';

export const routes: Routes = [
  { path: '', component: Dashboard },
  { path: 'login', component: Login },
  { path: 'home', component: Dashboard },
  { path: 'todos', component: TodosPage },
  { path: 'weather', component: WeatherPage },
  { path: 'menuplan', component: MenuplanPage },
  { path: 'login', component: Login },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRouting {
  
}