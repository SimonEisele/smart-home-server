import json

import streamlit as st

from agent import (
    get_project_answer,
    propose_project_changes,
)
from code_editor import (
    apply_changes,
    build_change_diff,
    validate_change,
)
from git_service import (
    get_project_git_info,
    get_git_diff,
    get_staged_diff,
)
from project_memory import (
    load_memory,
    add_memory_entry,
    resolve_memory_entry,
)
from project_scanner import PROJECT_ROOT
from validation_service import (
    get_validation_commands,
    run_validation,
)

if "validation_results" not in st.session_state:
    st.session_state.validation_results = []

if "last_written_files" not in st.session_state:
    st.session_state.last_written_files = []

# =========================================================
# Page configuration
# =========================================================

st.set_page_config(
    page_title="SmartHome AI",
    page_icon="🤖",
    layout="wide",
)


# =========================================================
# Session state
# =========================================================

if "messages" not in st.session_state:
    st.session_state.messages = []

if "memory_candidates" not in st.session_state:
    st.session_state.memory_candidates = []

if "last_results" not in st.session_state:
    st.session_state.last_results = []

if "last_search_query" not in st.session_state:
    st.session_state.last_search_query = ""

if "candidate_feedback" not in st.session_state:
    st.session_state.candidate_feedback = {}

if "agent_mode" not in st.session_state:
    st.session_state.agent_mode = "Analyse"

if "pending_changes" not in st.session_state:
    st.session_state.pending_changes = []

if "pending_change_summary" not in st.session_state:
    st.session_state.pending_change_summary = ""


# =========================================================
# General helpers
# =========================================================

def reset_conversation():
    """
    Reset the current conversation and temporary agent state.
    Persistent project memory is NOT deleted.
    """

    st.session_state.messages = []
    st.session_state.memory_candidates = []
    st.session_state.last_results = []
    st.session_state.last_search_query = ""
    st.session_state.candidate_feedback = {}

    st.session_state.pending_changes = []
    st.session_state.pending_change_summary = ""

    st.session_state.validation_results = []
    st.session_state.last_written_files = []


def get_indexed_file_count() -> int:
    """
    Return number of files stored in project_index.json.
    """

    index_file = (
        PROJECT_ROOT
        / ".ai"
        / "project_index.json"
    )

    if not index_file.exists():
        return 0

    try:
        with index_file.open(
            "r",
            encoding="utf-8",
        ) as file:
            index = json.load(file)

    except (
        OSError,
        json.JSONDecodeError,
    ):
        return 0

    return (
        len(
            index.get(
                "backend",
                {},
            ).get(
                "files",
                [],
            )
        )
        + len(
            index.get(
                "frontend",
                {},
            ).get(
                "files",
                [],
            )
        )
        + len(
            index.get(
                "documentation",
                [],
            )
        )
        + len(
            index.get(
                "configuration",
                [],
            )
        )
        + len(
            index.get(
                "other",
                [],
            )
        )
    )


def get_memory_entry_count() -> int:
    """
    Return the number of active persistent memory entries.

    Entries without an explicit status are treated as active so
    existing project_memory.json files remain backwards compatible.
    """

    memory = load_memory()

    return sum(
        1
        for category in (
            "architecture",
            "decisions",
            "known_issues",
        )
        for entry in memory.get(
            category,
            [],
        )
        if entry.get(
            "status",
            "active",
        ) == "active"
    )


# =========================================================
# Project Memory UI
# =========================================================

