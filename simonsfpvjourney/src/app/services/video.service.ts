import { HttpClient, HttpHeaders } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Category, Drone, Tag, Video, VideoFilter, VideoStats } from "../models/video.model";
import { BehaviorSubject, combineLatest, finalize, map, shareReplay } from "rxjs";

@Injectable({ providedIn: 'root' })
export class VideoService {
  private readonly filterStorageKey = 'simonsfpvjourney.videoFilter';
  private videosSubject = new BehaviorSubject<Video[]>([]);
  private filterSubject = new BehaviorSubject<VideoFilter | null>(this.loadSavedFilter());
  private loadingSubject = new BehaviorSubject<boolean>(false);

  readonly videos$ = this.videosSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();
  readonly filteredVideos$ = combineLatest([
    this.videos$,
    this.filterSubject
  ]).pipe(
    map(([videos, filter]) => this.applySort(this.applyFilter(videos, filter), filter)),
    shareReplay(1)
  );

  /** Faceted counts for filter options based on current filter state */
  readonly facetCounts$ = combineLatest([
    this.videos$,
    this.filterSubject
  ]).pipe(
    map(([videos, filter]) => this.computeFacetCounts(videos, filter)),
    shareReplay(1)
  );

  constructor(private http: HttpClient) {}

  getCurrentFilter(): VideoFilter | null {
    return this.filterSubject.value;
  }

  loadVideos(filter?: VideoFilter) {
    this.loadingSubject.next(true);
    this.http
      .get<Video[]>('/api/videos/', { params: filter as any })
      .pipe(
        map(videos => videos.map(v => ({
          ...v,
          // Normalize thumbnails so mobile devices don’t try to fetch from localhost
          thumbnail: this.toRelativeMedia(v.thumbnail),
          // Normalize nested picture image URLs if present
          pictures: (v.pictures ?? []).map(p => ({
            ...p,
            image: this.toRelativeMedia(p.image)
          }))
        }))),
        finalize(() => this.loadingSubject.next(false))
      )
      .subscribe(videos => this.videosSubject.next(videos));
  }

  setFilter(filter: VideoFilter | null) {
    this.saveFilter(filter);
    this.filterSubject.next(filter);
  }

