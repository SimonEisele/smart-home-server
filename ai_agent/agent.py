from pathlib import Path

from dependency_search import find_dependencies
from file_search import search_files
from git_service import (
    get_git_diff,
    get_git_status_text,
    get_staged_diff,
)
from llm_client import (
    ask_llm,
    extract_memory_candidates,
    generate_code_changes,
    rewrite_search_query,
)
from project_memory import (
    load_memory,
    memory_to_text,
)
from project_scanner import PROJECT_ROOT


MAX_INITIAL_FILES = 8
MAX_CONTEXT_FILES = 20
MAX_CHARS_PER_FILE = 12_000

DEPENDENCY_DEPTH = 2

MIN_DIRECTORY_EXPANSION_SCORE = 55

RELATED_EXTENSIONS = {
    ".py",
    ".ts",
}


# =========================================================
# File reading
# =========================================================

def read_file(
    relative_path: str,
) -> str:
    """
    Read a project file safely.

    The returned content is limited so a single large file
    cannot consume the complete LLM context.
    """

    path = (
        PROJECT_ROOT
        / relative_path
    ).resolve()

    project_root = (
        PROJECT_ROOT.resolve()
    )

    try:
        path.relative_to(project_root)
    except ValueError:
        return ""

    if not path.exists():
        return ""

    if not path.is_file():
        return ""

    try:
        content = path.read_text(
            encoding="utf-8",
            errors="ignore",
        )
    except OSError:
        return ""

    return content[
        :MAX_CHARS_PER_FILE
    ]


# =========================================================
# Conversation context
# =========================================================

def conversation_to_text(
    messages: list[dict],
    max_messages: int = 10,
) -> str:
    """
    Convert recent Streamlit chat history into LLM context.
    """

    if not messages:
        return "No previous conversation."

    recent_messages = messages[
        -max_messages:
    ]

    parts = []

    for message in recent_messages:

        role = message.get(
            "role",
            "unknown",
        )

        content = message.get(
            "content",
            "",
        )

        if role == "user":
            label = "USER"

        elif role == "assistant":
            label = "ASSISTANT"

        else:
            label = role.upper()

        parts.append(
            f"{label}:\n{content}"
        )

    return "\n\n".join(
        parts
    )


# =========================================================
# Retrieval expansion
# =========================================================

def find_angular_feature_files(
    relative_path: str,
) -> list[str]:
    """
    If a file belongs to an Angular feature, include the
    feature's main component files.

    Example:

    frontend/src/app/features/recipes/service/recipes.service.ts

    -> frontend/src/app/features/recipes/recipes.ts
    -> frontend/src/app/features/recipes/recipes.html
    -> frontend/src/app/features/recipes/recipes.css
    """

    path = Path(relative_path)

    parts = path.parts

    try:
        features_index = parts.index(
            "features"
        )
    except ValueError:
        return []

    # Need at least:
    # features / recipes / ...
    if len(parts) <= features_index + 1:
        return []

    feature_name = parts[
        features_index + 1
    ]

    feature_root_parts = parts[
        :features_index + 2
    ]

    feature_root = Path(
        *feature_root_parts
    )

    candidates = [
        feature_root / f"{feature_name}.ts",
        feature_root / f"{feature_name}.html",
        feature_root / f"{feature_name}.scss",
        feature_root / f"{feature_name}.css",
    ]

    results = []

    for candidate in candidates:

        full_path = (
            PROJECT_ROOT
            / candidate
        )

        if not full_path.is_file():
            continue

        results.append(
            candidate.as_posix()
        )

    return results


def find_angular_companion_files(
    relative_path: str,
) -> list[str]:
    """
    Find Angular template/style files belonging to a
    TypeScript component.

    Example:

    recipes.ts
        -> recipes.html
        -> recipes.scss
        -> recipes.css

    menuplan.widget.ts
        -> menuplan.widget.html
        -> menuplan.widget.scss
    """

    path = Path(relative_path)

    if path.suffix.lower() != ".ts":
        return []

    parent = (
        PROJECT_ROOT
        / path.parent
    )

    if not parent.exists():
        return []

    stem = path.stem

    candidate_names = [
        f"{stem}.html",
        f"{stem}.scss",
        f"{stem}.css",
    ]

    companions = []

    for name in candidate_names:

        candidate = (
            parent
            / name
        )

        if not candidate.is_file():
            continue

        try:
            relative = (
                candidate
                .relative_to(PROJECT_ROOT)
                .as_posix()
            )

        except ValueError:
            continue

        companions.append(
            relative
        )

    return companions


