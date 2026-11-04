"""Success responses in the API's shape (see docs/api-conventions.md).

    {"data": ...}        for reads, creates and updates
    {"success": true}    for deletes
"""
from rest_framework import status


class DataEnvelopeMixin:
    """Wrap a generic view's successful responses in the API envelope.

    Lets views use DRF's generic list/create/retrieve/update/destroy as they
    are, instead of overriding each method only to wrap the result.
    """

    def finalize_response(self, request, response, *args, **kwargs):
        if 200 <= response.status_code < 300 and not getattr(response, 'enveloped', False):
            if response.status_code == status.HTTP_204_NO_CONTENT:
                response.status_code = status.HTTP_200_OK
                response.data = {'success': True}
            else:
                response.data = {'data': response.data}
            response.enveloped = True
        return super().finalize_response(request, response, *args, **kwargs)
