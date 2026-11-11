import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ProposalType = 'recipe' | 'event' | 'todo' | 'shopping' | 'menu';

export interface AssistantProposal {
  id: string;
  type: ProposalType;
  title: string;
  summary: string[];
  payload: Record<string, unknown>;
  /** Client-side state of the card. */
  state?: 'open' | 'saving' | 'saved' | 'dismissed' | 'error';
  link?: string;
  error?: string;
}

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
  proposals?: AssistantProposal[];
  error?: boolean;
}

export interface AssistantStatus { enabled: boolean; provider: string; model: string; }

const STORAGE_KEY = 'assistant:conversation';

/**
 * One conversation shared by the floating panel and the assistant page.
 * Kept for the browser session so a page change does not lose it.
 */
@Injectable({ providedIn: 'root' })
export class AssistantService {
  private readonly http = inject(HttpClient);
  readonly messages = signal<AssistantMessage[]>(this.restore());
  readonly sending = signal(false);
  readonly panelOpen = signal(false);
  private status$?: Observable<AssistantStatus>;

  status(): Observable<AssistantStatus> {
    this.status$ ??= this.http.get<{ data: AssistantStatus }>(`${environment.apiUrl}/assistant/status/`).pipe(
      map(r => r.data),
      catchError(() => of({ enabled: false, provider: '', model: '' })),
      shareReplay(1),
    );
    return this.status$;
  }

  send(text: string, page: string): void {
    const content = text.trim();
    if (!content || this.sending()) return;
    this.update([...this.messages(), { role: 'user', content }]);
    this.sending.set(true);
    // Only the text goes back to the model; proposal cards stay on this side.
    const history = this.messages().filter(m => !m.error).map(m => ({ role: m.role, content: this.historyText(m) }));
    this.http.post<{ data: { reply: string; proposals: AssistantProposal[] } }>(
      `${environment.apiUrl}/assistant/chat/`, { messages: history, context: { page } },
    ).subscribe({
      next: ({ data }) => {
        this.update([...this.messages(), {
          role: 'assistant', content: data.reply,
          proposals: data.proposals.map(p => ({ ...p, state: 'open' as const })),
        }]);
        this.sending.set(false);
      },
      error: error => {
        const message = error?.status === 429
          ? 'Für den Moment sind genug Anfragen gestellt. Bitte später nochmals versuchen.'
          : error?.error?.error?.message || 'Der Assistent ist gerade nicht erreichbar.';
        this.update([...this.messages(), { role: 'assistant', content: message, error: true }]);
        this.sending.set(false);
      },
    });
  }

  /** Saves a proposal card via the normal app rules. */
  apply(messageIndex: number, proposal: AssistantProposal): void {
    if (proposal.state === 'saving' || proposal.state === 'saved') return;
    this.patchProposal(messageIndex, proposal.id, { state: 'saving', error: '' });
    this.http.post<{ data: unknown; link: string }>(`${environment.apiUrl}/assistant/apply/`,
      { type: proposal.type, payload: proposal.payload }).subscribe({
      next: result => this.patchProposal(messageIndex, proposal.id, { state: 'saved', link: result.link }),
      error: error => this.patchProposal(messageIndex, proposal.id, {
        state: 'error', error: error?.error?.error?.message || 'Konnte nicht gespeichert werden.',
      }),
    });
  }

  dismiss(messageIndex: number, proposal: AssistantProposal): void {
    if (proposal.state === 'open' || proposal.state === 'error') this.patchProposal(messageIndex, proposal.id, { state: 'dismissed' });
  }

  clear(): void { this.update([]); }

  private historyText(message: AssistantMessage): string {
    const cards = (message.proposals ?? []).map(p => `[Vorschlag ${p.type} „${p.title}“: ${
      p.state === 'saved' ? 'übernommen' : p.state === 'dismissed' ? 'verworfen' : 'offen'}]`);
    return [message.content, ...cards].filter(Boolean).join('\n');
  }

  private patchProposal(index: number, id: string, change: Partial<AssistantProposal>): void {
    this.update(this.messages().map((m, i) => i !== index ? m : {
      ...m, proposals: m.proposals?.map(p => p.id === id ? { ...p, ...change } : p),
    }));
  }

  private update(messages: AssistantMessage[]): void {
    this.messages.set(messages);
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40))); } catch { /* storage unavailable */ }
  }

  private restore(): AssistantMessage[] {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]') as AssistantMessage[];
      // A card that was saving when the page reloaded is shown as open again.
      return saved.map(m => ({ ...m, proposals: m.proposals?.map(p => p.state === 'saving' ? { ...p, state: 'open' as const } : p) }));
    } catch {
      return [];
    }
  }
}
