import { beforeEach } from 'vitest';
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
// jsdom has no layout engine; production uses the browser's native observer.
class TestResizeObserver {
  observe() {} unobserve() {} disconnect() {}
}
Object.defineProperty(globalThis, 'ResizeObserver', { value: TestResizeObserver, configurable: true });
