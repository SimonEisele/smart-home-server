import { Component, ElementRef, Injector, Input, ViewChild, afterNextRender, computed, effect, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AssistantProposal, AssistantService, ProposalType } from './assistant.service';

/** The conversation itself; used in the floating panel and on the assistant page. */
@Component({
  selector: 'app-assistant-chat',
  standalone: true,
  imports: [AsyncPipe, FormsModule, RouterLink],
  templateUrl: './assistant-chat.html',
  styleUrl: './assistant-chat.css',
})
export class AssistantChat {
  readonly assistant = inject(AssistantService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  @Input() compact = false;
  @ViewChild('scroller') scroller?: ElementRef<HTMLElement>;
  @ViewChild('input') input?: ElementRef<HTMLTextAreaElement>;
  readonly status$ = this.assistant.status();
  draft = '';

  readonly TYPE_LABELS: Record<ProposalType, string> = {
    recipe: 'Neues Rezept', event: 'Neuer Termin', todo: 'Neue Aufgabe', shopping: 'Einkaufsliste',
    menu: 'Menüplan', recipe_update: 'Rezept ändern', event_update: 'Termin ändern',
    todo_update: 'Aufgabe ändern', shopping_update: 'Einkauf ändern',
  };
  readonly STATUS_LABELS = { added: 'neu', changed: 'geändert', removed: 'entfernt', new: 'neu' } as const;
  readonly suggestions = [
    { label: 'Rezept von einem Link übernehmen', text: 'Bitte übernimm dieses Rezept: ' },
    { label: 'Was steht diese Woche an?', text: 'Was steht diese Woche an? Termine, Aufgaben und Putzen.' },
    { label: 'Termin eintragen', text: 'Trag morgen um 19 Uhr eine WG-Sitzung im Wohnzimmer ein.' },
    { label: 'Einkauf fürs Wochenende', text: 'Was brauchen wir für die geplanten Gerichte am Wochenende? Setz es auf die Einkaufsliste.' },
  ];

  constructor() {
    // Keep the newest message in view once it is on screen; saving a card does not move the view.
    const turn = computed(() => `${this.assistant.messages().length}:${this.assistant.sending()}`);
    effect(() => {
      turn();
      afterNextRender(() => this.scrollToLatest(), { injector: this.injector });
    });
  }

  private scrollToLatest(): void {
    const box = this.scroller?.nativeElement;
    if (!box) return;
    const last = this.assistant.messages().at(-1);
    const sending = this.assistant.sending();
    const answer = [...box.querySelectorAll<HTMLElement>('.message')].at(-1);
    if (!sending && last?.role === 'assistant' && answer) {
      // A fresh answer with long cards is read from its start, not from the last button.
      box.scrollTop += answer.getBoundingClientRect().top - box.getBoundingClientRect().top - 8;
    } else {
      box.scrollTop = box.scrollHeight;
    }
  }

  send(): void {
    this.assistant.send(this.draft, this.router.url.split('?')[0]);
    this.draft = '';
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.send();
    }
  }

  useSuggestion(text: string): void {
    this.draft = text;
    setTimeout(() => {
      const field = this.input?.nativeElement;
      field?.focus();
      field?.setSelectionRange(text.length, text.length);
    });
  }

  isUpdate(proposal: AssistantProposal): boolean { return proposal.type.endsWith('_update'); }

  linkPath(proposal: AssistantProposal): string { return (proposal.link ?? '/').split('?')[0]; }

  linkParams(proposal: AssistantProposal): Record<string, string> {
    return Object.fromEntries(new URLSearchParams((proposal.link ?? '').split('?')[1] ?? ''));
  }
}
