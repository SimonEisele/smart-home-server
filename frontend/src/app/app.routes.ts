import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TodosPage } from './features/todos/page/todos.page';
import { Dashboard } from './dashboard/component/dashboard';
import { WeatherPage } from './features/weather/page/weather.page';
import { MenuplanPage } from './features/menuplan/page/menuplan.page';
import { NotesPage } from './features/notes/page/notes.page';
import { Register } from './core/register/register';
import { Recipes } from './features/recipes/recipes';

export const routes: Routes = [
  { path: '', component: Dashboard },
  { path: 'register', component: Register },
  { path: 'home', component: Dashboard },
  { path: 'todos', component: TodosPage },
  { path: 'weather', component: WeatherPage },
  { path: 'menuplan', component: MenuplanPage },
  { path: 'notes', component: NotesPage }
  ,{ path: 'recipes', component: Recipes }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRouting {
  
}