def expand_related_files(
    initial_results: list[dict],
    max_files: int = MAX_CONTEXT_FILES,
) -> list[dict]:
    """
    Expand retrieval results with:

    1. Initial search results
    2. Angular companion files
    3. Dependencies over multiple levels
    4. Strongly related sibling source files
    """

    selected = []
    selected_paths = set()

    def add_file(
        path: str,
        file_type: str,
        score: int,
    ) -> bool:
        """
        Add a file if it has not already been selected.

        Returns True when the file was newly added.
        """

        normalized = (
            Path(path)
            .as_posix()
        )

        if normalized in selected_paths:
            return False

        full_path = (
            PROJECT_ROOT
            / normalized
        )

        if not full_path.is_file():
            return False

        selected_paths.add(
            normalized
        )

        selected.append({
            "path": normalized,
            "type": file_type,
            "score": score,
        })

        return True

    # =====================================================
    # 1. Initial search results
    # =====================================================

    for result in initial_results:

        add_file(
            path=result["path"],
            file_type=result.get(
                "type",
                "source",
            ),
            score=result.get(
                "score",
                0,
            ),
        )

        if len(selected) >= max_files:
            return selected

    # =====================================================
    # 2. Angular feature entry files
    # =====================================================

    current_files = list(
        selected
    )

    for result in current_files:

        feature_files = (
            find_angular_feature_files(
                result["path"]
            )
        )

        for feature_file in feature_files:

            add_file(
                path=feature_file,
                file_type="feature",
                score=max(
                    result["score"] - 1,
                    1,
                ),
            )

            if len(selected) >= max_files:
                return selected

    # =====================================================
    # 3. Angular companion files
    # =====================================================

    current_files = list(
        selected
    )

    for result in current_files:

        companions = (
            find_angular_companion_files(
                result["path"]
            )
        )

        for companion in companions:

            add_file(
                path=companion,
                file_type="companion",
                score=max(
                    result["score"] - 1,
                    1,
                ),
            )

            if len(selected) >= max_files:
                return selected

    # =====================================================
    # 4. Dependencies
    #
    # Follow dependencies more than one level.
    #
    # Example:
    #
    # menuplan.widget.ts
    #      ↓
    # recipe-cook.service.ts
    #      ↓
    # recipe-cook-overlay.ts
    #
    # =====================================================

    dependency_frontier = list(
        selected
    )

    for depth in range(
        DEPENDENCY_DEPTH
    ):

        next_frontier = []

        for result in dependency_frontier:

            path = result[
                "path"
            ]

            if not path.endswith(
                (
                    ".py",
                    ".ts",
                )
            ):
                continue

            dependencies = (
                find_dependencies(
                    path
                )
            )

            for dependency in dependencies:

                added = add_file(
                    path=dependency,
                    file_type="dependency",
                    score=max(
                        result["score"]
                        - 2
                        - depth,
                        1,
                    ),
                )

                if added:

                    dependency_result = {
                        "path": (
                            Path(dependency)
                            .as_posix()
                        ),
                        "type": "dependency",
                        "score": max(
                            result["score"]
                            - 2
                            - depth,
                            1,
                        ),
                    }

                    next_frontier.append(
                        dependency_result
                    )

                    # ---------------------------------------------
                    # Angular feature entry files
                    # ---------------------------------------------

                    feature_files = (
                        find_angular_feature_files(
                            dependency
                        )
                    )

                    for feature_file in feature_files:

                        add_file(
                            path=feature_file,
                            file_type="feature",
                            score=max(
                                result["score"]
                                - 2
                                - depth,
                                1,
                            ),
                        )

                        if len(selected) >= max_files:
                            return selected

                    # ---------------------------------------------
                    # Angular companion files
                    # ---------------------------------------------

                    companions = (
                        find_angular_companion_files(
                            dependency
                        )
                    )

                    for companion in companions:

                        add_file(
                            path=companion,
                            file_type="companion",
                            score=max(
                                result["score"]
                                - 3
                                - depth,
                                1,
                            ),
                        )

                        if len(selected) >= max_files:
                            return selected

                if len(selected) >= max_files:
                    return selected

        dependency_frontier = (
            next_frontier
        )

        if not dependency_frontier:
            break

    # =====================================================
    # 5. Strong sibling files
    # =====================================================

    current_files = list(
        selected
    )

    for result in current_files:

        if (
            result.get(
                "score",
                0,
            )
            < MIN_DIRECTORY_EXPANSION_SCORE
        ):
            continue

        path = Path(
            result["path"]
        )

        parent = (
            PROJECT_ROOT
            / path.parent
        )

        if not parent.exists():
            continue

        try:
            candidates = list(
                parent.iterdir()
            )

        except OSError:
            continue

        for candidate in candidates:

            if not candidate.is_file():
                continue

            if (
                candidate.suffix.lower()
                not in RELATED_EXTENSIONS
            ):
                continue

            # Specs are usually less important for
            # implementation context.
            if ".spec." in candidate.name.lower():
                continue

            try:
                relative = (
                    candidate
                    .relative_to(
                        PROJECT_ROOT
                    )
                    .as_posix()
                )

            except ValueError:
                continue

            added = add_file(
                path=relative,
                file_type="related",
                score=max(
                    result["score"] - 4,
                    1,
                ),
            )

            if added:

                companions = (
                    find_angular_companion_files(
                        relative
                    )
                )

                for companion in companions:

                    add_file(
                        path=companion,
                        file_type="companion",
                        score=max(
                            result["score"] - 5,
                            1,
                        ),
                    )

            if len(selected) >= max_files:
                return selected

    return selected


