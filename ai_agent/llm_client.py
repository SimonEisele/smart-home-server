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
    current_memory: str,
) -> list[dict]:

    context_file_text = "\n".join(
        f"- {path}"
        for path in context_files
    )

    prompt = f"""
You are maintaining durable project memory for the SmartHome project.

Your task is to identify project facts that should be stored,
or existing known issues that are clearly resolved.

Only use information supported by the CURRENT PROJECT FILES
and the agent answer.

CURRENT PROJECT MEMORY:

{current_memory}


USER QUESTION:

{query}


AGENT ANSWER:

{answer}


CURRENT CONTEXT FILES:

{context_file_text}


Allowed actions:

1. "add"
   Use this for a new durable project fact.

2. "resolve"
   Use this only when the CURRENT PROJECT CODE clearly shows
   that an existing known issue is no longer true.


Allowed categories:

- architecture
- decisions
- known_issues


Rules:

1. Only store durable project information.
2. Do not store temporary implementation details.
3. Do not store recommendations as facts.
4. Do not store facts that are uncertain.
5. Sources must only contain files from CURRENT CONTEXT FILES.
6. Return at most 3 candidates.
7. Return valid JSON only.
8. Do not include markdown code fences.
9. For "resolve", category must be "known_issues".
10. For "resolve", fact must exactly match the existing memory fact.
11. Never resolve an issue just because the assistant recommended a fix.
12. Only resolve an issue if current project code clearly contradicts it.


Return this structure:

[
    {{
        "action": "add",
        "category": "architecture",
        "fact": "...",
        "sources": ["..."],
        "confidence": "confirmed"
    }},
    {{
        "action": "resolve",
        "category": "known_issues",
        "fact": "Exact existing memory fact",
        "sources": ["..."],
        "confidence": "confirmed"
    }}
]

If there are no useful candidates, return:

[]
"""

    response = client.responses.create(
        model="gpt-5.6-luna",
        input=prompt,
    )

    raw = response.output_text.strip()

    try:
        data = json.loads(
            raw
        )

    except json.JSONDecodeError:
        return []

    if not isinstance(
        data,
        list,
    ):
        return []

    valid_candidates = []

    allowed_categories = {
        "architecture",
        "decisions",
        "known_issues",
    }

    allowed_actions = {
        "add",
        "resolve",
    }

    allowed_sources = set(
        context_files
    )

    for candidate in data[:3]:

        if not isinstance(
            candidate,
            dict,
        ):
            continue

        action = candidate.get(
            "action",
            "add",
        )

        category = candidate.get(
            "category",
            "",
        )

        fact = candidate.get(
            "fact",
            "",
        )

        sources = candidate.get(
            "sources",
            [],
        )

        confidence = candidate.get(
            "confidence",
            "confirmed",
        )

        if action not in allowed_actions:
            continue

        if category not in allowed_categories:
            continue

        if (
            action == "resolve"
            and category != "known_issues"
        ):
            continue

        if not isinstance(
            fact,
            str,
        ):
            continue

        fact = fact.strip()

        if not fact:
            continue

        if not isinstance(
            sources,
            list,
        ):
            continue

        valid_sources = [
            source
            for source in sources
            if (
                isinstance(
                    source,
                    str,
                )
                and source in allowed_sources
            )
        ]

        if not valid_sources:
            continue

        valid_candidates.append({
            "action": action,
            "category": category,
            "fact": fact,
            "sources": sorted(
                set(valid_sources)
            ),
            "confidence": confidence,
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
