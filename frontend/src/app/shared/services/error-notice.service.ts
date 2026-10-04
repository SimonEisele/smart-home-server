import { Injectable, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class ErrorNoticeService {
  readonly message = signal('');

  show(error: HttpErrorResponse): void {
    const detail = error.error?.detail || error.error?.error;
    this.message.set(error.status === 0
      ? 'Keine Verbindung zum Server. Bitte Verbindung prüfen und erneut versuchen.'
      : typeof detail === 'string' ? detail
      : error.status >= 500 ? 'Der Server konnte die Anfrage nicht verarbeiten. Bitte erneut versuchen.'
      : 'Die Anfrage konnte nicht abgeschlossen werden. Bitte Eingaben und Berechtigungen prüfen.');
  }

  dismiss(): void { this.message.set(''); }
}
