"""Fetching a web page for the assistant, safely, and pulling out a recipe.

The Pi sits in the home network, so a link from a chat must never reach the
router, the Pi itself or other local devices: every address a host name
resolves to (and every redirect target) has to be public.
"""
import html
import ipaddress
import json
import re
import socket
import urllib.error
import urllib.parse
import urllib.request

MAX_BYTES = 2_000_000
TIMEOUT_SECONDS = 12
MAX_TEXT = 12_000
USER_AGENT = 'Mozilla/5.0 (compatible; WG-Smarthome-Assistent/1.0)'


class FetchError(Exception):
    pass


def check_public_url(url):
    parts = urllib.parse.urlsplit(url)
    if parts.scheme not in ('http', 'https') or not parts.hostname:
        raise FetchError('Nur http- und https-Links sind erlaubt.')
    try:
        infos = socket.getaddrinfo(parts.hostname, parts.port or (443 if parts.scheme == 'https' else 80))
    except socket.gaierror as error:
        raise FetchError('Die Adresse konnte nicht aufgelöst werden.') from error
    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if not address.is_global:
            raise FetchError('Links ins lokale Netzwerk sind nicht erlaubt.')


class _CheckedRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        check_public_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url, max_bytes=MAX_BYTES, accept='text/html,*/*;q=0.5'):
    """Loads a public URL as text; also used for subscribed calendars (iCal links)."""
    check_public_url(url)
    opener = urllib.request.build_opener(_CheckedRedirects)
    request = urllib.request.Request(url, headers={
        'User-Agent': USER_AGENT, 'Accept': accept, 'Accept-Language': 'de-CH,de;q=0.9,en;q=0.5'})
    try:
        with opener.open(request, timeout=TIMEOUT_SECONDS) as response:
            raw = response.read(max_bytes + 1)
            charset = response.headers.get_content_charset() or 'utf-8'
    except urllib.error.HTTPError as error:
        raise FetchError(f'Die Seite antwortet mit Fehler {error.code}.') from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise FetchError('Die Seite ist nicht erreichbar.') from error
    if len(raw) > max_bytes:
        raise FetchError('Die Seite ist zu gross.')
    return raw.decode(charset, errors='replace')


def _iso_minutes(value):
    match = re.fullmatch(r'P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?', str(value or '').strip(), re.I)
    if not match or not any(match.groups()):
        return None
    return int(match.group(1) or 0) * 60 + int(match.group(2) or 0)


def _steps(value):
    """recipeInstructions may be a string, strings, HowToStep or HowToSection objects."""
    if isinstance(value, str):
        return [s.strip() for s in re.split(r'\n+', html.unescape(re.sub(r'<[^>]+>', '\n', value))) if s.strip()]
    steps = []
    for item in value or []:
        if isinstance(item, str):
            steps.extend(_steps(item))
        elif isinstance(item, dict):
            if item.get('itemListElement'):
                steps.extend(_steps(item['itemListElement']))
            elif item.get('text') or item.get('name'):
                steps.append(html.unescape(str(item.get('text') or item.get('name'))).strip())
    return steps


def _find_recipe(node):
    if isinstance(node, list):
        for item in node:
            found = _find_recipe(item)
            if found:
                return found
    elif isinstance(node, dict):
        kind = node.get('@type')
        if kind == 'Recipe' or (isinstance(kind, list) and 'Recipe' in kind):
            return node
        for key in ('@graph', 'mainEntity', 'mainEntityOfPage'):
            found = _find_recipe(node.get(key))
            if found:
                return found
    return None


def extract_recipe(page):
    """Recipe data from schema.org JSON-LD, which most recipe sites embed."""
    for block in re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', page, re.S | re.I):
        try:
            data = json.loads(html.unescape(block.strip()))
        except json.JSONDecodeError:
            continue
        recipe = _find_recipe(data)
        if not recipe:
            continue
        yield_value = recipe.get('recipeYield')
        if isinstance(yield_value, list):
            yield_value = next((str(v) for v in yield_value if v), '')
        return {
            'name': html.unescape(str(recipe.get('name') or '')).strip(),
            'description': html.unescape(str(recipe.get('description') or '')).strip()[:500],
            'yield': str(yield_value or ''),
            'totalMinutes': _iso_minutes(recipe.get('totalTime')) or _iso_minutes(recipe.get('cookTime')),
            'ingredients': [html.unescape(str(i)).strip()
                            for i in recipe.get('recipeIngredient') or [] if str(i).strip()],
            'steps': _steps(recipe.get('recipeInstructions')),
        }
    return None


def page_text(page):
    """Readable text of a page as a fallback when there is no structured recipe."""
    page = re.sub(r'<(head|title|script|style|noscript|svg|nav|footer|header)[^>]*>.*?</\1>', ' ', page,
                  flags=re.S | re.I)
    text = html.unescape(re.sub(r'<[^>]+>', '\n', page))
    lines = [re.sub(r'\s+', ' ', line).strip() for line in text.splitlines()]
    return '\n'.join(line for line in lines if line)[:MAX_TEXT]


def read_url(url):
    page = fetch(url)
    title = re.search(r'<title[^>]*>(.*?)</title>', page, re.S | re.I)
    recipe = extract_recipe(page)
    result = {'url': url, 'title': html.unescape(title.group(1)).strip()[:200] if title else ''}
    if recipe and recipe['ingredients']:
        result['recipe'] = recipe
    else:
        result['text'] = page_text(page)
    return result
