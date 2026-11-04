"""One error shape for the whole API (see docs/api-conventions.md):

    {"error": {"code": "VALIDATION_ERROR", "message": "...", "details": ...}}

`message` is always a readable German sentence for the UI. `details` holds the
field errors of a validation failure ({"field": ["..."]}) or extra data such as
export warnings, otherwise null.
"""
import logging

from django.conf import settings
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)

CODES = {
    400: 'VALIDATION_ERROR',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    405: 'METHOD_NOT_ALLOWED',
    409: 'CONFLICT',
    429: 'RATE_LIMITED',
    500: 'INTERNAL_ERROR',
}

DEFAULT_MESSAGES = {
    400: 'Die Eingaben sind ungültig.',
    401: 'Bitte erneut anmelden.',
    403: 'Dafür fehlt die Berechtigung.',
    404: 'Nicht gefunden.',
    405: 'Diese Aktion ist hier nicht erlaubt.',
    409: 'Die Daten haben sich inzwischen geändert.',
    429: 'Zu viele Versuche. Bitte kurz warten und erneut versuchen.',
    500: 'Der Server konnte die Anfrage nicht verarbeiten.',
}

# DRF's built-in English messages, shown in German instead.
TRANSLATIONS = {
    'Not found.': DEFAULT_MESSAGES[404],
    'Authentication credentials were not provided.': DEFAULT_MESSAGES[401],
    'You do not have permission to perform this action.': DEFAULT_MESSAGES[403],
}


def _strings(value):
    """All human-readable strings in a DRF error structure, in order."""
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [s for key, item in value.items() if key != 'code' for s in _strings(item)]
    if isinstance(value, (list, tuple)):
        return [s for item in value for s in _strings(item)]
    return []


def error_body(status_code, message=None, details=None, code=None):
    if message and message.startswith('No ') and message.endswith(' matches the given query.'):
        message = None  # Django's English get_object_or_404 text, e.g. "No Todo matches ..."
    message = message or DEFAULT_MESSAGES.get(status_code, 'Die Anfrage ist fehlgeschlagen.')
    return {'error': {
        'code': code or CODES.get(status_code, 'ERROR'),
        'message': TRANSLATIONS.get(message, message),
        'details': details,
    }}


def api_error(message, status_code=status.HTTP_400_BAD_REQUEST, details=None, code=None):
    """Return an error Response in the API's error shape."""
    return Response(error_body(status_code, message, details, code), status=status_code)


def exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        if settings.DEBUG:
            return None  # keep Django's debug page with the traceback
        logger.exception('Unhandled API error', exc_info=exc)
        return Response(error_body(500), status=500)

    data = response.data
    details = None
    if isinstance(data, dict) and set(data) <= {'detail', 'code', 'messages'}:
        # A plain "detail" error (permissions, not found, throttling, JWT).
        message = str(data.get('detail', ''))
    else:
        # Field errors from a serializer: keep them per field in `details`.
        details = data
        message = ' '.join(_strings(data))
    response.data = error_body(response.status_code, message or None, details)
    return response