def render_project_memory():
    """
    Render persistent project memory.

    Active entries are shown as current project knowledge.
    Resolved known issues are kept as history, but are displayed
    separately and no longer count as active memory.
    """

    memory = load_memory()

    categories = (
        (
            "architecture",
            "Architecture",
        ),
        (
            "decisions",
            "Decisions",
        ),
        (
            "known_issues",
            "Known Issues",
        ),
    )

    for key, label in categories:

        entries = memory.get(
            key,
            [],
        )

        active_entries = [
            entry
            for entry in entries
            if entry.get(
                "status",
                "active",
            ) == "active"
        ]

        with st.expander(
            f"{label} ({len(active_entries)})",
            expanded=False,
        ):

            if not active_entries:
                st.caption(
                    "Noch keine aktiven Einträge."
                )
                continue

            for entry in active_entries:

                fact = entry.get(
                    "fact",
                    "",
                )

                st.markdown(
                    f"**{fact}**"
                )

                sources = entry.get(
                    "sources",
                    [],
                )

                if sources:
                    st.caption(
                        "Sources: "
                        + ", ".join(
                            sources
                        )
                    )

                confidence = entry.get(
                    "confidence"
                )

                if confidence:
                    st.caption(
                        f"Confidence: {confidence}"
                    )

                st.divider()

    resolved_issues = [
        entry
        for entry in memory.get(
            "known_issues",
            [],
        )
        if entry.get(
            "status",
            "active",
        ) == "resolved"
    ]

    if resolved_issues:

        with st.expander(
            f"Resolved Issues ({len(resolved_issues)})",
            expanded=False,
        ):

            for entry in resolved_issues:

                fact = entry.get(
                    "fact",
                    "",
                )

                st.markdown(
                    f"~~{fact}~~"
                )

                sources = entry.get(
                    "sources",
                    [],
                )

                if sources:
                    st.caption(
                        "Sources: "
                        + ", ".join(
                            sources
                        )
                    )

                confidence = entry.get(
                    "confidence"
                )

                if confidence:
                    st.caption(
                        f"Confidence: {confidence}"
                    )

                st.caption(
                    "Status: resolved"
                )

                st.divider()


# =========================================================
# Memory candidate UI
# =========================================================

def render_memory_candidates():
    """
    Render memory suggestions generated by the agent.

    Supported actions:
    - add: store a new durable project fact
    - resolve: mark an existing known issue as resolved

    Candidates without an action are treated as "add" for backwards
    compatibility with older llm_client.py responses.
    """

    candidates = (
        st.session_state.memory_candidates
    )

    if not candidates:
        return

    st.divider()

    st.subheader(
        "Project-Memory-Vorschläge"
    )

    st.caption(
        "Der Agent kann neue Projekterkenntnisse speichern "
        "oder bestehende Known Issues als behoben markieren. "
        "Jede Änderung am dauerhaften Memory benötigt deine Freigabe."
    )

    for index, candidate in enumerate(
        candidates
    ):

        action = candidate.get(
            "action",
            "add",
        )

        category_key = candidate.get(
            "category",
            "",
        )

        fact = candidate.get(
            "fact",
            "",
        )

        candidate_id = (
            f"{action}-"
            f"{category_key}-"
            f"{fact}"
        )

        feedback = (
            st.session_state
            .candidate_feedback
            .get(candidate_id)
        )

        with st.container(
            border=True
        ):

            category = (
                category_key
                .replace(
                    "_",
                    " ",
                )
                .title()
            )

            if action == "resolve":

                st.markdown(
                    f"### Known Issue beheben · {category}"
                )

                st.warning(
                    "Der aktuelle Projektstand deutet darauf hin, "
                    "dass dieses Known Issue nicht mehr aktiv ist."
                )

            else:

                st.markdown(
                    f"### Neue Erkenntnis · {category}"
                )

            st.write(
                fact
            )

            sources = candidate.get(
                "sources",
                [],
            )

            if sources:
                st.caption(
                    "Sources: "
                    + ", ".join(
                        sources
                    )
                )

            confidence = candidate.get(
                "confidence"
            )

            if confidence:
                st.caption(
                    f"Confidence: {confidence}"
                )

            if feedback == "saved":

                st.success(
                    "Im Project Memory gespeichert."
                )

                continue

            if feedback == "duplicate":

                st.info(
                    "Dieser aktive Eintrag existiert bereits."
                )

                continue

            if feedback == "resolved":

                st.success(
                    "Known Issue wurde als behoben markiert."
                )

                continue

            if feedback == "not_found":

                st.info(
                    "Der passende Memory-Eintrag wurde nicht gefunden "
                    "oder war bereits nicht mehr aktiv."
                )

                continue

            if feedback == "discarded":

                st.caption(
                    "Vorschlag verworfen."
                )

                continue

            col_confirm, col_discard = (
                st.columns(2)
            )

            with col_confirm:

                if action == "resolve":

                    button_label = (
                        "Als behoben markieren"
                    )

                    button_key = (
                        f"resolve_memory_{index}"
                    )

                else:

                    button_label = (
                        "Speichern"
                    )

                    button_key = (
                        f"save_memory_{index}"
                    )

                if st.button(
                    button_label,
                    key=button_key,
                    type=(
                        "primary"
                        if action == "resolve"
                        else "secondary"
                    ),
                    use_container_width=True,
                ):

                    if action == "resolve":

                        resolved = (
                            resolve_memory_entry(
                                category=category_key,
                                fact=fact,
                            )
                        )

                        if resolved:

                            st.session_state[
                                "candidate_feedback"
                            ][candidate_id] = "resolved"

                        else:

                            st.session_state[
                                "candidate_feedback"
                            ][candidate_id] = "not_found"

                    else:

                        added = add_memory_entry(
                            category=category_key,
                            fact=fact,
                            sources=sources,
                            confidence=candidate.get(
                                "confidence",
                                "confirmed",
                            ),
                        )

                        if added:

                            st.session_state[
                                "candidate_feedback"
                            ][candidate_id] = "saved"

                        else:

                            st.session_state[
                                "candidate_feedback"
                            ][candidate_id] = "duplicate"

                    st.rerun()

            with col_discard:

                if st.button(
                    "Verwerfen",
                    key=f"discard_memory_{index}",
                    use_container_width=True,
                ):

                    st.session_state[
                        "candidate_feedback"
                    ][candidate_id] = "discarded"

                    st.rerun()


