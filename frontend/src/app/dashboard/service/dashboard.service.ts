// dashboard.service.ts
import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { environment } from '../../../environments/environment';
import { DashboardItem } from "../models/dashboard.models";
import { BehaviorSubject, Observable } from "rxjs";
import { map } from "rxjs/operators";

export interface DashboardLayout {
  id: string;
  name: string;
  itemCount: number;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(private http: HttpClient) {}

  private editModeSubject = new BehaviorSubject<boolean>(false);
    editMode$ = this.editModeSubject.asObservable();

  toggleEditMode() {
    this.editModeSubject.next(!this.editModeSubject.value);
  }

  setEditMode(value: boolean) {
    this.editModeSubject.next(value);
  }

  getDashboard(): Observable<DashboardItem[]> {
    return this.http.get<DashboardItem[]>(`${environment.apiUrl}/users/dashboard/`);
  }

  saveItem(item: DashboardItem): Observable<DashboardItem> {
    if(item.id) {
      return this.http.patch<DashboardItem>(`${environment.apiUrl}/users/dashboard/${item.id}/`,
        {
          x: item.x,
          y: item.y,
          cols: item.cols,
          rows: item.rows,
          config: item.config
        }
      );
    } else {
      return this.http.post<DashboardItem>(`${environment.apiUrl}/users/dashboard/`, item);
    }
  }

  deleteItem(id: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/users/dashboard/${id}/`);
  }

  // ── Layouts ──────────────────────────────────────────────────────────────
  getLayouts(): Observable<DashboardLayout[]> {
    return this.http.get<{ data: DashboardLayout[] }>(`${environment.apiUrl}/users/dashboard/layouts/`).pipe(
      map(r => r.data)
    );
  }

  saveLayout(name: string): Observable<DashboardLayout> {
    return this.http.post<{ data: DashboardLayout }>(`${environment.apiUrl}/users/dashboard/layouts/`, { name }).pipe(
      map(r => r.data)
    );
  }

  applyLayout(id: string): Observable<DashboardItem[]> {
    return this.http.post<{ data: DashboardItem[] }>(`${environment.apiUrl}/users/dashboard/layouts/${id}/apply/`, {}).pipe(
      map(r => r.data)
    );
  }

  deleteLayout(id: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/users/dashboard/layouts/${id}/`);
  }
}
