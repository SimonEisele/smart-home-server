from pathlib import Path
import difflib

from project_scanner import PROJECT_ROOT


ALLOWED_EXTENSIONS = {
    ".py",
    ".ts",
    ".html",
    ".css",
    ".scss",
    ".md",
    ".json",
    ".yml",
    ".yaml",
    ".toml",
}


def resolve_project_file(
    relative_path: str,
) -> Path:
    """
    Resolve a path safely inside the project.
    """

    candidate = (
        PROJECT_ROOT
        / relative_path
    ).resolve()

    root = PROJECT_ROOT.resolve()

    try:
        candidate.relative_to(root)
    except ValueError:
        raise ValueError(
            "Path points outside project root."
        )

    return candidate


def validate_change(
    change: dict,
) -> tuple[bool, str]:

    path = change.get("path")
    content = change.get("content")

    if not isinstance(path, str):
        return False, "Missing path."

    if not isinstance(content, str):
        return False, "Missing content."

    try:
        target = resolve_project_file(path)
    except ValueError as error:
        return False, str(error)

    if target.suffix.lower() not in ALLOWED_EXTENSIONS:
        return (
            False,
            f"File type not allowed: {target.suffix}",
        )

    return True, ""


def apply_changes(
    changes: list[dict],
) -> list[str]:
    """
    Apply approved changes to project files.
    """

    written_files = []

    for change in changes:

        valid, error = validate_change(
            change
        )

        if not valid:
            raise ValueError(error)

        path = resolve_project_file(
            change["path"]
        )

        path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        path.write_text(
            change["content"],
            encoding="utf-8",
        )

        written_files.append(
            change["path"]
        )

    return written_files


def build_change_diff(
    change: dict,
) -> str:

    path = resolve_project_file(
        change["path"]
    )

    if path.exists():
        old_content = path.read_text(
            encoding="utf-8",
            errors="ignore",
        )
    else:
        old_content = ""

    new_content = change[
        "content"
    ]

    diff = difflib.unified_diff(
        old_content.splitlines(
            keepends=True
        ),
        new_content.splitlines(
            keepends=True
        ),
        fromfile=(
            f"a/{change['path']}"
        ),
        tofile=(
            f"b/{change['path']}"
        ),
    )

    return "".join(diff)