  private loadSavedFilter(): VideoFilter | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(this.filterStorageKey);
      if (!raw) return null;
      return JSON.parse(raw) as VideoFilter;
    } catch {
      return null;
    }
  }

  private saveFilter(filter: VideoFilter | null): void {
    if (typeof localStorage === 'undefined') return;
    try {
      if (!filter) {
        localStorage.removeItem(this.filterStorageKey);
        return;
      }
      localStorage.setItem(this.filterStorageKey, JSON.stringify(filter));
    } catch {}
  }

  private applyFilter(videos: Video[], filter: VideoFilter | null): Video[] {
    if (!filter) return videos;

    const search = filter.search?.toLowerCase().trim();

    return videos.filter(v => {

      // Search
      if(search) {
        const haystack = [
          v.title,
          v.description,
          v.category?.name,
          v.drone?.name,
          ...v.tags?.map(t => t.name) ?? []
        ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

        if(!haystack.includes(search)) {
          return false;
        }
      }

      // Category
      if (filter.category && v.category.id !== filter.category) {
        return false;
      }

      // Tags: support OR (any) or AND (all) matching
      if (filter.tags?.length) {
        const mode = filter.tags_mode || 'or';
        if (mode === 'or') {
          if (!filter.tags.some(t => v.tags?.some(x => x.id === t))) return false;
        } else { // 'and'
          if (!filter.tags.every(t => v.tags?.some(x => x.id === t))) return false;
        }
      }

      // Drone
      if (filter.drone && v.drone?.id !== filter.drone) {
        return false;
      }

      // Season
      if (filter.season && v.season !== filter.season) {
        return false;
      }

      // Time of day
      if (filter.time_of_day && v.time_of_day !== filter.time_of_day) {
        return false;
      }

      // Weather
      if (filter.weather && v.weather !== filter.weather) {
        return false;
      }

      // Date range
      if (filter.date_recorded__gte && v.date_recorded && v.date_recorded < filter.date_recorded__gte) {
        return false;
      }
      if (filter.date_recorded__lte && v.date_recorded && v.date_recorded > filter.date_recorded__lte) {
        return false;
      }

      // Altitude range
      if (typeof filter.altitude__gte === 'number' && v.altitude < filter.altitude__gte) {
        return false;
      }
      if (typeof filter.altitude__lte === 'number' && v.altitude > filter.altitude__lte) {
        return false;
      }

      // Country (case-insensitive exact match)
      if (filter.country && v.country && v.country.toLowerCase() !== filter.country.toLowerCase()) {
        return false;
      }
      if (filter.country && !v.country) {
        return false;
      }
      return true;
    });
  }

  getVideo(id: string) {
    return this.http.get<Video>(`/api/videos/${id}/`);
  }

  getVideoStats(id: string) {
    return this.http.get<VideoStats[]>(`/api/videos/${id}/stats/`);
  }

  private computeFacetCounts(videos: Video[], filter: VideoFilter | null): {
    categories: Partial<Record<string, number>>;
    tags: Partial<Record<number, number>>;
    drones: Partial<Record<string, number>>;
    seasons: Partial<Record<string, number>>;
    times: Partial<Record<string, number>>;
    weathers: Partial<Record<string, number>>;
    countries: Partial<Record<string, number>>;
  } {
    const baseFilter = filter ?? {};

    const allCategories = Array.from(new Set(videos.map(v => v.category?.id).filter(Boolean))) as string[];
    const allTags = Array.from(new Set(videos.flatMap(v => v.tags?.map(t => t.id) ?? []))) as number[];
    const allDrones = Array.from(new Set(videos.map(v => v.drone?.id).filter(Boolean))) as string[];
    const allSeasons = Array.from(new Set(videos.map(v => v.season).filter(Boolean))) as string[];
    const allTimes = Array.from(new Set(videos.map(v => v.time_of_day).filter(Boolean))) as string[];
    const allWeathers = Array.from(new Set(videos.map(v => v.weather).filter(Boolean))) as string[];
    const allCountries = Array.from(new Set(videos.map(v => v.country).filter(Boolean))) as string[];

    const categories: Partial<Record<string, number>> = {};
    const tags: Partial<Record<number, number>> = {};
    const drones: Partial<Record<string, number>> = {};
    const seasons: Partial<Record<string, number>> = {};
    const times: Partial<Record<string, number>> = {};
    const weathers: Partial<Record<string, number>> = {};
    const countries: Partial<Record<string, number>> = {};

    // Helper: count videos matching a hypothetical filter
    const countFor = (hypo: VideoFilter | null) => this.applyFilter(videos, hypo).length;

    // Categories
    allCategories.forEach(catId => {
      categories[catId] = countFor({ ...baseFilter, category: catId });
    });
    // "Alle Kategorien"
    categories['__all__'] = countFor({ ...baseFilter, category: undefined });

    // Tags (adding the tag to current selection)
    allTags.forEach(tagId => {
      const current = new Set<number>(baseFilter.tags ?? []);
      current.add(tagId);
      tags[tagId] = countFor({ ...baseFilter, tags: Array.from(current) });
    });

    // Drones
    allDrones.forEach(droneId => {
      drones[droneId] = countFor({ ...baseFilter, drone: droneId });
    });
    drones['__all__'] = countFor({ ...baseFilter, drone: undefined });

    // Seasons
    allSeasons.forEach(s => {
      seasons[s] = countFor({ ...baseFilter, season: s });
    });
    seasons['__all__'] = countFor({ ...baseFilter, season: undefined });

    // Times of day
    allTimes.forEach(t => {
      times[t] = countFor({ ...baseFilter, time_of_day: t });
    });
    times['__all__'] = countFor({ ...baseFilter, time_of_day: undefined });

    // Weathers
    allWeathers.forEach(w => {
      weathers[w] = countFor({ ...baseFilter, weather: w });
    });

    // Countries
    allCountries.forEach(c => {
      countries[c] = countFor({ ...baseFilter, country: c });
    });
    countries['__all__'] = countFor({ ...baseFilter, country: undefined });
    weathers['__all__'] = countFor({ ...baseFilter, weather: undefined });

    return { categories, tags, drones, seasons, times, weathers, countries };
  }
  private applySort(videos: Video[], filter: VideoFilter | null): Video[] {
    if (!filter || !filter.order_by) return videos;
    const dir = filter.order_dir === 'asc' ? 1 : -1;
    const by = filter.order_by;
    const arr = [...videos];
    arr.sort((a, b) => {
      let av = 0;
      let bv = 0;
      if (by === 'altitude') {
        av = a.altitude ?? 0;
        bv = b.altitude ?? 0;
      } else if (by === 'date_recorded') {
        av = a.date_recorded ? Date.parse(a.date_recorded) : 0;
        bv = b.date_recorded ? Date.parse(b.date_recorded) : 0;
      } else if (by === 'likes_current') {
        av = a.likes_current ?? 0;
        bv = b.likes_current ?? 0;
      } else if (by === 'views_current') {
        av = a.views_current ?? 0;
        bv = b.views_current ?? 0;
      }
      if (av === bv) return 0;
      return av < bv ? -1 * dir : 1 * dir;
    });
    return arr;
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