# =========================================================
# Project context
# =========================================================

def build_context(
    search_query: str,
) -> tuple[str, list[dict]]:
    """
    Search project files and build the textual context
    supplied to the LLM.
    """

    initial_results = search_files(
        search_query,
        limit=MAX_INITIAL_FILES,
    )

    results = expand_related_files(
        initial_results,
        max_files=MAX_CONTEXT_FILES,
    )

    context_parts = []

    for result in results:

        path = result[
            "path"
        ]

        content = read_file(
            path
        )

        if not content:
            continue

        print(
            f"Context: {path} "
            f"({len(content):,} chars)"
        )

        context_parts.append(
            f"""
==============================
FILE: {path}
==============================

{content}
"""
        )

    if not context_parts:
        return (
            "No relevant project files were found.",
            results,
        )

    return (
        "\n".join(context_parts),
        results,
    )


# =========================================================
# Analysis prompt
# =========================================================

def build_prompt(
    query: str,
    context: str,
    conversation: str = "",
    memory: str = "",
    git_status: str = "",
    git_diff: str = "",
    staged_diff: str = "",
) -> str:
    """
    Build the main read-only coding-assistant prompt.
    """

    return f"""
You are the coding assistant for the SmartHome project.

The project consists primarily of:

- Django backend
- Angular frontend
- project documentation

You receive several information sources:

1. CURRENT PROJECT CONTEXT
2. GIT STATUS
3. UNSTAGED GIT DIFF
4. STAGED GIT DIFF
5. PROJECT MEMORY
6. PREVIOUS CONVERSATION

SOURCE PRIORITY:

CURRENT PROJECT CONTEXT
>
GIT STATUS / GIT DIFF
>
PROJECT MEMORY
>
PREVIOUS CONVERSATION

Important rules:

1. Current project files are the primary source of truth.
2. GIT STATUS shows changed, staged, deleted and untracked files.
3. UNSTAGED GIT DIFF shows unstaged changes to tracked files.
4. STAGED GIT DIFF shows staged changes.
5. An untracked file can appear in GIT STATUS without appearing in a diff.
6. If the user asks what is not committed, always consider GIT STATUS.
7. Clearly distinguish between:
   - current code
   - uncommitted changes
   - recommendations
8. If project memory conflicts with current code, trust the current code.
9. Project memory may contain established architecture,
   decisions and known issues.
10. Previous assistant statements are not guaranteed facts.
11. Do not invent project behavior.
12. Mention relevant file paths where appropriate.
13. If the supplied context is insufficient, say so.
14. Prefer understanding existing architecture before recommending changes.
15. You are currently read-only and must not claim to have modified files.


PROJECT MEMORY:

{memory}


PREVIOUS CONVERSATION:

{conversation}


GIT STATUS:

{git_status}


UNSTAGED GIT DIFF:

{git_diff}


STAGED GIT DIFF:

{staged_diff}


USER QUESTION:

{query}


CURRENT PROJECT CONTEXT:

{context}
"""


