"""Minimal chat clients for OpenAI and Anthropic with tool calling.

Both speak plain HTTPS JSON (stdlib only, no SDK on the Pi). The rest of the
assistant works with one neutral format:

    messages: [{'role': 'user'|'assistant', 'content': str},
               {'role': 'assistant', 'content': str, 'tool_calls': [ToolCall]},
               {'role': 'tool', 'tool_call_id': str, 'content': str}]
    reply:    Reply(text, tool_calls)
"""
import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field

DEFAULT_MODELS = {'openai': 'gpt-5.6-luna', 'anthropic': 'claude-sonnet-5-5'}
TIMEOUT_SECONDS = 60


class AssistantUnavailable(Exception):
    """Not configured, or the provider could not be reached."""


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict


@dataclass
class Reply:
    text: str
    tool_calls: list = field(default_factory=list)
    # Provider output to send back unchanged in the next round (OpenAI reasoning items).
    raw: list | None = None


def settings():
    """Provider, model and key from the environment (.env on the Pi)."""
    provider = os.environ.get('ASSISTANT_PROVIDER', '').strip().lower()
    if not provider:
        if os.environ.get('OPENAI_API_KEY'):
            provider = 'openai'
        elif os.environ.get('ANTHROPIC_API_KEY'):
            provider = 'anthropic'
    key = os.environ.get('OPENAI_API_KEY' if provider == 'openai' else 'ANTHROPIC_API_KEY', '').strip()
    model = os.environ.get('ASSISTANT_MODEL', '').strip() or DEFAULT_MODELS.get(provider, '')
    enabled = provider in DEFAULT_MODELS and bool(key)
    return {'enabled': enabled, 'provider': provider if enabled else '', 'model': model if enabled else '', 'key': key}


def _post(url, headers, body):
    request = urllib.request.Request(url, data=json.dumps(body).encode(), method='POST',
                                     headers={'Content-Type': 'application/json', **headers})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors='replace')[:300]
        raise AssistantUnavailable(f'Der Sprachmodell-Dienst meldet {error.code}: {detail}') from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise AssistantUnavailable('Der Sprachmodell-Dienst ist nicht erreichbar.') from error


def complete(system, messages, tools):
    config = settings()
    if not config['enabled']:
        raise AssistantUnavailable('Der Assistent ist nicht eingerichtet (API-Schlüssel fehlt).')
    if config['provider'] == 'openai':
        return _openai(config, system, messages, tools)
    return _anthropic(config, system, messages, tools)


def _openai(config, system, messages, tools):
    """OpenAI Responses API (/v1/responses): the only one that allows tools with reasoning models.

    Nothing is stored at OpenAI (store=false). The model's own output items of a tool round, including its
    encrypted reasoning, are sent back unchanged in the next round, as the API requires.
    """
    items = []
    for message in messages:
        if message['role'] == 'tool':
            items.append({'type': 'function_call_output', 'call_id': message['tool_call_id'],
                          'output': message['content']})
        elif message.get('tool_calls'):
            items.extend(message.get('raw') or [
                {'type': 'function_call', 'call_id': c.id, 'name': c.name, 'arguments': json.dumps(c.arguments)}
                for c in message['tool_calls']])
        else:
            items.append({'role': message['role'], 'content': message['content']})
    body = {'model': config['model'], 'instructions': system, 'input': items, 'store': False,
            'include': ['reasoning.encrypted_content'],
            'tools': [{'type': 'function', 'name': t['name'], 'description': t['description'],
                       'parameters': t['parameters']} for t in tools]}
    data = _post('https://api.openai.com/v1/responses', {'Authorization': f"Bearer {config['key']}"}, body)
    output = data.get('output') or []
    text = ''.join(part.get('text', '') for item in output if item.get('type') == 'message'
                   for part in item.get('content') or [] if part.get('type') == 'output_text')
    calls = []
    for item in output:
        if item.get('type') != 'function_call':
            continue
        try:
            arguments = json.loads(item.get('arguments') or '{}')
        except json.JSONDecodeError:
            arguments = {}
        calls.append(ToolCall(item['call_id'], item['name'], arguments))
    return Reply(text, calls, raw=output if calls else None)


def _anthropic(config, system, messages, tools):
    converted = []
    for message in messages:
        if message['role'] == 'tool':
            block = {'type': 'tool_result', 'tool_use_id': message['tool_call_id'], 'content': message['content']}
            # Consecutive tool results belong in one user turn.
            if converted and converted[-1]['role'] == 'user' and isinstance(converted[-1]['content'], list):
                converted[-1]['content'].append(block)
            else:
                converted.append({'role': 'user', 'content': [block]})
        elif message.get('tool_calls'):
            content = [{'type': 'text', 'text': message['content']}] if message.get('content') else []
            content += [{'type': 'tool_use', 'id': c.id, 'name': c.name, 'input': c.arguments}
                        for c in message['tool_calls']]
            converted.append({'role': 'assistant', 'content': content})
        else:
            converted.append({'role': message['role'], 'content': message['content']})
    body = {'model': config['model'], 'max_tokens': 4096, 'system': system, 'messages': converted,
            'tools': [{'name': t['name'], 'description': t['description'], 'input_schema': t['parameters']}
                      for t in tools]}
    data = _post('https://api.anthropic.com/v1/messages',
                 {'x-api-key': config['key'], 'anthropic-version': '2023-06-01'}, body)
    text = ''.join(block.get('text', '') for block in data.get('content', []) if block.get('type') == 'text')
    calls = [ToolCall(block['id'], block['name'], block.get('input') or {})
             for block in data.get('content', []) if block.get('type') == 'tool_use']
    return Reply(text, calls)