# =========================================================
# Pending code changes
# =========================================================

def render_pending_changes():
    """
    Render proposed code changes before writing them.
    """

    changes = (
        st.session_state.pending_changes
    )

    if not changes:
        return

    st.divider()

    st.subheader(
        "Vorgeschlagene Änderungen"
    )

    summary = (
        st.session_state
        .pending_change_summary
    )

    if summary:
        st.write(
            summary
        )

    valid_changes = []

    for index, change in enumerate(
        changes
    ):

        valid, error = validate_change(
            change
        )

        path = change.get(
            "path",
            "unknown",
        )

        with st.expander(
            path,
            expanded=True,
        ):

            if not valid:

                st.error(
                    error
                )

                continue

            try:
                diff = build_change_diff(
                    change
                )

            except Exception as exc:

                st.error(
                    f"Diff konnte nicht erzeugt werden: {exc}"
                )

                continue

            if not diff:

                st.info(
                    "Der vorgeschlagene Dateiinhalt "
                    "entspricht bereits dem aktuellen Inhalt."
                )

                continue

            st.code(
                diff,
                language="diff",
            )

            valid_changes.append(
                change
            )

    if not valid_changes:
        return

    st.warning(
        "Die Dateien wurden noch nicht verändert. "
        "Erst mit „Änderungen anwenden“ werden sie geschrieben."
    )

    col_apply, col_discard = (
        st.columns(2)
    )

    with col_apply:

        if st.button(
            "Änderungen anwenden",
            type="primary",
            use_container_width=True,
        ):

            try:

                written_files = apply_changes(
                    valid_changes
                )

            except Exception as exc:

                st.error(
                    f"Änderungen konnten nicht angewendet werden: {exc}"
                )

            else:

                count = len(
                    written_files
                )

                st.session_state.last_written_files = (
                    written_files
                )

                st.session_state.validation_results = []

                st.session_state.pending_changes = []
                st.session_state.pending_change_summary = ""

                st.success(
                    f"{count} Datei(en) wurden geändert."
                )

                st.rerun()

    with col_discard:

        if st.button(
            "Änderungen verwerfen",
            use_container_width=True,
        ):

            st.session_state.pending_changes = []
            st.session_state.pending_change_summary = ""

            st.rerun()


