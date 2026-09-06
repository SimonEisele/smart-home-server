import json
import re
from pathlib import Path

from project_scanner import PROJECT_ROOT


INDEX_FILE = PROJECT_ROOT / ".ai" / "project_index.json"


def load_index():
    with INDEX_FILE.open("r", encoding="utf-8") as file:
        return json.load(file)


def get_all_files(index):
    files = []

    files.extend(index["backend"]["files"])
    files.extend(index["frontend"]["files"])
    files.extend(index["documentation"])
    files.extend(index["configuration"])
    files.extend(index["other"])

    return files


def tokenize(text: str) -> list[str]:
    return [
        token
        for token in re.split(r"[^a-zA-Z0-9]+", text.lower())
        if token
    ]


def read_file_content(relative_path: str) -> str:
    path = PROJECT_ROOT / relative_path

    try:
        return path.read_text(
            encoding="utf-8",
            errors="ignore",
        )
    except OSError:
        return ""


def score_file(file_info, query_tokens):
    path = file_info["path"]
    path_lower = path.lower()
    path_tokens = tokenize(path)
    filename = Path(path).name.lower()

    score = 0

    # -------------------------
    # Path / filename scoring
    # -------------------------

    for token in query_tokens:

        if token in path_tokens:
            score += 10

        elif token in path_lower:
            score += 5

        if token in filename:
            score += 10

    # -------------------------
    # Content scoring
    # -------------------------

    content = read_file_content(path)
    content_lower = content.lower()

    for token in query_tokens:
        occurrences = content_lower.count(token)

        if occurrences > 0:
            # Reward content matches, but cap them so that
            # one huge file cannot dominate the ranking.
            score += min(occurrences, 5) * 2

    # -------------------------
    # File type bonuses
    # -------------------------

    if file_info["type"] == "documentation":
        score += 3

    if ".spec." in path_lower or "tests.py" in path_lower:
        score -= 20

    if "/migrations/" in path_lower:
        score -= 25

    return score


QUERY_ALIASES = {
    # bestehende Einträge ...

    "rezept": [
        "recipe",
        "recipes",
    ],

    "rezepte": [
        "recipe",
        "recipes",
    ],

    "rezeptseite": [
        "recipe",
        "recipes",
        "recipes.ts",
    ],

    "menüplan": [
        "menuplan",
    ],

    "menuplan": [
        "menuplan",
    ],

    "kochen": [
        "cook",
        "cooking",
    ],

    "koch": [
        "cook",
        "cooking",
    ],

    "koch-popup": [
        "cook",
        "cooking",
        "overlay",
        "recipecook",
    ],

    "popup": [
        "overlay",
        "popover",
        "dialog",
    ],
}


def expand_query_tokens(tokens: list[str]) -> list[str]:
    expanded = set(tokens)

    for token in tokens:
        aliases = QUERY_ALIASES.get(token, [])

        for alias in aliases:
            expanded.add(alias)

    return list(expanded)


def search_files(query: str, limit: int = 10):
    index = load_index()
    files = get_all_files(index)

    query_tokens = expand_query_tokens(tokenize(query))

    results = []

    for file_info in files:
        score = score_file(file_info, query_tokens)

        if score > 0:
            results.append({
                "path": file_info["path"],
                "type": file_info["type"],
                "score": score,
            })

    results.sort(
        key=lambda result: result["score"],
        reverse=True,
    )

    return results[:limit]


def main():
    query = input("Search project: ")

    results = search_files(query)

    print()
    print(f"Results for: {query}")
    print("=" * 60)

    for result in results:
        print(
            f"{result['score']:>3}  "
            f"{result['type']:<15} "
            f"{result['path']}"
        )


if __name__ == "__main__":
    main()
