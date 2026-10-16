"""Article pictures are embedded in the database, not stored as media files."""
import base64
import binascii
import io
import warnings

from PIL import Image, UnidentifiedImageError
from rest_framework import serializers


class ArticleImageField(serializers.CharField):
    MAX_BYTES = 512 * 1024
    MIME_FORMATS = {'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WEBP'}

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        if not value:
            return ''
        # Existing external image URLs remain editable.
        if not value.startswith('data:'):
            return serializers.URLField(max_length=2048).run_validation(value)
        header, separator, encoded = value.partition(',')
        mime = header.removeprefix('data:').removesuffix(';base64')
        if not separator or header != f'data:{mime};base64' or mime not in self.MIME_FORMATS:
            raise serializers.ValidationError('Bitte ein JPEG-, PNG- oder WebP-Bild wählen.')
        if len(encoded) > 4 * ((self.MAX_BYTES + 2) // 3):
            raise serializers.ValidationError('Das verkleinerte Bild darf höchstens 512 KB gross sein.')
        try:
            raw = base64.b64decode(encoded, validate=True)
            if len(raw) > self.MAX_BYTES:
                raise ValueError('Image too large')
            with warnings.catch_warnings():
                warnings.simplefilter('error', Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(raw)) as picture:
                    if picture.format != self.MIME_FORMATS[mime] or max(picture.size) > 4096:
                        raise ValueError('Invalid image format or dimensions')
                    picture.verify()
                # Decode too: a valid header alone is not a valid uploaded picture.
                with Image.open(io.BytesIO(raw)) as picture:
                    picture.load()
        except (ValueError, binascii.Error, OSError, UnidentifiedImageError,
                Image.DecompressionBombError, Image.DecompressionBombWarning):
            raise serializers.ValidationError('Das Bild ist ungültig oder zu gross. Bitte ein anderes Bild wählen.')
        return f'data:{mime};base64,{base64.b64encode(raw).decode("ascii")}'
