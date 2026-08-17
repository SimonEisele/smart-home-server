import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface FeedbackPayload {
  message: string;
  category?: string;
  name?: string;
  contact?: string;
  page_url?: string;
}

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly baseUrl = '/api/feedback/';

  constructor(private http: HttpClient) {}

  submit(payload: FeedbackPayload): Observable<any> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http.post(this.baseUrl, payload, { headers });
  }
}
