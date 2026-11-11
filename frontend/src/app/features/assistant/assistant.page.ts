import { Component } from '@angular/core';
import { AssistantChat } from '../../shared/assistant/assistant-chat';

@Component({
  selector: 'app-assistant-page',
  standalone: true,
  imports: [AssistantChat],
  template: `
    <section class="assistant-page app-page">
      <header class="page-header">
        <div class="page-heading">
          <p class="eyebrow">Hilfe</p>
          <h1 class="page-title">Assistent</h1>
          <p class="page-subtitle">Rezepte von Links übernehmen, Termine, Aufgaben, Menüplan und Einkauf – du bestätigst jeden Vorschlag.</p>
        </div>
      </header>
      <app-assistant-chat></app-assistant-chat>
    </section>
  `,
  styles: [`
    .assistant-page { display: flex; flex-direction: column; height: calc(100dvh - 120px); max-width: 860px; }
    @media (max-width: 699px) { .assistant-page { height: calc(100dvh - 170px); } }
  `],
})
export class AssistantPage {}
