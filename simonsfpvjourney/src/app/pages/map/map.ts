import {
  AfterViewInit,
  Component,
  HostListener,
  Inject,
  NgZone,
  OnInit,
  PLATFORM_ID,
  ViewChild,
  ElementRef
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { VideoService } from '../../services/video.service';
import { MapService } from '../../services/map.service';
import { Category, Tag, Video } from '../../models/video.model';
import { Videomodal } from '../../popups/videomodal/videomodal';
import { FeedbackModal } from '../../popups/feedbackmodal/feedback-modal';
import { AnalyticsService } from '../../services/analytics.service';
import { BehaviorSubject } from 'rxjs';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [ CommonModule, Videomodal, FeedbackModal, TranslateModule ],
  templateUrl: './map.html',
  styleUrl: './map.css',
})
export class Map implements OnInit, AfterViewInit {
  @ViewChild('mapContainer') mapContainer?: ElementRef<HTMLDivElement>;

  categories: Category[] = [];
  tags: Tag[] = [];
  videos: Video[] = [];
  selectedVideo$ = new BehaviorSubject<Video | null>(null);
  popupVideo$ = new BehaviorSubject<Video | null>(null);
  isFeedbackOpen = false;
  private pendingCenter?: { lat: number; lon: number; zoom: number };
  private modalStartTs?: number;
  private modalVideo?: Video;
  private popupStartTs?: number;
  private popupVideo?: Video;
  // Track current popup for overlay/keyboard navigation

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private mapService: MapService,
    private videoService: VideoService,
    private zone: NgZone,
    private route: ActivatedRoute,
    private router: Router,
    private analytics: AnalyticsService
  ) {
    videoService.loadVideos();
  }

  ngOnInit(): void {
    this.videoService.filteredVideos$.subscribe(v => {
      this.videos = v;
      this.mapService.syncMarkers(v);

      // If we have pending center and map is ready, apply it now
      if (this.pendingCenter && this.mapService.map) {
        this.mapService.map.setView([this.pendingCenter.lat, this.pendingCenter.lon], this.pendingCenter.zoom);
        this.pendingCenter = undefined;
      }
      // If a popup is pending, try to open it and select the video
      // No automatic popup opening; only center/zoom based on query params
    });
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // On iOS Safari, set an explicit pixel height for the map container
    // based on window.innerHeight to avoid viewport chrome issues
    if (this.isIOSafari()) {
      this.updateIOSContainerHeight();
    }

    // Defer map init to next frames to ensure layout is stable on iOS
    try { if (this.mapContainer?.nativeElement) this.mapContainer.nativeElement.style.visibility = 'hidden'; } catch {}

    this.mapService.onVideoClick = video => {
      this.zone.run(() => {
        this.openVideo(video);
        // Ensure map focuses marker and disable keyboard while modal open
        this.mapService.focusVideo(video);
        this.mapService.disableKeyboard();
      });
    };

    // Track popup open/close to show map overlay arrows
    this.mapService.onPopupOpen = video => {
      this.zone.run(() => {
        this.finishPopupDuration('switch');
        this.popupStartTs = Date.now();
        this.popupVideo = video;
        this.popupVideo$.next(video);
        this.analytics.trackMapClick(video.id, { source: 'map' });
      });
    };
    this.mapService.onPopupClose = () => {
      this.zone.run(() => {
        this.finishPopupDuration('close');
        this.popupVideo$.next(null);
      });
    };

    this.mapService.loadLeaflet().then(L => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.mapService.initMap('map', L);
          // Ensure Leaflet computes correct size after initial render
          setTimeout(() => { try { this.mapService.map?.invalidateSize?.(); } catch {} }, 100);
          // iOS Safari often needs a few extra invalidations while UI chrome settles
          if (this.isIOSafari()) {
            this.pokeMapSize(6, 200);
          }
          this.mapService.syncMarkers(this.videos);
          // Reveal map after initial invalidations
          setTimeout(() => { try { if (this.mapContainer?.nativeElement) this.mapContainer.nativeElement.style.visibility = 'visible'; } catch {} }, 150);
        });
      });

      // Read query params for centering and popup
      const qp = this.route.snapshot.queryParamMap;
      const lat = qp.get('lat');
      const lon = qp.get('lon');
      const zoom = qp.get('zoom');

      if (lat && lon) {
        const z = zoom ? Number(zoom) : 13;
        const latN = Number(lat);
        const lonN = Number(lon);
        if (!Number.isNaN(latN) && !Number.isNaN(lonN)) {
          // If map is ready, set now; otherwise store for later
          if (this.mapService.map) {
            this.mapService.map.setView([latN, lonN], z);
          } else {
            this.pendingCenter = { lat: latN, lon: lonN, zoom: z };
          }
        }
      }
      // Do not open popup automatically; the user only requested centering/zoom
    });
    // Re-invalidate size on route stabilization (helps when navigating away/back)
    this.router.events.subscribe(ev => {
      if (ev instanceof NavigationEnd) {
        try { this.mapService.map?.invalidateSize?.(); } catch {}
        if (this.isIOSafari()) {
          this.pokeMapSize(4, 150);
        }
        try { if (this.mapContainer?.nativeElement) this.mapContainer.nativeElement.style.visibility = 'visible'; } catch {}
      }
    });
  }

  // Keep map sized correctly on viewport changes (mobile rotations / URL bar changes)
  @HostListener('window:resize')
  onResize() {
    if (this.isIOSafari()) this.updateIOSContainerHeight();
    try { this.mapService.map?.invalidateSize?.(); } catch {}
  }

  // Revalidate size when returning to the page after reload
  @HostListener('window:pageshow', ['$event'])
  onPageShow(e: any) {
    // If coming from bfcache (persisted), Safari needs revalidation
    if (this.isIOSafari()) this.updateIOSContainerHeight();
    try { this.mapService.map?.invalidateSize?.(); } catch {}
    if (e && e.persisted && this.isIOSafari()) {
      this.pokeMapSize(6, 200);
    }
    try { if (this.mapContainer?.nativeElement) this.mapContainer.nativeElement.style.visibility = 'visible'; } catch {}
  }

  // Revalidate when tab becomes visible
  @HostListener('document:visibilitychange')
  onVisibilityChange() {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      if (this.isIOSafari()) this.updateIOSContainerHeight();
      try { this.mapService.map?.invalidateSize?.(); } catch {}
    }
  }

  // Revalidate on orientation change (mobile)
  @HostListener('window:orientationchange')
  onOrientationChange() {
    if (this.isIOSafari()) this.updateIOSContainerHeight();
    try { this.mapService.map?.invalidateSize?.(); } catch {}
    if (this.isIOSafari()) {
      this.pokeMapSize(4, 150);
    }
  }

  // Revalidate when the window regains focus (iOS Safari sometimes hides map until focus)
  @HostListener('window:focus')
  onFocus() {
    try { this.mapService.map?.invalidateSize?.(); } catch {}
  }

  // No extra heartbeat/observers; keep init simple and rely on resize

  // Keyboard navigation: switch map popups with Left/Right arrows
  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent) {
    // Do nothing if a video modal or feedback modal is open
    if (this.selectedVideo$.getValue() !== null || this.isFeedbackOpen) return;

    const current = this.popupVideo$.getValue();
    if (!current) return;

    if (e.key === 'ArrowLeft' && this.canPrev(current)) {
      e.preventDefault();
      e.stopPropagation();
      this.goPrevPopup(current);
    } else if (e.key === 'ArrowRight' && this.canNext(current)) {
      e.preventDefault();
      e.stopPropagation();
      this.goNextPopup(current);
    } else if (e.key === 'Enter') {
      // Open the video modal for the current popup
      e.preventDefault();
      e.stopPropagation();
      this.zone.run(() => {
        this.openVideo(current);
        this.mapService.focusVideo(current);
        this.mapService.disableKeyboard();
      });
    }
  }

  // Minimal user agent check for iOS Safari
  private isIOSafari(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua);
    const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
    return isIOS && isSafari;
  }

  // Briefly re-invalidate Leaflet size a few times (used for iOS Safari stabilization)
  private pokeMapSize(times = 6, delay = 200): void {
    let count = 0;
    const tick = () => {
      try { this.mapService.map?.invalidateSize?.(); } catch {}
      count++;
      if (count < times) {
        setTimeout(tick, delay);
      }
    };
    tick();
  }

  private updateIOSContainerHeight(): void {
    try {
      const nav = 72; // fixed navbar height
      const h = Math.max(0, Math.floor(window.innerHeight - nav));
      if (this.mapContainer?.nativeElement) {
        this.mapContainer.nativeElement.style.height = `${h}px`;
        this.mapContainer.nativeElement.style.width = '100%';
      }
    } catch {}
  }

  private openVideo(video: Video): void {
    this.finishVideoSession('switch');
    this.modalVideo = video;
    this.modalStartTs = Date.now();
    this.analytics.trackVideoPlay(video.id, { source: 'map' });
    this.selectedVideo$.next(video);
  }

  private finishVideoSession(reason: 'close' | 'switch'): void {
    if (!this.modalVideo || !this.modalStartTs) return;
    const watchSeconds = Math.max(1, Math.round((Date.now() - this.modalStartTs) / 1000));
    const duration = this.modalVideo.duration ?? 0;
    this.analytics.trackPopupDuration('video', watchSeconds, { video_id: this.modalVideo.id, reason });
    if (duration && watchSeconds >= Math.max(10, Math.floor(duration * 0.9))) {
      this.analytics.trackVideoComplete(this.modalVideo.id, watchSeconds, { source: 'map', reason });
    }
    this.modalVideo = undefined;
    this.modalStartTs = undefined;
  }

  private finishPopupDuration(reason: 'close' | 'switch'): void {
    if (!this.popupVideo || !this.popupStartTs) return;
    const seconds = Math.max(1, Math.round((Date.now() - this.popupStartTs) / 1000));
    this.analytics.trackPopupDuration('map', seconds, { video_id: this.popupVideo.id, reason });
    this.popupVideo = undefined;
    this.popupStartTs = undefined;
  }

  onModalClosed(v: Video): void {
    // Re-enable map keyboard and keep map centered on the last video
    this.mapService.enableKeyboard();
    if (v) this.mapService.focusVideo(v);
    this.selectedVideo$.next(null);
    this.finishVideoSession('close');
  }

  getIndex(v: Video): number {
    return this.videos.findIndex(x => x.id === v.id);
  }
  canPrev(v: Video): boolean {
    return this.getIndex(v) > 0;
  }
  canNext(v: Video): boolean {
    const i = this.getIndex(v);
    return i >= 0 && i < this.videos.length - 1;
  }
  goPrev(v: Video): void {
    const i = this.getIndex(v);
    if (i > 0) {
      const nextV = this.videos[i - 1];
      this.openVideo(nextV);
      this.mapService.focusVideo(nextV);
    }
  }
  goNext(v: Video): void {
    const i = this.getIndex(v);
    if (i >= 0 && i < this.videos.length - 1) {
      const nextV = this.videos[i + 1];
      this.openVideo(nextV);
      this.mapService.focusVideo(nextV);
    }
  }

  // Map overlay navigation should only move the popup/center, not open the modal
  goPrevPopup(v: Video): void {
    const i = this.getIndex(v);
    if (i > 0) {
      const prevV = this.videos[i - 1];
      this.mapService.focusVideo(prevV);
    }
  }
  goNextPopup(v: Video): void {
    const i = this.getIndex(v);
    if (i >= 0 && i < this.videos.length - 1) {
      const nextV = this.videos[i + 1];
      this.mapService.focusVideo(nextV);
    }
  }

  // Removed delayed init and observers to match previously working behavior
}
