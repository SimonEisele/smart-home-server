import os
import json

from dotenv import load_dotenv
from openai import OpenAI


load_dotenv()

API_KEY = os.getenv("OPENAI_API_KEY")

if not API_KEY:
    raise RuntimeError(
        "OPENAI_API_KEY was not found. "
        "Add it to the .env file in the project root."
    )


client = OpenAI(api_key=API_KEY)


def ask_llm(prompt: str) -> str:
    response = client.responses.create(
        model="gpt-5.6-luna",
        input=prompt,
    )

    return response.output_text


def rewrite_search_query(
    query: str,
    conversation: str,
) -> str:
    prompt = f"""
You generate a short technical search query for a software project.

The search query will be used to find relevant files in a Django + Angular codebase.

Use the previous conversation only to resolve references such as:
- "das"
- "dabei"
- "dieses Problem"
- "wie würdest du es beheben"

Return only the search query.
Do not explain anything.

Prefer:
- technical terms
- class names
- framework terms
- filenames or concepts likely to exist in source code

Keep the query concise.

PREVIOUS CONVERSATION:

{conversation}

CURRENT USER QUESTION:

{query}
"""

    response = client.responses.create(
        model="gpt-5.6-luna",
        input=prompt,
    )

    return response.output_text.strip()


def extract_memory_candidates(
    query: str,
    answer: str,
    context_files: list[str],
) -> list[dict]:

    files_text = "\n".join(
        f"- {path}"
        for path in context_files
    )

    prompt = f"""
You extract durable project knowledge from a coding assistant interaction.

Only create memory entries that will likely still be useful in future
conversations about the project.

Allowed categories:

- architecture
- decisions
- known_issues

Important rules:

1. Do not store temporary conversation details.
2. Do not store recommendations as established project facts.
3. A known issue must be supported by the supplied project files.
4. Architecture facts must describe the current project.
5. Decisions are intentional project/design decisions, not suggestions.
6. Do not invent sources.
7. Only use source paths from AVAILABLE FILES.
8. Prefer no memory entry over a weak or uncertain entry.
9. Return at most 3 entries.
10. Return valid JSON only.

Return this format:

[
  {{
    "category": "architecture",
    "fact": "Short durable project fact.",
    "sources": [
      "path/to/file"
    ],
    "confidence": "confirmed"
  }}
]

If nothing should be remembered, return:

[]

USER QUESTION:

{query}

ASSISTANT ANSWER:

{answer}

AVAILABLE FILES:

{files_text}
"""

    response = client.responses.create(
        model="gpt-5.6-luna",
        input=prompt,
    )

    raw = response.output_text.strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []

    if not isinstance(data, list):
        return []

    valid_candidates = []

    allowed_categories = {
        "architecture",
        "decisions",
        "known_issues",
    }

    allowed_files = set(context_files)

    for candidate in data:

        if not isinstance(candidate, dict):
            continue

        category = candidate.get("category")
        fact = candidate.get("fact")
        sources = candidate.get("sources", [])

        if category not in allowed_categories:
            continue

        if not isinstance(fact, str):
            continue

        if not fact.strip():
            continue

        if not isinstance(sources, list):
            continue

        sources = [
            source
            for source in sources
            if source in allowed_files
        ]

        if not sources:
            continue

        valid_candidates.append({
            "category": category,
            "fact": fact.strip(),
            "sources": sources,
            "confidence": "confirmed",
        })

    return valid_candidates


def generate_code_changes(
    query: str,
    context: str,
    conversation: str,
    memory: str,
    git_status: str,
    git_diff: str,
) -> dict:

    prompt = f"""
You are preparing code changes for the SmartHome project.

The project uses primarily:

- Django
- Angular

Your task is to propose concrete project file changes.

IMPORTANT:

1. Do not modify files yourself.
2. Return valid JSON only.
3. Only modify files that are necessary.
4. Preserve existing project architecture and style.
5. Do not invent files unless they are genuinely needed.
6. Every changed file must contain its COMPLETE new content.
7. Do not include markdown code fences.
8. Do not include explanations outside JSON.
9. Never modify files outside the project.
10. Prefer small and focused changes.

Return:

{{
  "summary": "Short description of the proposed changes.",
  "changes": [
    {{
      "path": "relative/project/file.ts",
      "content": "complete new file content"
    }}
  ]
}}

If no safe change can be produced:

{{
  "summary": "Reason why no change can be proposed.",
  "changes": []
}}


PROJECT MEMORY:

{memory}


PREVIOUS CONVERSATION:

{conversation}


GIT STATUS:

{git_status}


CURRENT GIT DIFF:

{git_diff}


USER REQUEST:

{query}


PROJECT CONTEXT:

{context}
"""

    response = client.responses.create(
        model="gpt-5.6-luna",
        input=prompt,
    )

    raw = response.output_text.strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {
            "summary": (
                "The model returned invalid JSON."
            ),
            "changes": [],
        }

    if not isinstance(data, dict):
        return {
            "summary": "Invalid change response.",
            "changes": [],
        }

    changes = data.get(
        "changes",
        [],
    )

    if not isinstance(changes, list):
        changes = []

    return {
        "summary": data.get(
            "summary",
            "",
        ),
        "changes": changes,
    }
