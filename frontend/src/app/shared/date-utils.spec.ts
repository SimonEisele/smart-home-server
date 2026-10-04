import { localIsoDate, dateTimeInZone } from './date-utils';
describe('Local calendar dates', () => {
  it('keeps a selected date at local midnight on the same day', () => {
    expect(localIsoDate(new Date(2026, 9, 4, 0, 0))).toBe('2026-10-04');
  });
  it('formats weather timestamps in the selected location timezone', () => {
    expect(dateTimeInZone(new Date('2026-10-04T22:30:00Z'), 'Europe/Zurich')).toBe('2026-10-05T00:30');
  });
});