# =========================================================
# Agent details
# =========================================================

def render_agent_details():
    """
    Show retrieval/debug information.
    """

    results = (
        st.session_state.last_results
    )

    search_query = (
        st.session_state
        .last_search_query
    )

    if (
        not results
        and not search_query
    ):
        return

    with st.expander(
        "Agent-Details",
        expanded=False,
    ):

        if search_query:

            st.markdown(
                "**Retrieval Query**"
            )

            st.code(
                search_query,
                language=None,
            )

        if results:

            st.markdown(
                "**Verwendete Projektdateien**"
            )

            for result in results:

                score = result.get(
                    "score",
                    0,
                )

                path = result.get(
                    "path",
                    "",
                )

                file_type = result.get(
                    "type",
                    "",
                )

                text = (
                    f"`{score:>3}` "
                    f"**{path}**"
                )

                if file_type:
                    text += (
                        f" — {file_type}"
                    )

                st.write(
                    text
                )


# =========================================================
# Git UI
# =========================================================

def render_git_status(
    git_info: dict,
):
    """
    Render current Git status.
    """

    change_count = git_info.get(
        "change_count",
        0,
    )

    if change_count == 0:

        st.success(
            "Working tree clean"
        )

        return

    st.warning(
        f"{change_count} geänderte Dateien"
    )

    changes = git_info.get(
        "changes",
        [],
    )

    with st.expander(
        "Git Changes",
        expanded=False,
    ):

        for change in changes:

            status = change.get(
                "status",
                "",
            )

            path = change.get(
                "path",
                "",
            )

            st.write(
                f"`{status}` {path}"
            )


def render_git_diffs():
    """
    Render unstaged and staged Git diffs.
    """

    diff = get_git_diff()

    staged_diff = (
        get_staged_diff()
    )

    if diff:

        with st.expander(
            "Working Diff",
            expanded=False,
        ):

            st.code(
                diff,
                language="diff",
            )

    if staged_diff:

        with st.expander(
            "Staged Diff",
            expanded=False,
        ):

            st.code(
                staged_diff,
                language="diff",
            )


def render_validation_results():
    """
    Render results from previous validation commands.
    """

    results = (
        st.session_state.validation_results
    )

    if not results:
        return

    st.markdown(
        "### Ergebnisse"
    )

    for result in results:

        label = result.get(
            "label",
            "Validation",
        )

        success = result.get(
            "success",
            False,
        )

        command = result.get(
            "command",
            "",
        )

        returncode = result.get(
            "returncode",
            -1,
        )

        stdout = result.get(
            "stdout",
            "",
        )

        stderr = result.get(
            "stderr",
            "",
        )

        with st.container(
            border=True
        ):

            if success:

                st.success(
                    f"{label} erfolgreich"
                )

            else:

                st.error(
                    f"{label} fehlgeschlagen"
                )

            st.caption(
                f"`{command}`"
            )

            st.caption(
                f"Exit Code: {returncode}"
            )

            if stdout:

                with st.expander(
                    "Output",
                    expanded=not success,
                ):

                    st.code(
                        stdout,
                        language=None,
                    )

            if stderr:

                with st.expander(
                    "Errors",
                    expanded=True,
                ):

                    st.code(
                        stderr,
                        language=None,
                    )


