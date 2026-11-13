import { Component, HostListener, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { AssistantChat } from './assistant-chat';
import { AssistantService } from './assistant.service';

/** Floating button on every page (except the assistant page) that opens the chat as a side panel. */
@Component({
  selector: 'app-assistant-launcher',
  standalone: true,
  imports: [AsyncPipe, RouterLink, AssistantChat],
  template: `
    @if ((status$ | async)?.enabled && !onAssistantPage()) {
      @if (assistant.panelOpen()) {
        <section class="assistant-panel" role="dialog" aria-label="Assistent">
          <header>
            <strong>Assistent</strong>
            <a routerLink="/assistant" (click)="assistant.panelOpen.set(false)">Gross öffnen</a>
            <button type="button" class="close" (click)="assistant.panelOpen.set(false)" aria-label="Assistent schliessen">✕</button>
          </header>
          <app-assistant-chat [compact]="true"></app-assistant-chat>
        </section>
      } @else {
        <button type="button" class="assistant-fab" (click)="assistant.panelOpen.set(true)" aria-label="Assistent öffnen">
          <img src="/icons/assistant.svg" alt="" />
          @if (assistant.sending()) { <span class="busy" aria-hidden="true"></span> }
        </button>
      }
    }
  `,
  styles: [`
    .assistant-fab {
      position: fixed; right: 20px; bottom: 20px; z-index: 900;
      width: 56px; height: 56px; border-radius: 50%; border: 0;
      background: var(--color-accent); box-shadow: 0 8px 24px rgba(0,0,0,.35);
      display: grid; place-items: center; cursor: pointer;
    }
    .assistant-fab img { width: 28px; height: 28px; filter: brightness(0) saturate(100%) invert(10%); }
    .busy { position: absolute; inset: -4px; border-radius: 50%; border: 3px solid transparent;
      border-top-color: var(--color-accent); animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .assistant-panel {
      position: fixed; right: 20px; bottom: 20px; z-index: 900;
      width: min(420px, calc(100vw - 40px)); height: min(640px, calc(100dvh - 120px));
      display: flex; flex-direction: column; padding: 14px 16px 12px;
      background: var(--color-surface); border: 1px solid var(--color-card-border); border-radius: 18px;
      box-shadow: 0 16px 60px rgba(0,0,0,.5);
    }
    .assistant-panel header { display: flex; align-items: center; gap: 12px; padding-bottom: 10px;
      margin-bottom: 8px; border-bottom: 1px solid var(--color-card-border); }
    .assistant-panel header strong { margin-right: auto; }
    .assistant-panel header a { color: var(--color-accent); font-size: .8rem; text-decoration: none; }
    .close { width: 36px; height: 36px; border: 0; border-radius: 50%; background: transparent; color: var(--color-muted); cursor: pointer; }
    /* Above the bottom navigation shown on phones and tablets. */
    @media (max-width: 899px) {
      .assistant-fab { bottom: calc(84px + env(safe-area-inset-bottom)); right: 16px; }
      .assistant-panel { bottom: calc(84px + env(safe-area-inset-bottom)); max-height: calc(100dvh - 160px); }
    }
    @media (max-width: 699px) {
      .assistant-fab { width: 52px; height: 52px; }
      .assistant-panel { inset: 0; width: 100%; height: 100dvh; max-height: none; border-radius: 0; border: 0;
        padding: calc(12px + env(safe-area-inset-top)) 14px calc(10px + env(safe-area-inset-bottom)); z-index: 2000; }
    }
  `],
})
export class AssistantLauncher {
  readonly assistant = inject(AssistantService);
  private readonly router = inject(Router);
  readonly status$ = this.assistant.status();
  readonly onAssistantPage = toSignal(this.router.events.pipe(
    filter(e => e instanceof NavigationEnd),
    map(() => this.router.url.startsWith('/assistant')),
    startWith(this.router.url.startsWith('/assistant')),
  ), { initialValue: false });

  @HostListener('document:keydown.escape')
  onEscape(): void { this.assistant.panelOpen.set(false); }
}
