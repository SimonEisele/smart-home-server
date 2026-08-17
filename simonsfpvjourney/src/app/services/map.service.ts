import { ApplicationRef, createComponent, Injectable, NgZone } from '@angular/core';
import { Video } from '../models/video.model';
import { Videopopup } from '../popups/videopopup/videopopup';

@Injectable({ providedIn: 'root' })
export class MapService {
  L!: any;
  map!: any;
  markers = new Map<string, any>();
  markersLayer!: any;
  baseLayers: Record<string, any> = {};
  mapInitialized = false;

  onPopupOpen?: (video: Video) => void;
  onPopupClose?: () => void;
  onVideoClick?: (video: Video) => void;

  constructor(
    private appRef: ApplicationRef,
    private zone: NgZone
  ) {}

  // Minimal user agent check for iOS Safari
  private isIOSafari(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua);
    const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
    return isIOS && isSafari;
  }

  /** Load Leaflet dynamically */
  async loadLeaflet() {
    if (!this.L) {
      const leafletModule = await import('leaflet');
      // Depending on bundling mode, Leaflet can be exposed as default export or module namespace.
      this.L = (leafletModule as any)?.default ?? leafletModule;
    }
    return this.L;
  }

  /**
   * Initialize the map only when the container is visible
   */
  initMap(containerId: string, L: any) {
    const container = document.getElementById(containerId)!;
    if (!this.map) {
      const ios = this.isIOSafari();
      this.map = L.map(containerId, {
        center: [46.8182, 8.2275],
        zoom: 5,
        zoomAnimation: !ios,
        fadeAnimation: !ios,
        inertia: !ios,
        // Use integer zoom levels on laptop trackpads so each gesture step is meaningful.
        zoomSnap: 1,
        // Keep wheel zoom controlled: touch stays responsive, mouse wheel is less jumpy.
        wheelPxPerZoomLevel: ios ? 80 : 45,
        wheelDebounceTime: ios ? 40 : 24,
        zoomDelta: 1,
      });

      // Base layers
      const commonTileOpts = { updateWhenZooming: true, keepBuffer: 2 };
      const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        ...commonTileOpts,
      });
      const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)',
        ...commonTileOpts,
      });
      const satellite = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/' +
        'World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles © Esri',
          ...commonTileOpts,
        }
      );

      const labels = L.tileLayer(
        'https://services.arcgisonline.com/ArcGIS/rest/services/' +
        'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Labels © Esri',
          pane: 'overlayPane',
          ...commonTileOpts,
        }
      );

      const hybrid = L.layerGroup([satellite, labels]);

      this.baseLayers = { 'Standard': osm, 'Topo': topo, 'Satellite': hybrid };

      // Choose initial base layer. If user has previously selected a base layer, restore it.
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem('map.base') : null;
      const initialBase = stored && this.baseLayers[stored] ? stored : 'Satellite';
      // Add initial base, or the hybrid satellite + labels layer by default
      this.baseLayers[initialBase].addTo(this.map);

      // Marker overlay
      this.markersLayer = L.layerGroup().addTo(this.map);

      // Layers control (only base layers).
      L.control.layers(this.baseLayers, undefined, { collapsed: true, position: 'topright' }).addTo(this.map);

      // Persist base layer selection.
      try {
        this.map.on('baselayerchange', (e: any) => {
          try { if (typeof window !== 'undefined') window.localStorage.setItem('map.base', e.name); } catch {}
        });
      } catch {}

      // Invalidate when ready/tile-loaded
      try { this.map.whenReady(() => { try { this.map.invalidateSize(); } catch {} }); } catch {}
      try { osm.on('load', () => { try { this.map.invalidateSize(); } catch {} }); } catch {}
    } else {
      // SPA / reattach container
      container.appendChild(this.map.getContainer());
      setTimeout(() => { try { this.map.invalidateSize(); } catch {} }, 50);
      setTimeout(() => { try { this.map.invalidateSize(); } catch {} }, 100);
    }

    return this.map;
  }

  /**
   * Sync markers with the video list
   */
  syncMarkers(videos: Video[]) {
    if (!this.map || !this.L) return;
    const L = this.L;
    const visibleIds = new Set(videos.map(v => v.id.toString()));

    // Remove old markers
    this.markers.forEach((marker, id) => {
      if (!visibleIds.has(id)) {
        marker.remove();
        this.markers.delete(id);
      }
    });

    // Add new markers
    videos.forEach((video, idx) => {
      const key = video.id.toString();
      if (this.markers.has(key)) return;

      const marker = L.marker([video.latitude, video.longitude], {
        icon: L.icon({
          iconUrl: 'assets/map-marker.svg',
          iconSize: [32, 32],
          iconAnchor: [16, 32],
          popupAnchor: [0, -32]
        })
      }).addTo(this.markersLayer);

      // Create popup component
      const container = document.createElement('div');
      const componentRef = createComponent(Videopopup, { environmentInjector: this.appRef.injector });
      componentRef.setInput('video', video);

      const prevVideo = idx > 0 ? videos[idx - 1] : undefined;
      const nextVideo = idx < videos.length - 1 ? videos[idx + 1] : undefined;
      componentRef.setInput('canPrev', !!prevVideo);
      componentRef.setInput('canNext', !!nextVideo);

      componentRef.instance.playVideo.subscribe(v => this.zone.run(() => this.onVideoClick?.(v)));
      componentRef.instance.prev.subscribe(() => prevVideo && this.zone.run(() => this.focusVideo(prevVideo)));
      componentRef.instance.next.subscribe(() => nextVideo && this.zone.run(() => this.focusVideo(nextVideo)));

      this.appRef.attachView(componentRef.hostView);
      container.appendChild((componentRef.hostView as any).rootNodes[0]);

      marker.bindPopup(container, { className: 'leaflet-video-popup' });
      marker.on('popupopen', () => this.zone.run(() => this.onPopupOpen?.(video)));
      marker.on('popupclose', () => this.zone.run(() => this.onPopupClose?.()));

      this.markers.set(key, marker);
    });
  }

  /**
   * Focus a video marker
   */
  focusVideo(video: Video) {
    if (!this.map || !video) return;
    const zoom = this.map.getZoom?.() ?? 13;
    try { this.map.setView([video.latitude, video.longitude], zoom); } catch {}
    const marker = this.markers.get(video.id.toString());
    if (marker && marker.openPopup) {
      try { marker.openPopup(); } catch {}
    }
  }

  disableKeyboard() { try { this.map?.keyboard?.disable?.(); } catch {} }
  enableKeyboard() { try { this.map?.keyboard?.enable?.(); } catch {} }
}
