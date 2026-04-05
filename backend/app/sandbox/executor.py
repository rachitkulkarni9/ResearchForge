import ast
import importlib.util
import subprocess
import sys
import tempfile
from pathlib import Path

from app.core.config import Settings

PACKAGE_NAME_MAP = {
    "cv2": "opencv-python",
    "PIL": "Pillow",
    "sklearn": "scikit-learn",
    "yaml": "PyYAML",
}

AUTO_INSTALL_ALLOWLIST = {
    "numpy",
    "pandas",
    "scipy",
    "matplotlib",
    "seaborn",
    "sympy",
    "scikit-learn",
    "opencv-python",
    "Pillow",
    "networkx",
    "statsmodels",
    "xgboost",
    "lightgbm",
    "torch",
    "torchvision",
    "torchaudio",
    "transformers",
    "datasets",
    "accelerate",
    "sentencepiece",
    "einops",
    "tqdm",
    "PyYAML",
}


class SandboxExecutor:
    def __init__(self, settings: Settings):
        self.settings = settings

    def run_python(self, code: str) -> dict:
        missing_packages = self._find_missing_packages(code)
        install_messages: list[str] = []

        if missing_packages:
            install_messages = self._install_missing_packages(missing_packages)

        with tempfile.TemporaryDirectory() as temp_dir:
            script_path = Path(temp_dir) / "main.py"
            script_path.write_text(code, encoding="utf-8")
            try:
                process = subprocess.run(
                    [sys.executable, str(script_path)],
                    capture_output=True,
                    text=True,
                    timeout=self.settings.sandbox_exec_timeout_seconds,
                )
                stdout = process.stdout[: self.settings.sandbox_output_limit_chars]
                stderr = process.stderr[: self.settings.sandbox_output_limit_chars]
                if install_messages:
                    stdout = self._prepend_install_messages(stdout, install_messages)
                return {"stdout": stdout, "stderr": stderr, "success": process.returncode == 0}
            except subprocess.TimeoutExpired:
                stderr = f"Execution timed out after {self.settings.sandbox_exec_timeout_seconds} seconds."
                if install_messages:
                    stderr = "\n".join([*install_messages, stderr])
                return {
                    "stdout": "",
                    "stderr": stderr[: self.settings.sandbox_output_limit_chars],
                    "success": False,
                }

    def _find_missing_packages(self, code: str) -> list[str]:
        try:
            tree = ast.parse(code)
        except SyntaxError:
            return []

        packages: list[str] = []
        seen: set[str] = set()

        for node in ast.walk(tree):
            module_name = None
            if isinstance(node, ast.Import):
                for alias in node.names:
                    module_name = alias.name.split(".")[0]
                    package_name = PACKAGE_NAME_MAP.get(module_name, module_name)
                    if package_name in AUTO_INSTALL_ALLOWLIST and package_name not in seen and importlib.util.find_spec(module_name) is None:
                        packages.append(package_name)
                        seen.add(package_name)
            elif isinstance(node, ast.ImportFrom) and node.module:
                module_name = node.module.split(".")[0]
                package_name = PACKAGE_NAME_MAP.get(module_name, module_name)
                if package_name in AUTO_INSTALL_ALLOWLIST and package_name not in seen and importlib.util.find_spec(module_name) is None:
                    packages.append(package_name)
                    seen.add(package_name)

        return packages

    def _install_missing_packages(self, packages: list[str]) -> list[str]:
        messages: list[str] = []
        for package in packages:
            try:
                process = subprocess.run(
                    [sys.executable, "-m", "pip", "install", package],
                    capture_output=True,
                    text=True,
                    timeout=self.settings.sandbox_install_timeout_seconds,
                )
                if process.returncode == 0:
                    messages.append(f"[sandbox] Installed dependency: {package}")
                else:
                    details = (process.stderr or process.stdout or "").strip()
                    if details:
                        details = details.splitlines()[-1]
                    messages.append(f"[sandbox] Could not install {package}: {details or 'pip install failed'}")
            except Exception as exc:
                messages.append(f"[sandbox] Could not install {package}: {exc}")
        return messages

    def _prepend_install_messages(self, stdout: str, messages: list[str]) -> str:
        prefix = "\n".join(messages)
        if stdout:
            return f"{prefix}\n{stdout}"[: self.settings.sandbox_output_limit_chars]
        return prefix[: self.settings.sandbox_output_limit_chars]
