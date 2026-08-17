import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Picture } from "../models/picture.model";
import { Observable } from "rxjs";

@Injectable({ providedIn: 'root' })
export class PictureService {
  constructor(private http: HttpClient) {}

  list(): Observable<Picture[]> {
    return this.http.get<Picture[]>(`/api/pictures/`);
  }

  uploadBulk(videoId: string, files: File[]): Observable<Picture[]> {
    const form = new FormData();
    for (const f of files) form.append('images', f);
    return this.http.post<Picture[]>(`/api/videos/${videoId}/pictures/bulk/`, form);
  }
}