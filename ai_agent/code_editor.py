from pathlib import Path
import difflib
import os
import tempfile

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

    if not isinstance(change, dict):
        return False, "Change must be an object."

    path = change.get("path")
    content = change.get("content")

    if not isinstance(path, str) or not path.strip():
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

    if target.exists() and not target.is_file():
        return False, "Target is not a regular file."

    return True, ""


def apply_changes(changes: list[dict]) -> list[str]:
    """Validate the entire batch before writing and roll back write failures."""
    if not isinstance(changes, list):
        raise ValueError("Changes must be a list.")

    prepared = []
    seen = set()
    for change in changes:
        valid, error = validate_change(change)
        if not valid:
            raise ValueError(error)
        path = resolve_project_file(change["path"])
        if path in seen:
            raise ValueError(f"Duplicate target: {change['path']}")
        seen.add(path)
        original = path.read_bytes() if path.exists() else None
        prepared.append((change, path, original))

    staged = []
    replaced = []
    created_directories = []
    try:
        # Stage every new file before replacing any existing content.
        for change, path, original in prepared:
            missing = []
            parent = path.parent
            while not parent.exists():
                missing.append(parent)
                parent = parent.parent
            for directory in reversed(missing):
                directory.mkdir()
                created_directories.append(directory)
            fd, temporary = tempfile.mkstemp(
                prefix=".ai-edit-", dir=path.parent,
            )
            temporary = Path(temporary)
            staged.append(temporary)
            with os.fdopen(fd, "wb") as file:
                file.write(change["content"].encode("utf-8"))
            if original is not None:
                temporary.chmod(path.stat().st_mode)

        for (_, path, original), temporary in zip(prepared, staged):
            os.replace(temporary, path)
            replaced.append((path, original))
    except Exception as error:
        rollback_errors = []
        for path, original in reversed(replaced):
            try:
                if original is None:
                    path.unlink()
                else:
                    path.write_bytes(original)
            except OSError as rollback_error:
                rollback_errors.append(f"{path}: {rollback_error}")
        if rollback_errors:
            raise RuntimeError(
                "Apply failed and rollback was incomplete: "
                + "; ".join(rollback_errors)
            ) from error
        raise
    finally:
        for temporary in staged:
            temporary.unlink(missing_ok=True)
        for directory in reversed(created_directories):
            try:
                directory.rmdir()
            except OSError:
                pass

    return [change["path"] for change, _, _ in prepared]


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
