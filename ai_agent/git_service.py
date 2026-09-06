import subprocess

from project_scanner import PROJECT_ROOT


def run_git_command(
    args: list[str],
) -> tuple[bool, str]:

    try:
        result = subprocess.run(
            ["git", *args],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
            timeout=10,
        )

    except (
        OSError,
        subprocess.TimeoutExpired,
    ):
        return False, ""

    output = result.stdout.strip()

    if result.returncode != 0:
        return False, result.stderr.strip()

    return True, output


def get_current_branch() -> str:
    success, output = run_git_command([
        "branch",
        "--show-current",
    ])

    if not success or not output:
        return "unknown"

    return output


def get_git_status() -> list[dict]:
    success, output = run_git_command([
        "status",
        "--short",
    ])

    if not success:
        return []

    changes = []

    for line in output.splitlines():

        if len(line) < 4:
            continue

        status = line[:2]
        path = line[3:]

        changes.append({
            "status": status,
            "path": path,
        })

    return changes


def get_git_status_text() -> str:
    success, output = run_git_command([
        "status",
        "--short",
    ])

    if not success:
        return ""

    return output


def get_git_diff() -> str:
    success, output = run_git_command([
        "diff",
        "--",
        ".",
    ])

    if not success:
        return ""

    return output


def get_staged_diff() -> str:
    success, output = run_git_command([
        "diff",
        "--cached",
    ])

    if not success:
        return ""

    return output


def get_last_commit() -> str:
    success, output = run_git_command([
        "log",
        "-1",
        "--pretty=format:%h %s",
    ])

    if not success:
        return "unknown"

    return output


def get_project_git_info() -> dict:
    changes = get_git_status()

    return {
        "branch": get_current_branch(),
        "last_commit": get_last_commit(),
        "changes": changes,
        "change_count": len(changes),
    }
