import { Routes } from '@angular/router';
import { Map } from './pages/map/map';
import { Videos } from './pages/videos/videos';
import { Pictures } from './pages/pictures/pictures';
import { Gear } from './pages/gear/gear';
import { Analytics } from './pages/analytics/analytics';
import { dashboardGuard } from './guards/dashboard.guard';
import { Impressum } from './pages/impressum/impressum';
import { Privacypolicy } from './pages/privacypolicy/privacypolicy';
import { NotFound } from './pages/not-found/not-found';

export const routes: Routes = [
        { path: '', pathMatch: 'full', redirectTo: 'en' },
        {
            path: ':lang',
            children: [
                { path: '', component: Map },
                // { path: 'impressum', component: Impressum },
                { path: 'privacy_policy', component: Privacypolicy },
                { path: 'videos', component: Videos },
                { path: 'pictures', component: Pictures },
                { path: 'gear', component: Gear },
                { path: 'dashboard', component: Analytics, canActivate: [dashboardGuard] },
                { path: '**', component: NotFound },
            ],
        },
        { path: '**', redirectTo: 'en' },
];