# =========================================================
# Shared context preparation
# =========================================================

def prepare_agent_context(
    query: str,
    messages: list[dict] | None = None,
) -> dict:
    """
    Prepare all shared information needed by analysis and
    code-change modes.
    """

    conversation = (
        conversation_to_text(
            messages or []
        )
    )

    search_query = (
        rewrite_search_query(
            query=query,
            conversation=conversation,
        )
    )

    print()
    print(
        f"Retrieval query: "
        f"{search_query}"
    )

    context, results = (
        build_context(
            search_query
        )
    )

    memory_data = (
        load_memory()
    )

    memory = memory_to_text(
        memory_data
    )

    git_status = (
        get_git_status_text()
    )

    git_diff = (
        get_git_diff()
    )

    staged_diff = (
        get_staged_diff()
    )

    return {
        "conversation": conversation,
        "search_query": search_query,
        "context": context,
        "results": results,
        "memory": memory,
        "git_status": git_status,
        "git_diff": git_diff,
        "staged_diff": staged_diff,
    }


# =========================================================
# Analysis mode
# =========================================================

def get_project_answer(
    query: str,
    messages: list[dict] | None = None,
) -> tuple[
    str,
    list[dict],
    str,
    list[dict],
]:
    """
    Answer a project question without modifying files.
    """

    prepared = (
        prepare_agent_context(
            query=query,
            messages=messages,
        )
    )

    prompt = build_prompt(
        query=query,
        context=prepared[
            "context"
        ],
        conversation=prepared[
            "conversation"
        ],
        memory=prepared[
            "memory"
        ],
        git_status=prepared[
            "git_status"
        ],
        git_diff=prepared[
            "git_diff"
        ],
        staged_diff=prepared[
            "staged_diff"
        ],
    )

    answer = ask_llm(
        prompt
    )

    context_files = [
        result["path"]
        for result
        in prepared["results"]
    ]

    memory_candidates = (
        extract_memory_candidates(
            query=query,
            answer=answer,
            context_files=context_files,
        )
    )

    return (
        answer,
        prepared["results"],
        prepared["search_query"],
        memory_candidates,
    )


# =========================================================
# Code-change mode
# =========================================================

def propose_project_changes(
    query: str,
    messages: list[dict] | None = None,
) -> tuple[
    dict,
    list[dict],
    str,
]:
    """
    Generate proposed project-file changes.

    Nothing is written here. The UI must explicitly approve
    and apply the returned changes through code_editor.py.
    """

    prepared = (
        prepare_agent_context(
            query=query,
            messages=messages,
        )
    )

    proposal = (
        generate_code_changes(
            query=query,
            context=prepared[
                "context"
            ],
            conversation=prepared[
                "conversation"
            ],
            memory=prepared[
                "memory"
            ],
            git_status=prepared[
                "git_status"
            ],
            git_diff=prepared[
                "git_diff"
            ],
        )
    )

    return (
        proposal,
        prepared["results"],
        prepared["search_query"],
    )


# =========================================================
# Optional console interface
# =========================================================

def ask_project(
    query: str,
) -> None:
    """
    Simple console interface for debugging.
    """

    (
        answer,
        results,
        search_query,
        memory_candidates,
    ) = get_project_answer(
        query
    )

    print()
    print("=" * 70)
    print("RETRIEVAL QUERY")
    print("=" * 70)
    print(search_query)

    print()
    print("=" * 70)
    print("SELECTED FILES")
    print("=" * 70)

    for result in results:

        print(
            f"{result.get('score', 0):>3}  "
            f"{result.get('path', '')}"
        )

    print()
    print("=" * 70)
    print("ANSWER")
    print("=" * 70)
    print(answer)

    if memory_candidates:

        print()
        print("=" * 70)
        print("MEMORY CANDIDATES")
        print("=" * 70)

        for candidate in (
            memory_candidates
        ):

            print(
                candidate
            )


# =========================================================
# Console entry point
# =========================================================

if __name__ == "__main__":

    while True:

        try:
            query = input(
                "\nSmartHome > "
            ).strip()

        except (
            KeyboardInterrupt,
            EOFError,
        ):
            print()
            break

        if not query:
            continue

        if query.lower() in {
            "exit",
            "quit",
            "q",
        }:
            break

        ask_project(
            query
        )
