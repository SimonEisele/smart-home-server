import { filtersChanged, loadFilters, saveFilters } from './filter-memory';

describe('filter memory', () => {
  beforeEach(() => sessionStorage.clear());

  it('restores saved values of the right type and falls back to defaults', () => {
    saveFilters('t', { status: 'done', search: 'x', extra: 1 });
    sessionStorage.setItem('filters:u', '{"status": 5}');
    expect(loadFilters('t', { status: 'open', search: '' })).toEqual({ status: 'done', search: 'x' });
    expect(loadFilters('u', { status: 'open' })).toEqual({ status: 'open' });
    sessionStorage.setItem('filters:v', 'kaputt');
    expect(loadFilters('v', { status: 'open' })).toEqual({ status: 'open' });
  });

  it('detects changed filters', () => {
    expect(filtersChanged({ a: 'x', b: '' }, { a: 'x', b: '' })).toBe(false);
    expect(filtersChanged({ a: 'y', b: '' }, { a: 'x', b: '' })).toBe(true);
  });
});
