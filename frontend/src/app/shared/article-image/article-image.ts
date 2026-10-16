import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-article-image',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="image-field">
      <span>Artikelbild <small>optional</small></span>
      <img *ngIf="value" [src]="value" alt="Vorschau des Artikelbilds" />
      <label class="upload">
        {{ processing ? 'Bild wird vorbereitet…' : value ? 'Bild ersetzen' : 'Bild hochladen' }}
        <input type="file" accept="image/*" aria-label="Artikelbild hochladen"
          [disabled]="disabled || processing" (change)="choose($event)" />
      </label>
      <button *ngIf="value" type="button" [disabled]="disabled || processing"
        (click)="valueChange.emit('')">Bild entfernen</button>
      <small>Foto aufnehmen oder aus der Galerie wählen. Das Bild wird automatisch verkleinert.</small>
      <span *ngIf="error" class="image-error" role="alert">{{ error }}</span>
    </div>
  `,
  styles: `
    :host { display:block; min-width:0; }
    .image-field { display:flex; flex-direction:column; align-items:flex-start; gap:10px; }
    small { color:var(--color-muted); font-size:.8rem; }
    img { width:96px; height:96px; object-fit:contain; border-radius:10px; background:var(--color-surface-soft); }
    .upload { display:flex; flex-direction:column; gap:8px; width:100%; }
    input { width:100%; min-width:0; max-width:100%; }
    input::file-selector-button, button { border:1px solid var(--color-card-border); border-radius:8px;
      background:var(--color-surface-soft); color:var(--color-text); padding:10px 12px; cursor:pointer; }
    .image-error { color:#ffaaa6; }
  `,
})
export class ArticleImage {
  @Input() value = '';
  @Input() disabled = false;
  @Output() valueChange = new EventEmitter<string>();
  @Output() processingChange = new EventEmitter<boolean>();
  processing = false;
  error = '';

  constructor(private cdr: ChangeDetectorRef) {}

  async choose(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || this.disabled || this.processing) return;
    this.error = '';
    this.processing = true;
    this.processingChange.emit(true);
    let url = '';
    try {
      if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
        throw new Error('Bitte ein Foto als JPEG, PNG oder WebP wählen.');
      }
      if (file.size > 20 * 1024 * 1024) throw new Error('Bitte ein Bild unter 20 MB wählen.');
      url = URL.createObjectURL(file);
      const image = new Image();
      image.src = url;
      await image.decode();
      const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Das Bild konnte nicht vorbereitet werden.');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let data = '';
      for (const quality of [.85, .7, .5]) {
        data = canvas.toDataURL('image/webp', quality);
        if (data.length <= 650_000) break;
      }
      if (data.length > 650_000) throw new Error('Bitte ein kleineres oder einfacheres Bild wählen.');
      this.valueChange.emit(data);
    } catch (error) {
      this.error = error instanceof Error && error.name !== 'EncodingError'
        ? error.message : 'Dieses Bildformat konnte nicht gelesen werden. Bitte JPEG, PNG oder WebP wählen.';
    } finally {
      if (url) URL.revokeObjectURL(url);
      input.value = '';
      this.processing = false;
      this.processingChange.emit(false);
      this.cdr.markForCheck();
    }
  }
}
