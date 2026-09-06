import json
from copy import deepcopy

from project_scanner import PROJECT_ROOT


MEMORY_FILE = PROJECT_ROOT / ".ai" / "project_memory.json"


DEFAULT_MEMORY = {
    "architecture": [],
    "decisions": [],
    "known_issues": [],
}


def load_memory() -> dict:
    if not MEMORY_FILE.exists():
        return deepcopy(DEFAULT_MEMORY)

    try:
        with MEMORY_FILE.open(
            "r",
            encoding="utf-8",
        ) as file:
            data = json.load(file)

    except (
        OSError,
        json.JSONDecodeError,
    ):
        return deepcopy(DEFAULT_MEMORY)

    for key in DEFAULT_MEMORY:
        data.setdefault(key, [])

    return data


def save_memory(memory: dict) -> None:
    MEMORY_FILE.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with MEMORY_FILE.open(
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            memory,
            file,
            indent=2,
            ensure_ascii=False,
        )


def add_memory_entry(
    category: str,
    fact: str,
    sources: list[str],
    confidence: str = "confirmed",
) -> bool:

    memory = load_memory()

    if category not in memory:
        raise ValueError(
            f"Unknown memory category: {category}"
        )

    normalized_fact = fact.strip().lower()

    for entry in memory[category]:
        if (
            entry.get("fact", "")
            .strip()
            .lower()
            == normalized_fact
            and entry.get(
                "status",
                "active",
            ) == "active"
        ):
            return False

    memory[category].append({
        "fact": fact.strip(),
        "sources": sorted(set(sources)),
        "confidence": confidence,
        "status": "active",
    })

    save_memory(memory)

    return True


def resolve_memory_entry(
    category: str,
    fact: str,
) -> bool:

    memory = load_memory()

    if category not in memory:
        return False

    normalized_fact = (
        fact.strip().lower()
    )

    for entry in memory[category]:

        if (
            entry.get("fact", "")
            .strip()
            .lower()
            == normalized_fact
        ):

            entry["status"] = "resolved"

            save_memory(
                memory
            )

            return True

    return False


def memory_to_text(
    memory: dict,
) -> str:

    parts = []

    for category in (
        "architecture",
        "decisions",
        "known_issues",
    ):

        entries = [
            entry
            for entry in memory.get(
                category,
                [],
            )
            if entry.get(
                "status",
                "active",
            ) == "active"
        ]

        if not entries:
            continue

        parts.append(
            category.upper().replace(
                "_",
                " ",
            )
        )

        for entry in entries:

            fact = entry.get(
                "fact",
                "",
            )

            confidence = entry.get(
                "confidence",
                "unknown",
            )

            sources = entry.get(
                "sources",
                [],
            )

            source_text = ", ".join(
                sources
            )

            parts.append(
                f"- {fact}\n"
                f"  confidence: {confidence}\n"
                f"  sources: {source_text}"
            )

    if not parts:
        return (
            "No project memory available."
        )

    return "\n".join(
        parts
    )
