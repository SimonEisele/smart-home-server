import importlib.util
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

AGENT_DIRECTORY = Path(__file__).resolve().parents[1]


class ApplyChangesTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        scanner = types.ModuleType("project_scanner")
        scanner.PROJECT_ROOT = self.root
        spec = importlib.util.spec_from_file_location(
            "editor_under_test", AGENT_DIRECTORY / "code_editor.py",
        )
        self.editor = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"project_scanner": scanner}):
            spec.loader.exec_module(self.editor)
        self.file = self.root / "existing.py"
        self.original = b"original\r\n"
        self.file.write_bytes(self.original)

    def change(self, path="existing.py", content="updated\n"):
        return {"path": path, "content": content}

    def test_invalid_later_change_leaves_everything_untouched(self):
        with self.assertRaises(ValueError):
            self.editor.apply_changes([
                self.change(), self.change("../outside.py"),
            ])
        self.assertEqual(self.file.read_bytes(), self.original)

    def test_duplicate_resolved_paths_are_rejected(self):
        with self.assertRaises(ValueError):
            self.editor.apply_changes([
                self.change(), self.change("./existing.py"),
            ])
        self.assertEqual(self.file.read_bytes(), self.original)

    def test_success_updates_existing_and_creates_nested_file(self):
        changes = [self.change(), self.change("nested/new.py", "new\n")]
        self.assertEqual(self.editor.apply_changes(changes),
                         ["existing.py", "nested/new.py"])
        self.assertEqual(self.file.read_bytes(), b"updated\n")
        self.assertEqual((self.root / "nested/new.py").read_bytes(), b"new\n")

    def test_replacement_failure_restores_bytes_and_removes_new_files(self):
        real_replace = self.editor.os.replace
        calls = 0

        def fail_third(source, destination):
            nonlocal calls
            calls += 1
            if calls == 3:
                raise OSError("simulated replacement failure")
            return real_replace(source, destination)

        with patch.object(self.editor.os, "replace", side_effect=fail_third):
            with self.assertRaises(OSError):
                self.editor.apply_changes([
                    self.change(),
                    self.change("nested/new.py"),
                    self.change("nested/last.py"),
                ])
        self.assertEqual(self.file.read_bytes(), self.original)
        self.assertFalse((self.root / "nested").exists())
        self.assertFalse(list(self.root.rglob(".ai-edit-*")))

    def test_invalid_payloads_and_directory_target_are_rejected(self):
        (self.root / "directory.py").mkdir()
        for change in [None, {}, self.change(""), self.change("directory.py")]:
            with self.subTest(change=change):
                with self.assertRaises(ValueError):
                    self.editor.apply_changes([change])

    def test_staging_failure_does_not_change_existing_files(self):
        with patch.object(self.editor.tempfile, "mkstemp",
                          side_effect=OSError("simulated staging failure")):
            with self.assertRaises(OSError):
                self.editor.apply_changes([self.change("nested/new.py")])
        self.assertEqual(self.file.read_bytes(), self.original)
        self.assertFalse((self.root / "nested").exists())


if __name__ == "__main__":
    unittest.main()
