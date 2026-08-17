import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Category, Drone, Tag, Video, VideoFilter } from '../../models/video.model';
import { VideoService } from '../../services/video.service';
import { MetaService } from '../../services/meta.service';
import { AnalyticsService } from '../../services/analytics.service';
import { FormsModule } from '@angular/forms';
import { Videomodal } from '../../popups/videomodal/videomodal';
import { RouterModule } from '@angular/router';
import { CustomSelect, CustomSelectOption } from '../../components/custom-select/custom-select';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-videos',
  standalone: true,
  imports: [ CommonModule, FormsModule, Videomodal, RouterModule, CustomSelect, TranslateModule ],
  templateUrl: './videos.html',
  styleUrl: './videos.css',
})
export class Videos {
  private readonly advancedFiltersStorageKey = 'simonsfpvjourney.videos.showAdvancedFilters';
  videos$!: Observable<Video[]>;
  loading$;
  videosSnapshot: Video[] = [];
  visibleVideosSnapshot: Video[] = [];
  selectedVideo$ = new BehaviorSubject<Video | null>(null);

  facetCounts: {
    categories: Partial<Record<string, number>>;
    tags: Partial<Record<number, number>>;
    drones: Partial<Record<string, number>>;
    seasons: Partial<Record<string, number>>;
    times: Partial<Record<string, number>>;
    weathers: Partial<Record<string, number>>;
    countries: Partial<Record<string, number>>;
  } = {
    categories: {},
    tags: {},
    drones: {},
    seasons: {},
    times: {},
    weathers: {},
    countries: {},
  };

  categories: Category[] = [];
  tags: Tag[] = [];
  drones: Drone[] = [];

  filter: VideoFilter = { order_by: 'views_current', order_dir: 'desc' };
  searchText: string = '';
  selectedTagToAdd: number | null = null;
  showAdvancedFilters = false;
  availableCountries: string[] = [];
  showSuggestions = false;
  currentLanguage = '';
  private modalStartTs?: number;
  private modalVideo?: Video;

  get categoryOptions(): CustomSelectOption<string>[] {
    const allCount = this.facetCounts.categories['__all__'] ?? this.videosSnapshot.length;
    const options: CustomSelectOption<string>[] = [
      { value: '', label: this.translate.instant('filters.allWithCount', { count: allCount }) },
    ];
    for (const category of this.categories) {
      const count = this.facetCounts.categories[category.id] ?? category.video_count;
      if ((count ?? 0) > 0) {
        options.push({ value: category.id, label: `${category.name} (${count})` });
      }
    }
    return options;
  }

  get tagAddOptions(): CustomSelectOption<number | null>[] {
    const options: CustomSelectOption<number | null>[] = [
      { value: null, label: this.translate.instant('filters.selectTag') },
    ];
    for (const tag of this.tags) {
      const count = this.facetCounts.tags[tag.id] ?? tag.video_count;
      if ((count ?? 0) > 0 && !(this.filter.tags?.includes(tag.id))) {
        options.push({ value: tag.id, label: `${tag.name} (${count})` });
      }
    }
    return options;
  }

  get seasonSelectOptions(): CustomSelectOption<string>[] {
    const allCount = this.facetCounts.seasons['__all__'] ?? this.videosSnapshot.length;
    const options: CustomSelectOption<string>[] = [
      { value: '', label: this.translate.instant('filters.allWithCount', { count: allCount }) },
    ];
    for (const season of this.getSeasonOptions()) {
      options.push({ value: season.value, label: `${season.label} (${season.count})` });
    }
    return options;
  }

  get weatherSelectOptions(): CustomSelectOption<string>[] {
    const allCount = this.facetCounts.weathers['__all__'] ?? this.videosSnapshot.length;
    const options: CustomSelectOption<string>[] = [
      { value: '', label: this.translate.instant('filters.allWithCount', { count: allCount }) },
    ];
    for (const weather of this.getWeatherOptions()) {
      options.push({ value: weather.value, label: `${weather.label} (${weather.count})` });
    }
    return options;
  }

