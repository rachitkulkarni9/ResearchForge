import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.sandbox.executor import SandboxExecutor


class DummySettings:
    sandbox_exec_timeout_seconds = 8
    sandbox_output_limit_chars = 12000
    sandbox_install_timeout_seconds = 120


class SandboxExecutorTests(unittest.TestCase):
    def test_detects_missing_allowed_package(self) -> None:
        executor = SandboxExecutor(DummySettings())
        with patch("app.sandbox.executor.importlib.util.find_spec", return_value=None):
            packages = executor._find_missing_packages("import numpy as np\nfrom sklearn.model_selection import train_test_split")
        self.assertEqual(packages, ["numpy", "scikit-learn"])

    def test_ignores_non_allowlisted_package(self) -> None:
        executor = SandboxExecutor(DummySettings())
        with patch("app.sandbox.executor.importlib.util.find_spec", return_value=None):
            packages = executor._find_missing_packages("import madeup_pkg")
        self.assertEqual(packages, [])


if __name__ == "__main__":
    unittest.main()
