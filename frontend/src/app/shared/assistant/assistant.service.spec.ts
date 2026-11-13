import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AssistantService } from './assistant.service';

describe('AssistantService', () => {
  let service: AssistantService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AssistantService);
    http = TestBed.inject(HttpTestingController);
  });

  it('sends the text history with the page and shows proposal cards', () => {
    service.send('Zahnarzt morgen 8:30', '/calendar');
    expect(service.sending()).toBe(true);
    const request = http.expectOne(r => r.url.endsWith('/assistant/chat/'));
    expect(request.request.body).toEqual({
      messages: [{ role: 'user', content: 'Zahnarzt morgen 8:30' }], context: { page: '/calendar' },
    });
    request.flush({ data: { reply: 'Hier ist mein Vorschlag.', proposals: [
      { id: 'p1', type: 'event', title: 'Zahnarzt', summary: ['12.11.2026, 08:30–09:30'], payload: { title: 'Zahnarzt' } },
    ] } });
    expect(service.sending()).toBe(false);
    expect(service.messages()[1].proposals?.[0].state).toBe('open');

    service.apply(1, service.messages()[1].proposals![0]);
    const apply = http.expectOne(r => r.url.endsWith('/assistant/apply/'));
    expect(apply.request.body).toEqual({ type: 'event', payload: { title: 'Zahnarzt' } });
    apply.flush({ data: {}, link: '/calendar?date=2026-11-12' });
    expect(service.messages()[1].proposals?.[0]).toEqual(expect.objectContaining({ state: 'saved', link: '/calendar?date=2026-11-12' }));

    // The model later learns that the card was accepted.
    service.send('Danke', '/calendar');
    const next = http.expectOne(r => r.url.endsWith('/assistant/chat/'));
    expect(next.request.body.messages[1].content).toContain('[Vorschlag event „Zahnarzt“: übernommen]');
    expect(JSON.parse(sessionStorage.getItem('assistant:conversation')!).length).toBe(3);
  });

  it('shows friendly errors and keeps them out of the history', () => {
    service.send('Hallo', '/');
    http.expectOne(r => r.url.endsWith('/assistant/chat/')).flush({}, { status: 429, statusText: 'Too Many' });
    expect(service.messages()[1]).toEqual(expect.objectContaining({ error: true }));
    expect(service.messages()[1].content).toContain('genug Anfragen');
    service.send('Nochmals', '/');
    const next = http.expectOne(r => r.url.endsWith('/assistant/chat/'));
    expect(next.request.body.messages.map((m: { content: string }) => m.content)).toEqual(['Hallo', 'Nochmals']);
  });

  it('marks failed saves on the card and lets dismissed cards stay dismissed', () => {
    service.messages.set([{ role: 'assistant', content: 'x', proposals: [
      { id: 'a', type: 'todo', title: 'Velo', summary: [], payload: {}, state: 'open' },
      { id: 'b', type: 'todo', title: 'Keller', summary: [], payload: {}, state: 'open' }] }]);
    service.apply(0, service.messages()[0].proposals![0]);
    http.expectOne(r => r.url.endsWith('/assistant/apply/')).flush(
      { error: { message: 'Bitte einen Titel angeben.' } }, { status: 400, statusText: 'Bad' });
    service.dismiss(0, service.messages()[0].proposals![1]);
    expect(service.messages()[0].proposals!.map(p => [p.state, p.error ?? ''])).toEqual([
      ['error', 'Bitte einen Titel angeben.'], ['dismissed', '']]);
  });

  it('keeps open recipe cards readable for the model', () => {
    service.messages.set([{ role: 'user', content: 'Rezept bitte' }, { role: 'assistant', content: 'Hier.', proposals: [
      { id: 'r', type: 'recipe', title: 'Pasta', summary: [], payload: {}, state: 'open', details: {
        ingredients: [{ text: '200 g Nudeln' }, { text: 'Salz', status: 'removed' }],
        steps: [{ text: 'Kochen.', ingredients: ['200 g Nudeln'] }] } }] }]);
    service.send('Mach 4 Portionen', '/');
    const body = http.expectOne(r => r.url.endsWith('/assistant/chat/')).request.body;
    expect(body.messages[1].content).toBe(
      'Hier.\n[Vorschlag recipe „Pasta“: offen]\nZutaten: 200 g Nudeln\n1. Kochen. (200 g Nudeln)');
  });
});