def render_validation():
    """
    Render controlled project validation commands.
    """

    written_files = (
        st.session_state.last_written_files
    )

    if not written_files:
        return

    st.divider()

    st.subheader(
        "Validierung"
    )

    st.caption(
        "Die Änderungen wurden angewendet. "
        "Du kannst jetzt kontrollierte Prüfungen ausführen."
    )

    st.markdown(
        "**Zuletzt geänderte Dateien:**"
    )

    for path in written_files:
        st.write(
            f"- `{path}`"
        )

    commands = (
        get_validation_commands()
    )

    selected = []

    for command in commands:

        default = False

        # Backend changed
        if any(
            path.startswith("backend/")
            for path in written_files
        ):
            if command.key == "django_check":
                default = True

        # Frontend changed
        if any(
            path.startswith("frontend/")
            for path in written_files
        ):
            if command.key == "angular_build":
                default = True

        checked = st.checkbox(
            command.label,
            value=default,
            key=(
                f"validation_"
                f"{command.key}"
            ),
        )

        if checked:
            selected.append(
                command.key
            )

    if not selected:
        st.caption(
            "Wähle mindestens eine Prüfung aus."
        )

    else:

        if st.button(
            "Validierung ausführen",
            type="primary",
            use_container_width=True,
        ):

            results = []

            for key in selected:

                with st.spinner(
                    f"Führe {key} aus..."
                ):

                    result = run_validation(
                        key
                    )

                results.append(
                    result
                )

            st.session_state.validation_results = (
                results
            )

            st.rerun()

    render_validation_results()


# =========================================================
# Sidebar
# =========================================================

with st.sidebar:

    st.title(
        "SmartHome AI"
    )

    st.caption(
        "Project-aware Coding Assistant"
    )

    # -----------------------------------------------------
    # Agent mode
    # -----------------------------------------------------

    st.subheader(
        "Agent"
    )

    st.session_state.agent_mode = (
        st.radio(
            "Modus",
            options=[
                "Analyse",
                "Code ändern",
            ],
            index=(
                0
                if st.session_state.agent_mode
                == "Analyse"
                else 1
            ),
        )
    )

    if (
        st.session_state.agent_mode
        == "Analyse"
    ):

        st.caption(
            "Der Agent analysiert das Projekt, "
            "ändert aber keine Dateien."
        )

    else:

        st.warning(
            "Der Agent darf Änderungsvorschläge erzeugen. "
            "Dateien werden erst nach deiner Freigabe geändert."
        )

    # -----------------------------------------------------
    # Conversation
    # -----------------------------------------------------

    if st.button(
        "Neue Unterhaltung",
        use_container_width=True,
    ):

        reset_conversation()
        st.rerun()

    st.divider()

    # -----------------------------------------------------
    # Project status
    # -----------------------------------------------------

    st.subheader(
        "Projekt"
    )

    git_info = (
        get_project_git_info()
    )

    indexed_files = (
        get_indexed_file_count()
    )

    memory_count = (
        get_memory_entry_count()
    )

    col_files, col_memory = (
        st.columns(2)
    )

    with col_files:

        st.metric(
            "Files",
            indexed_files,
        )

    with col_memory:

        st.metric(
            "Memory",
            memory_count,
        )

    branch = git_info.get(
        "branch",
        "unknown",
    )

    last_commit = git_info.get(
        "last_commit",
        "unknown",
    )

    st.caption(
        f"Branch: `{branch}`"
    )

    st.caption(
        f"Last commit: `{last_commit}`"
    )

    render_git_status(
        git_info
    )

    render_git_diffs()

    st.divider()

    # -----------------------------------------------------
    # Project Memory
    # -----------------------------------------------------

    st.subheader(
        "Project Memory"
    )

    render_project_memory()


# =========================================================
# Main header
# =========================================================

st.title(
    "SmartHome AI"
)

if (
    st.session_state.agent_mode
    == "Analyse"
):

    st.caption(
        "Analyse-Modus · "
        "Projekt verstehen, Fragen beantworten "
        "und Projektwissen aufbauen."
    )

else:

    st.caption(
        "Code-ändern-Modus · "
        "Änderungen werden zuerst als Diff vorgeschlagen "
        "und erst nach deiner Freigabe geschrieben."
    )


# =========================================================
# Empty state
# =========================================================

if not st.session_state.messages:

    if (
        st.session_state.agent_mode
        == "Analyse"
    ):

        st.info(
            "Beispiele:\n\n"
            "- Wie funktioniert die Authentifizierung?\n"
            "- Wo liegt aktuell die grösste Schwachstelle?\n"
            "- Welche Dateien gehören zum Login-Flow?\n"
            "- Was habe ich seit dem letzten Commit geändert?\n"
            "- Wie würdest du die Architektur verbessern?"
        )

    else:

        st.info(
            "Beispiele:\n\n"
            "- Ergänze in docs/README.md eine Development-Sektion.\n"
            "- Behebe den Fehler in der Refresh-Token-Logik.\n"
            "- Vereinfache AuthService ohne das Verhalten zu ändern.\n"
            "- Ergänze Fehlerbehandlung für den Login."
        )


