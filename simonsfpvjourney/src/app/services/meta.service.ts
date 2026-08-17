import { HttpClient, HttpHeaders } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Category, Drone, Tag } from "../models/video.model";
import { Observable, map } from "rxjs";

@Injectable({ providedIn: 'root' })
export class MetaService {
  constructor(private http: HttpClient) {}

  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(`/api/categories/`);
  }

  getTags(): Observable<Tag[]> {
    return this.http.get<Tag[]>(`/api/tags/`);
  }

  getDrones(): Observable<Drone[]> {
    return this.http.get<Drone[]>(`/api/drones/`).pipe(
      map(drones => drones.map(d => ({
        ...d,
        image: this.toRelativeMedia(d.image),
        images: (d.images ?? []).map(img => ({
          ...img,
          image: this.toRelativeMedia(img.image)
        }))
      })))
    );
  }

  /** Convert absolute localhost/127.0.0.1 media URLs to relative paths for proxying */
  private toRelativeMedia(url: string | undefined | null): string {
    if (!url) return '' as any;
    if (url.startsWith('/media/')) return url;
    const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i;
    if (localhostPattern.test(url)) {
      try {
        const u = new URL(url);
        return u.pathname + (u.search || '');
      } catch {
        return url.replace(/^https?:\/\/[^/]+/, '');
      }
    }
    return url;
  }
}