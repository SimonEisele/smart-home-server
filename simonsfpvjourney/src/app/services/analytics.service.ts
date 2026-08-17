import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { Observable } from 'rxjs';
import { ConsentService } from './consent.service';

export interface AnalyticsOverview {
  today: {
    date: string;
    video_plays: number;
    video_completes: number;
    gallery_opens: number;
    map_clicks: number;
    likes: number;
    unique_sessions: number;
    avg_events_per_session: number;
    watch_seconds: number;
    avg_session_seconds?: number;
  };
  range: {
    days: number;
    start: string;
    end: string;
    video_plays: number;
    unique_sessions: number;
    avg_events_per_session: number;
    avg_session_seconds?: number;
  };
}

export interface AnalyticsSeriesPoint {
  date: string;
  count: number;
  watch_seconds: number;
}

export interface AnalyticsSeriesResponse {
  days: number;
  series: AnalyticsSeriesPoint[];
}

export interface AnalyticsTopItem {
  video_id: string;
  title: string;
  count: number;
  watch_seconds?: number;
}

export interface AnalyticsTopResponse {
  days: number;
  items: AnalyticsTopItem[];
}

export interface AnalyticsDeviceItem {
  device: string;
  count: number;
}

export interface AnalyticsDeviceResponse {
  days: number;
  items: AnalyticsDeviceItem[];
}

export interface AnalyticsMapItem {
  video_id: string;
  title: string;
  country?: string;
  place?: string;
  count: number;
}

export interface AnalyticsMapResponse {
  days: number;
  items: AnalyticsMapItem[];
}

export interface AnalyticsGalleryItem {
  video_id: string;
  title: string;
  count: number;
}

export interface AnalyticsGalleryResponse {
  days: number;
  items: AnalyticsGalleryItem[];
}

export interface AnalyticsDroneItem {
  drone_id?: string;
  name?: string;
  count: number;
}

export interface AnalyticsDroneResponse {
  days: number;
  items: AnalyticsDroneItem[];
}

export interface AnalyticsPopupDurationItem {
  kind: string;
  avg_seconds: number;
  count: number;
}

export interface AnalyticsPopupDurationResponse {
  days: number;
  items: AnalyticsPopupDurationItem[];
}

export interface AnalyticsPopupDurationDetailItem {
  id: string;
  name: string;
  count: number;
  avg_seconds: number;
}

export interface AnalyticsPopupDurationDetailResponse {
  days: number;
  videos: AnalyticsPopupDurationDetailItem[];
  pictures: AnalyticsPopupDurationDetailItem[];
  drones: AnalyticsPopupDurationDetailItem[];
}

