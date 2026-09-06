import re
from pathlib import Path

from project_scanner import PROJECT_ROOT


SOURCE_EXTENSIONS = {
    ".py",
    ".ts",
}


def normalize_relative_path(path: Path) -> str:
    full_path = (PROJECT_ROOT / path).resolve()
    relative = full_path.relative_to(PROJECT_ROOT.resolve())

    return relative.as_posix()


def read_file(relative_path: str) -> str:
    path = PROJECT_ROOT / relative_path

    try:
        return path.read_text(
            encoding="utf-8",
            errors="ignore",
        )
    except OSError:
        return ""


def resolve_python_import(
    source_path: Path,
    import_name: str,
) -> str | None:
    """
    Tries to resolve relative Python imports such as:

        from .models import User
        from .serializers import LoginSerializer

    to actual project files.
    """

    source_directory = source_path.parent

    # Count leading dots
    dots = len(import_name) - len(import_name.lstrip("."))

    module_name = import_name.lstrip(".")

    target_directory = source_directory

    if dots > 1:
        for _ in range(dots - 1):
            target_directory = target_directory.parent

    if module_name:
        module_path = Path(*module_name.split("."))

        candidate = target_directory / module_path

        file_candidate = candidate.with_suffix(".py")

        if (PROJECT_ROOT / file_candidate).is_file():
            return normalize_relative_path(file_candidate.as_posix())

        init_candidate = candidate / "__init__.py"

        if (PROJECT_ROOT / init_candidate).is_file():
            return normalize_relative_path(init_candidate.as_posix())

    return None


def find_python_dependencies(
    relative_path: str,
) -> list[str]:
    path = Path(relative_path)
    content = read_file(relative_path)

    dependencies = set()

    # from .models import ...
    # from users.serializers import ...
    from_pattern = re.compile(
        r"^\s*from\s+([.\w]+)\s+import\s+",
        re.MULTILINE,
    )

    for match in from_pattern.finditer(content):
        import_name = match.group(1)

        resolved = resolve_python_import(
            path,
            import_name,
        )

        if resolved:
            dependencies.add(resolved)

    return sorted(dependencies)


def resolve_typescript_import(
    source_path: Path,
    import_path: str,
) -> str | None:
    """
    Resolves relative Angular/TypeScript imports such as:

        ../service/auth.service
        ./model/auth.model
    """

    if not import_path.startswith("."):
        return None

    source_directory = source_path.parent
    candidate = source_directory / import_path

    candidates = [
        Path(str(candidate) + ".ts"),
        candidate / "index.ts",
    ]

    for candidate_path in candidates:
        full_path = PROJECT_ROOT / candidate_path

        if full_path.is_file():
            return normalize_relative_path(candidate_path.as_posix())

    return None


def find_typescript_dependencies(
    relative_path: str,
) -> list[str]:
    path = Path(relative_path)
    content = read_file(relative_path)

    dependencies = set()

    import_pattern = re.compile(
        r"""from\s+['"]([^'"]+)['"]"""
    )

    for match in import_pattern.finditer(content):
        import_path = match.group(1)

        resolved = resolve_typescript_import(
            path,
            import_path,
        )

        if resolved:
            dependencies.add(resolved)

    return sorted(dependencies)


def find_dependencies(
    relative_path: str,
) -> list[str]:
    path = Path(relative_path)

    if path.suffix == ".py":
        return find_python_dependencies(relative_path)

    if path.suffix == ".ts":
        return find_typescript_dependencies(relative_path)

    return []


def main():
    relative_path = input("File: ")

    dependencies = find_dependencies(relative_path)

    print()
    print(f"Dependencies of: {relative_path}")
    print("=" * 70)

    if not dependencies:
        print("No local dependencies found.")
        return

    for dependency in dependencies:
        print(dependency)


if __name__ == "__main__":
    main()