# =========================================================
# Chat history
# =========================================================

for message in (
    st.session_state.messages
):

    role = message.get(
        "role",
        "assistant",
    )

    content = message.get(
        "content",
        "",
    )

    with st.chat_message(
        role
    ):

        st.markdown(
            content
        )


# =========================================================
# Proposed code changes
# =========================================================

render_pending_changes()


# =========================================================
# Validation
# =========================================================

render_validation()

# =========================================================
# Memory candidates
# =========================================================

render_memory_candidates()


# =========================================================
# Agent details
# =========================================================

render_agent_details()


# =========================================================
# Chat input
# =========================================================

if (
    st.session_state.agent_mode
    == "Analyse"
):

    placeholder = (
        "Frage zum SmartHome-Projekt..."
    )

else:

    placeholder = (
        "Welche Änderung soll der Agent vorschlagen?"
    )


query = st.chat_input(
    placeholder
)


# =========================================================
# Process user request
# =========================================================

if query:

    previous_messages = list(
        st.session_state.messages
    )

    # -----------------------------------------------------
    # Store and display user message
    # -----------------------------------------------------

    st.session_state.messages.append({
        "role": "user",
        "content": query,
    })

    with st.chat_message(
        "user"
    ):

        st.markdown(
            query
        )

    # -----------------------------------------------------
    # ANALYSIS MODE
    # -----------------------------------------------------

    if (
        st.session_state.agent_mode
        == "Analyse"
    ):

        with st.chat_message(
            "assistant"
        ):

            with st.spinner(
                "Analysiere Projekt..."
            ):

                (
                    answer,
                    results,
                    search_query,
                    memory_candidates,
                ) = get_project_answer(
                    query=query,
                    messages=previous_messages,
                    validation_results=(
                        st.session_state.validation_results
                    ),
                )

            st.markdown(
                answer
            )

        st.session_state.messages.append({
            "role": "assistant",
            "content": answer,
        })

        st.session_state.memory_candidates = (
            memory_candidates
        )

        st.session_state.pending_changes = []
        st.session_state.pending_change_summary = ""

    # -----------------------------------------------------
    # CODE CHANGE MODE
    # -----------------------------------------------------

    else:

        with st.chat_message(
            "assistant"
        ):

            with st.spinner(
                "Erstelle Änderungsvorschlag..."
            ):

                (
                    proposal,
                    results,
                    search_query,
                ) = propose_project_changes(
                    query=query,
                    messages=previous_messages,
                    validation_results=(
                        st.session_state.validation_results
                    ),
                )

            summary = proposal.get(
                "summary",
                "",
            )

            changes = proposal.get(
                "changes",
                [],
            )

            if summary:
                st.markdown(
                    summary
                )

            if changes:
                st.caption(
                    f"{len(changes)} Datei(en) "
                    "zur Änderung vorgeschlagen."
                )
            else:
                st.info(
                    "Es wurden keine konkreten "
                    "Dateiänderungen vorgeschlagen."
                )

        answer = (
            summary
            or "Keine Änderungen vorgeschlagen."
        )

        st.session_state.messages.append({
            "role": "assistant",
            "content": answer,
        })

        st.session_state.pending_changes = (
            changes
        )

        st.session_state.pending_change_summary = (
            summary
        )

        # No memory candidates while editing for now.
        st.session_state.memory_candidates = []

    # -----------------------------------------------------
    # Store agent diagnostics
    # -----------------------------------------------------

    st.session_state.last_results = (
        results
    )

    st.session_state.last_search_query = (
        search_query
    )

    st.session_state.candidate_feedback = {}

    # -----------------------------------------------------
    # Rerun to place persistent UI blocks correctly
    # -----------------------------------------------------

    st.rerun()
