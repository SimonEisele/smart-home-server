import { apiErrorCode, apiErrorMessage } from './api-error';

it('reads message and code from the API error shape', () => {
  const err = { status: 400, error: { error: { code: 'VALIDATION_ERROR', message: 'Name fehlt.', details: { name: ['Name fehlt.'] } } } };
  expect(apiErrorMessage(err, 'Fallback')).toBe('Name fehlt.');
  expect(apiErrorCode(err)).toBe('VALIDATION_ERROR');
});

it('falls back for network errors and unexpected bodies', () => {
  expect(apiErrorMessage({ status: 0, error: new ProgressEvent('error') }, 'Offline')).toBe('Offline');
  expect(apiErrorMessage({ error: '<html>' }, 'Fallback')).toBe('Fallback');
  expect(apiErrorMessage(null, 'Fallback')).toBe('Fallback');
  expect(apiErrorCode({ error: {} })).toBeNull();
});