  get countryOptions(): CustomSelectOption<string | null>[] {
    const allCount = this.facetCounts.countries['__all__'] ?? this.videosSnapshot.length;
    const options: CustomSelectOption<string | null>[] = [
      { value: null, label: this.translate.instant('filters.allWithCount', { count: allCount }) },
    ];
    for (const c of this.availableCountries) {
      options.push({ value: c, label: `${c} (${this.facetCounts.countries[c] ?? 0})` });
    }
    return options;
  }

  get droneOptions(): CustomSelectOption<string>[] {
    const allCount = this.facetCounts.drones['__all__'] ?? this.videosSnapshot.length;
    const options: CustomSelectOption<string>[] = [
      { value: '', label: this.translate.instant('filters.allWithCount', { count: allCount }) },
    ];
    for (const drone of this.drones) {
      const count = this.facetCounts.drones[drone.id] ?? 0;
      if (count > 0) {
        options.push({ value: drone.id, label: `${drone.name} (${count})` });
      }
    }
    return options;
  }

  get timeSelectOptions(): CustomSelectOption<string>[] {
    const allCount = this.facetCounts.times['__all__'] ?? this.videosSnapshot.length;
    const options: CustomSelectOption<string>[] = [
      { value: '', label: this.translate.instant('filters.allWithCount', { count: allCount }) },
    ];
    for (const time of this.getTimeOptions()) {
      options.push({ value: time.value, label: `${time.label} (${time.count})` });
    }
    return options;
  }

  get sortByOptions(): CustomSelectOption<VideoFilter['order_by']>[] {
    return [
      { value: undefined, label: this.translate.instant('filters.sort.none') },
      { value: 'date_recorded', label: this.translate.instant('filters.sort.date') },
      { value: 'altitude', label: this.translate.instant('filters.sort.altitude') },
      { value: 'likes_current', label: this.translate.instant('filters.sort.likes') },
      { value: 'views_current', label: this.translate.instant('filters.sort.views') },
    ];
  }

  get orderDirOptions(): CustomSelectOption<'desc' | 'asc'>[] {
    return [
      { value: 'desc', label: this.translate.instant('filters.order.desc') },
      { value: 'asc', label: this.translate.instant('filters.order.asc') },
    ];
  }

  setOrderBy(value: VideoFilter['order_by'] | null | undefined): void {
    this.filter.order_by = value ?? undefined;
    this.applyFilter();
  }

  setOrderDir(value: 'desc' | 'asc' | null | undefined): void {
    this.filter.order_dir = value ?? 'desc';
    this.applyFilter();
  }

  private readonly seasonOptionDefs = [
    { value: 'Spring', key: 'filters.season.spring' },
    { value: 'Summer', key: 'filters.season.summer' },
    { value: 'Autumn', key: 'filters.season.autumn' },
    { value: 'Winter', key: 'filters.season.winter' },
  ];

  private readonly weatherOptionDefs = [
    { value: 'Sunny', key: 'filters.weather.sunny' },
    { value: 'Cloudy', key: 'filters.weather.cloudy' },
    { value: 'Rainy', key: 'filters.weather.rainy' },
    { value: 'Snowy', key: 'filters.weather.snowy' },
    { value: 'Foggy', key: 'filters.weather.foggy' },
  ];

  private readonly timeOptionDefs = [
    { value: 'Morning', key: 'filters.time.morning' },
    { value: 'Afternoon', key: 'filters.time.afternoon' },
    { value: 'Evening', key: 'filters.time.evening' },
    { value: 'Night', key: 'filters.time.night' },
    { value: 'Sunrise', key: 'filters.time.sunrise' },
    { value: 'Golden Hour', key: 'filters.time.goldenHour' },
    { value: 'Sunset', key: 'filters.time.sunset' },
  ];