export interface AnalyticsEventPayload {
  event_type: 'video-play' | 'video-complete' | 'gallery-open' | 'map-click' | 'like' | 'drone-view' | 'popup-duration' | 'session-duration';
  session_id?: string;
  video_id?: string;
  picture_id?: string;
  page_path?: string;
  referrer?: string;
  watch_seconds?: number;
  metadata?: Record<string, any>;
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly baseUrl = '/api/analytics/';
  private readonly sessionKey = 'simonsfpvjourney.analytics.session';
  private readonly isBrowser: boolean;
  private sessionId?: string;

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) platformId: Object,
    private consent: ConsentService
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    this.initSessionDurationNoConsent();
  }

  getAuthStatus(): Observable<{ username: string }> {
    return this.http.get<{ username: string }>(`${this.baseUrl}me/`, { withCredentials: true });
  }

  getAdminLoginUrl(): string {
    return `${this.getApiBase()}/admin/login/`;
  }

  getOverview(days = 30): Observable<AnalyticsOverview> {
    return this.http.get<AnalyticsOverview>(`${this.baseUrl}overview/?days=${days}`, { withCredentials: true });
  }


  getViewsPerDay(days = 30): Observable<AnalyticsSeriesResponse> {
    return this.http.get<AnalyticsSeriesResponse>(`${this.baseUrl}views-per-day/?days=${days}`, { withCredentials: true });
  }

  getTopVideos(days = 30, limit = 8): Observable<AnalyticsTopResponse> {
    return this.http.get<AnalyticsTopResponse>(`${this.baseUrl}top-videos/?days=${days}&limit=${limit}`, { withCredentials: true });
  }

  getDeviceStats(days = 30): Observable<AnalyticsDeviceResponse> {
    return this.http.get<AnalyticsDeviceResponse>(`${this.baseUrl}device-stats/?days=${days}`, { withCredentials: true });
  }

  getMapStats(days = 30, limit = 8): Observable<AnalyticsMapResponse> {
    return this.http.get<AnalyticsMapResponse>(`${this.baseUrl}map-stats/?days=${days}&limit=${limit}`, { withCredentials: true });
  }

  getGalleryStats(days = 30, limit = 8): Observable<AnalyticsGalleryResponse> {
    return this.http.get<AnalyticsGalleryResponse>(`${this.baseUrl}gallery-stats/?days=${days}&limit=${limit}`, { withCredentials: true });
  }

  getDroneStats(days = 30, limit = 8): Observable<AnalyticsDroneResponse> {
    return this.http.get<AnalyticsDroneResponse>(`${this.baseUrl}drone-stats/?days=${days}&limit=${limit}`, { withCredentials: true });
  }

  getPopupDurationStats(days = 30): Observable<AnalyticsPopupDurationResponse> {
    return this.http.get<AnalyticsPopupDurationResponse>(`${this.baseUrl}popup-duration-stats/?days=${days}`, { withCredentials: true });
  }

  getPopupDurationDetail(days = 30): Observable<AnalyticsPopupDurationDetailResponse> {
    return this.http.get<AnalyticsPopupDurationDetailResponse>(`${this.baseUrl}popup-duration-detail/?days=${days}`, { withCredentials: true });
  }

  trackEvent(payload: AnalyticsEventPayload): void {
    if (!this.isBrowser) return;
    if (!this.consent.hasConsent()) return;
    const sessionId = payload.session_id ?? this.getOrCreateSessionId();
    if (!sessionId) return;

    const enriched: AnalyticsEventPayload = {
      ...payload,
      session_id: sessionId,
      page_path: payload.page_path ?? this.getPagePath(),
      referrer: payload.referrer ?? this.getReferrer(),
    };

    this.http.post(`${this.baseUrl}events/`, enriched).subscribe({
      error: () => {},
    });
  }

  trackVideoPlay(videoId: string, metadata?: Record<string, any>): void {
    this.trackEvent({
      event_type: 'video-play',
      video_id: videoId,
      metadata,
    });
  }

  trackVideoComplete(videoId: string, watchSeconds: number, metadata?: Record<string, any>): void {
    this.trackEvent({
      event_type: 'video-complete',
      video_id: videoId,
      watch_seconds: watchSeconds,
      metadata,
    });
  }

  trackGalleryOpen(pictureId: string, metadata?: Record<string, any>): void {
    this.trackEvent({
      event_type: 'gallery-open',
      picture_id: pictureId,
      metadata,
    });
  }

  trackMapClick(videoId: string, metadata?: Record<string, any>): void {
    this.trackEvent({
      event_type: 'map-click',
      video_id: videoId,
      metadata,
    });
  }

  trackLike(videoId: string, metadata?: Record<string, any>): void {
    this.trackEvent({
      event_type: 'like',
      video_id: videoId,
      metadata,
    });
  }

  trackDroneView(droneId: string, metadata?: Record<string, any>): void {
    this.trackEvent({
      event_type: 'drone-view',
      metadata: { drone_id: droneId, ...(metadata ?? {}) },
    });
  }

  trackPopupDuration(kind: string, seconds: number, metadata?: Record<string, any>): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    this.trackEvent({
      event_type: 'popup-duration',
      watch_seconds: Math.round(seconds),
      metadata: { kind, ...(metadata ?? {}) },
    });
  }

  private getOrCreateSessionId(): string | null {
    if (!this.isBrowser) return null;
    if (this.sessionId) return this.sessionId;

    try {
      const storage = this.getSessionStorage();
      if (!storage) return null;

      const existing = storage.getItem(this.sessionKey);
      if (existing) {
        this.sessionId = existing;
        return existing;
      }

      const next = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : this.fallbackUUID();

      storage.setItem(this.sessionKey, next);
      this.sessionId = next;
      return next;
    } catch {
      return null;
    }
  }

  private fallbackUUID(): string {
    const part = () => Math.random().toString(16).slice(2, 10);
    return `${part()}-${part()}-${part()}-${part()}`;
  }

  private getPagePath(): string {
    if (!this.isBrowser) return '';
    try {
      return `${window.location.pathname}${window.location.search}`;
    } catch {
      return '';
    }
  }

  private getReferrer(): string {
    if (!this.isBrowser) return '';
    try {
      return document.referrer || '';
    } catch {
      return '';
    }
  }

  private getApiBase(): string {
    try {
      return (document?.baseURI || '').replace(/\/$/, '') || window.location.origin;
    } catch {
      return '';
    }
  }

  private getSessionStorage(): Storage | null {
    if (!this.isBrowser) return null;
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  }

  initSessionDurationNoConsent(): void {
    if (!this.isBrowser) return;

    const key = 'simonsfpvjourney.sessionStart';
    const sentKey = 'simonsfpvjourney.sessionSent';
    try {
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, String(Date.now()));
      }
    } catch {}

    const send = () => {
      try {
        if (sessionStorage.getItem(sentKey)) return;
        // mark as sent preemptively to avoid races between multiple handlers
        try { sessionStorage.setItem(sentKey, '1'); } catch {}
      } catch {}
      try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return;
        const start = parseInt(raw, 10);
        if (!Number.isFinite(start)) return;
        const duration = Date.now() - start;
        if (!(duration > 0)) return;
        const sessionId = this.getOrCreateSessionId();
        if (!sessionId) return;

        const seconds = Math.round(duration / 1000);
        const enriched = {
          event_type: 'session-duration',
          session_id: sessionId,
          watch_seconds: seconds,
          page_path: this.getPagePath(),
        };

        const payload = JSON.stringify(enriched);
        const url = `${this.baseUrl}events/`;

        if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
          const blob = new Blob([payload], { type: 'application/json' });
          try { navigator.sendBeacon(url, blob); return; } catch {}
        }

        // fallback: keepalive fetch
        try { fetch(url, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' }, keepalive: true }); } catch {}
      } catch {}
    };

    if (typeof window !== 'undefined') {
      // only use pagehide to avoid duplicate handlers firing
      window.addEventListener('pagehide', send, { passive: true });
    }
  }
}
