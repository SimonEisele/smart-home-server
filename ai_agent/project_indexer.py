import json
from pathlib import Path

from project_scanner import scan_project, PROJECT_ROOT


AI_DIR = PROJECT_ROOT / ".ai"
INDEX_FILE = AI_DIR / "project_index.json"


def categorize_project_file(path: Path) -> tuple[str, str | None]:
    """
    Returns:
        (area, framework)

    Examples:
        ("backend", "Django")
        ("frontend", "Angular")
        ("documentation", None)
        ("configuration", None)
        ("other", None)
    """

    parts = path.parts

    if not parts:
        return "other", None

    # Django backend
    if parts[0] == "backend":
        return "backend", "Django"

    # Angular frontend
    if parts[0] == "frontend":
        return "frontend", "Angular"

    # Documentation
    if parts[0] == "docs":
        return "documentation", None

    # Root configuration
    if path.name in {
        ".gitignore",
        ".flake8",
    }:
        return "configuration", None

    return "other", None


def build_project_index():
    scanned_files = scan_project()

    index = {
        "project": {
            "name": PROJECT_ROOT.name,
            "root": str(PROJECT_ROOT),
        },
        "backend": {
            "framework": "Django",
            "files": [],
        },
        "frontend": {
            "framework": "Angular",
            "files": [],
        },
        "documentation": [],
        "configuration": [],
        "other": [],
    }

    for file_info in scanned_files:
        path = Path(file_info["path"])

        area, framework = categorize_project_file(path)

        file_entry = {
            "path": path.as_posix(),
            "type": file_info["category"],
        }

        if area == "backend":
            index["backend"]["files"].append(file_entry)

        elif area == "frontend":
            index["frontend"]["files"].append(file_entry)

        elif area == "documentation":
            index["documentation"].append(file_entry)

        elif area == "configuration":
            index["configuration"].append(file_entry)

        else:
            index["other"].append(file_entry)

    return index


def save_project_index(index):
    AI_DIR.mkdir(exist_ok=True)

    with INDEX_FILE.open("w", encoding="utf-8") as file:
        json.dump(
            index,
            file,
            indent=2,
            ensure_ascii=False,
        )


def main():
    index = build_project_index()
    save_project_index(index)

    print("Project index created:")
    print(INDEX_FILE)

    print()
    print(f"Backend files:       {len(index['backend']['files'])}")
    print(f"Frontend files:      {len(index['frontend']['files'])}")
    print(f"Documentation files: {len(index['documentation'])}")
    print(f"Configuration files: {len(index['configuration'])}")
    print(f"Other files:         {len(index['other'])}")


if __name__ == "__main__":
    main()
