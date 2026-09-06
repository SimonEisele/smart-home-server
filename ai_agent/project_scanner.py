from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent


IGNORED_DIRECTORIES = {
    ".git",
    ".venv",
    "venv",
    "node_modules",
    "__pycache__",
    ".angular",
    "dist",
    "build",
    ".ai",
    "ai_agent",
}


IGNORED_FILES = {
    "db.sqlite3",
}


IMPORTANT_EXTENSIONS = {
    ".py",
    ".ts",
    ".html",
    ".css",
    ".scss",
    ".md",
    ".json",
    ".txt",
    ".yml",
    ".yaml",
    ".toml",
}


IMPORTANT_FILES = {
    ".gitignore",
    ".flake8",
    "package.json",
    "package-lock.json",
    "angular.json",
    "requirements.txt",
}


def is_ignored(path: Path) -> bool:
    if path.name in IGNORED_FILES:
        return True

    if any(part in IGNORED_DIRECTORIES for part in path.parts):
        return True

    relative_path = path.relative_to(PROJECT_ROOT)

    # Angular build output copied into Django
    if relative_path.parts[:3] == (
        "backend",
        "templates",
        "frontend",
    ):
        return True

    return False


def classify_file(path: Path) -> str:
    relative_path = path.relative_to(PROJECT_ROOT)

    if "docs" in relative_path.parts:
        return "documentation"

    if path.name in IMPORTANT_FILES:
        return "configuration"

    if path.suffix in IMPORTANT_EXTENSIONS:
        return "source"

    return "other"


def scan_project():
    files = []

    for path in PROJECT_ROOT.rglob("*"):
        if not path.is_file():
            continue

        if is_ignored(path):
            continue

        category = classify_file(path)

        files.append({
            "path": path.relative_to(PROJECT_ROOT),
            "category": category,
        })

    return sorted(files, key=lambda x: str(x["path"]))


def main():
    print("SmartHome Project")
    print("=================\n")

    files = scan_project()

    categories = {
        "source": [],
        "documentation": [],
        "configuration": [],
        "other": [],
    }

    for file in files:
        categories[file["category"]].append(file["path"])

    for category, category_files in categories.items():
        print(f"\n{category.upper()}")
        print("-" * len(category))

        for file in category_files:
            print(file)

    print(f"\nTotal: {len(files)} files")


if __name__ == "__main__":
    main()