  // Search suggestions dropdown
  getSuggestions(): Array<{ label: string; count: number; type: 'video' | 'category' | 'tag'; typeKey: string; value: string | number }> {
    const q = (this.searchText || '').trim().toLowerCase();
    const max = 12;
    const suggestions: Array<{ label: string; count: number; type: 'video' | 'category' | 'tag'; typeKey: string; value: string | number }> = [];

    for (const video of this.videosSnapshot) {
      if (!video?.title) continue;
      const label = video.title.trim();
      if (!label) continue;
      if (q && !label.toLowerCase().includes(q)) continue;
      suggestions.push({ label, count: 1, type: 'video', typeKey: 'suggestion.type.video', value: label });
    }

    for (const category of this.categories) {
      const label = category.name.trim();
      if (!label) continue;
      if (q && !label.toLowerCase().includes(q)) continue;
      const count = this.facetCounts.categories?.[category.id] ?? 0;
      if (count <= 0) continue;
      suggestions.push({ label, count, type: 'category', typeKey: 'suggestion.type.category', value: category.id });
    }

    for (const tag of this.tags) {
      const label = tag.name.trim();
      if (!label) continue;
      if (q && !label.toLowerCase().includes(q)) continue;
      const count = this.facetCounts.tags?.[tag.id] ?? 0;
      if (count <= 0) continue;
      suggestions.push({ label, count, type: 'tag', typeKey: 'suggestion.type.tag', value: tag.id });
    }

    const seen = new Set<string>();
    return suggestions
      .filter(item => item.count > 0)
      .filter(item => {
        const key = `${item.type}:${item.label}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type) || a.label.localeCompare(b.label))
      .slice(0, max);
  }

  selectSuggestion(s: { label: string; count: number; type: 'video' | 'category' | 'tag'; typeKey: string; value: string | number }): void {
    this.searchText = s.label;

    if (s.type === 'category') {
      this.filter.category = String(s.value);
    } else if (s.type === 'tag') {
      const tagId = Number(s.value);
      const tags = new Set<number>(this.filter.tags ?? []);
      tags.add(tagId);
      this.filter.tags = Array.from(tags);
    }

    this.applyFilter();
    this.showSuggestions = false;
  }

  constructor(
    private videoService: VideoService,
    private metaService: MetaService,
    private analytics: AnalyticsService,
    private translate: TranslateService,
    private languageService: LanguageService,
    private cdr: ChangeDetectorRef
  ) {
    this.loading$ = this.videoService.loading$;
    this.currentLanguage = this.languageService.currentLanguage;
    this.languageService.language$.subscribe(lang => {
      this.currentLanguage = lang;
      this.cdr.detectChanges();
    });
  }

  ngOnInit(): void {
    const savedFilter = this.videoService.getCurrentFilter();
    if (savedFilter) {
      this.filter = { order_by: 'views_current', order_dir: 'desc', ...savedFilter };
      this.searchText = savedFilter.search ?? '';
    }
    this.showAdvancedFilters = this.loadSavedAdvancedFiltersState();

    // Load Categories, Tags, Drones
    this.metaService.getCategories().subscribe(c => this.categories = c);
    this.metaService.getTags().subscribe(t => this.tags = t);
    this.metaService.getDrones().subscribe(d => this.drones = d);

    // Videos laden
    this.videoService.loadVideos();

    // Set current filter (restored from localStorage or defaults)
    this.applyFilter();

    // Observable für die Liste
    this.videos$ = this.videoService.filteredVideos$;
    this.videoService.filteredVideos$.subscribe(v => {
      this.visibleVideosSnapshot = v || [];
    });

    // Snapshot für Autocomplete
    this.videoService.videos$.subscribe(videos => {
      this.videosSnapshot = videos;
    });

    // Faceted counts
    this.videoService.facetCounts$.subscribe(c => {
      this.facetCounts = c ?? {
        categories: {},
        tags: {},
        drones: {},
        seasons: {},
        times: {},
        weathers: {},
        countries: {},
      };
      // Build available countries list with count > 0
      const countries = this.facetCounts.countries || {};
      this.availableCountries = Object.keys(countries).filter(k => k && k !== '__all__' && (countries[k] ?? 0) > 0);
    });
  }
  toggleAdvanced(): void {
    this.showAdvancedFilters = !this.showAdvancedFilters;
    this.saveAdvancedFiltersState(this.showAdvancedFilters);
  }

  getSeasonOptions(): Array<{ value: string; label: string; count: number }> {
    return this.seasonOptionDefs
      .map(option => ({
        ...option,
        label: this.translate.instant(option.key),
        count: this.facetCounts.seasons?.[option.value] ?? 0,
      }))
      .filter(option => option.count > 0);
  }

  getWeatherOptions(): Array<{ value: string; label: string; count: number }> {
    return this.weatherOptionDefs
      .map(option => ({
        ...option,
        label: this.translate.instant(option.key),
        count: this.facetCounts.weathers?.[option.value] ?? 0,
      }))
      .filter(option => option.count > 0);
  }

  getTimeOptions(): Array<{ value: string; label: string; count: number }> {
    return this.timeOptionDefs
      .map(option => ({
        ...option,
        label: this.translate.instant(option.key),
        count: this.facetCounts.times?.[option.value] ?? 0,
      }))
      .filter(option => option.count > 0);
  }

  /** Filter anwenden */
  applyFilter(): void {
    this.videoService.setFilter({
      ...this.filter,
      search: this.searchText?.trim() || undefined
    });
  }

  onSearchInput(): void {
    this.showSuggestions = !!this.searchText && this.searchText.trim().length > 0;
    this.applyFilter();
  }

  /** Filter zurücksetzen */
  resetFilter(): void {
    this.filter = { order_by: 'views_current', order_dir: 'desc' };
    this.searchText = '';
    this.videoService.setFilter(null);
  }

  /** Video anklicken */
  onClick(video: Video): void {
    this.openVideo(video, 'videos');
  }

  getIndex(v: Video): number {
    return this.visibleVideosSnapshot.findIndex(x => x.id === v.id);
  }
  canPrev(v: Video): boolean {
    return this.getIndex(v) > 0;
  }
  canNext(v: Video): boolean {
    const i = this.getIndex(v);
    return i >= 0 && i < this.visibleVideosSnapshot.length - 1;
  }
  goPrev(v: Video): void {
    const i = this.getIndex(v);
    if (i > 0) this.openVideo(this.visibleVideosSnapshot[i - 1], 'videos');
  }
  goNext(v: Video): void {
    const i = this.getIndex(v);
    if (i >= 0 && i < this.visibleVideosSnapshot.length - 1) this.openVideo(this.visibleVideosSnapshot[i + 1], 'videos');
  }

  onModalClosed(): void {
    this.finishVideoSession('close');
    this.selectedVideo$.next(null);
  }

  /** Tag-Card entfernen */
  removeTag(tagId: number): void {
    const tags = new Set<number>(this.filter.tags ?? []);
    tags.delete(tagId);
    this.filter.tags = Array.from(tags);
    this.applyFilter();
  }

  getTagName(tagId: number): string {
    return this.tags.find(t => t.id === tagId)?.name ?? String(tagId);
  }

  /** Tag aus Liste hinzufügen */
  addTag(): void {
    const tagId = this.selectedTagToAdd;
    if (tagId == null) return;
    const tags = new Set<number>(this.filter.tags ?? []);
    tags.add(tagId);
    this.filter.tags = Array.from(tags);
    this.selectedTagToAdd = null;
    this.applyFilter();
  }

  onFilterChange(): void {
    this.applyFilter();
  }

  private loadSavedAdvancedFiltersState(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      return localStorage.getItem(this.advancedFiltersStorageKey) === 'true';
    } catch {
      return false;
    }
  }

  private saveAdvancedFiltersState(isOpen: boolean): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.advancedFiltersStorageKey, String(isOpen));
    } catch {}
  }

  private openVideo(video: Video, source: string): void {
    this.finishVideoSession('switch');
    this.modalVideo = video;
    this.modalStartTs = Date.now();
    this.analytics.trackVideoPlay(video.id, { source });
    this.selectedVideo$.next(video);
  }

  private finishVideoSession(reason: 'close' | 'switch'): void {
    if (!this.modalVideo || !this.modalStartTs) return;
    const watchSeconds = Math.max(1, Math.round((Date.now() - this.modalStartTs) / 1000));
    const duration = this.modalVideo.duration ?? 0;
    this.analytics.trackPopupDuration('video', watchSeconds, { video_id: this.modalVideo.id, source: 'videos', reason });
    if (duration && watchSeconds >= Math.max(10, Math.floor(duration * 0.9))) {
      this.analytics.trackVideoComplete(this.modalVideo.id, watchSeconds, { source: 'videos', reason });
    }
    this.modalVideo = undefined;
    this.modalStartTs = undefined;
  }
}
