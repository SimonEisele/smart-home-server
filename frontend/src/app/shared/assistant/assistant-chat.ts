import { AfterViewChecked, Component, ElementRef, Input, ViewChild, inject } from '@angular/core';
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
export class AssistantChat implements AfterViewChecked {
  readonly assistant = inject(AssistantService);
  private readonly router = inject(Router);
  @Input() compact = false;
  @ViewChild('scroller') scroller?: ElementRef<HTMLElement>;
  @ViewChild('input') input?: ElementRef<HTMLTextAreaElement>;
  readonly status$ = this.assistant.status();
  draft = '';
  private renderedCount = -1;

  readonly TYPE_LABELS: Record<ProposalType, string> = {
    recipe: 'Rezept', event: 'Termin', todo: 'Aufgabe', shopping: 'Einkaufsliste', menu: 'Menüplan',
  };
  readonly suggestions = [
    { label: 'Rezept von einem Link übernehmen', text: 'Bitte übernimm dieses Rezept: ' },
    { label: 'Was steht diese Woche an?', text: 'Was steht diese Woche an? Termine, Aufgaben und Putzen.' },
    { label: 'Termin eintragen', text: 'Trag morgen um 19 Uhr eine WG-Sitzung im Wohnzimmer ein.' },
    { label: 'Einkauf fürs Wochenende', text: 'Was brauchen wir für die geplanten Gerichte am Wochenende? Setz es auf die Einkaufsliste.' },
  ];

  ngAfterViewChecked(): void {
    // Keep the newest message in view.
    const count = this.assistant.messages().length + (this.assistant.sending() ? 1 : 0);
    if (count !== this.renderedCount && this.scroller) {
      this.renderedCount = count;
      this.scroller.nativeElement.scrollTop = this.scroller.nativeElement.scrollHeight;
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

  linkPath(proposal: AssistantProposal): string { return (proposal.link ?? '/').split('?')[0]; }

  linkParams(proposal: AssistantProposal): Record<string, string> {
    return Object.fromEntries(new URLSearchParams((proposal.link ?? '').split('?')[1] ?? ''));
  }
}
