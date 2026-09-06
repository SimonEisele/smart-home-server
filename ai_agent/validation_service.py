import os
import subprocess
from dataclasses import dataclass

from project_scanner import PROJECT_ROOT


NPM_COMMAND = (
    "npm.cmd"
    if os.name == "nt"
    else "npm"
)


@dataclass
class ValidationCommand:
    key: str
    label: str
    command: list[str]
    cwd: str


VALIDATION_COMMANDS = {
    "django_check": ValidationCommand(
        key="django_check",
        label="Django Check",
        command=[
            "python",
            "manage.py",
            "check",
        ],
        cwd="backend",
    ),

    "django_tests": ValidationCommand(
        key="django_tests",
        label="Django Tests",
        command=[
            "python",
            "manage.py",
            "test",
        ],
        cwd="backend",
    ),

    "angular_build": ValidationCommand(
        key="angular_build",
        label="Angular Build",
        command=[
            "npm.cmd",
            "run",
            "build",
        ],
        cwd="frontend",
    ),


    "angular_tests": ValidationCommand(
        key="angular_tests",
        label="Angular Tests",
        command=[
            "npm.cmd",
            "test",
            "--",
            "--watch=false",
        ],
        cwd="frontend",
    ),
}


def get_validation_commands() -> list[ValidationCommand]:
    return list(
        VALIDATION_COMMANDS.values()
    )


def run_validation(
    key: str,
    timeout: int = 120,
) -> dict:

    validation = (
        VALIDATION_COMMANDS.get(key)
    )

    if validation is None:
        return {
            "success": False,
            "label": key,
            "command": "",
            "returncode": -1,
            "stdout": "",
            "stderr": (
                "Unknown validation command."
            ),
        }

    working_directory = (
        PROJECT_ROOT
        / validation.cwd
    ).resolve()

    try:
        result = subprocess.run(
            validation.command,
            cwd=working_directory,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
            timeout=timeout,
        )

    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "label": validation.label,
            "command": " ".join(
                validation.command
            ),
            "returncode": -1,
            "stdout": "",
            "stderr": (
                f"Command timed out after "
                f"{timeout} seconds."
            ),
        }

    except OSError as exc:
        return {
            "success": False,
            "label": validation.label,
            "command": " ".join(
                validation.command
            ),
            "returncode": -1,
            "stdout": "",
            "stderr": str(exc),
        }

    return {
        "success": (
            result.returncode == 0
        ),
        "label": validation.label,
        "command": " ".join(
            validation.command
        ),
        "returncode": result.returncode,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
    }


def validation_results_to_text(
    results: list[dict],
) -> str:
    if not results:
        return "No validation results available."

    parts = []

    for result in results:
        parts.append(
            f"""
VALIDATION: {result.get("label", "Validation")}
SUCCESS: {result.get("success", False)}
COMMAND: {result.get("command", "")}
EXIT CODE: {result.get("returncode", -1)}

STDOUT:
{result.get("stdout", "")}

STDERR:
{result.get("stderr", "")}
""".strip()
        )

    return "\n\n".join(parts)
