import subprocess
import tempfile
from pathlib import Path

from app.core.config import Settings


class SandboxExecutor:
    def __init__(self, settings: Settings):
        self.settings = settings

    def run_python(self, code: str) -> dict:
        with tempfile.TemporaryDirectory() as temp_dir:
            script_path = Path(temp_dir) / "main.py"
            script_path.write_text(code, encoding="utf-8")
            try:
                process = subprocess.run(
                    ["python", str(script_path)],
                    capture_output=True,
                    text=True,
                    timeout=self.settings.sandbox_exec_timeout_seconds,
                )
                stdout = process.stdout[: self.settings.sandbox_output_limit_chars]
                stderr = process.stderr[: self.settings.sandbox_output_limit_chars]
                return {"stdout": stdout, "stderr": stderr, "success": process.returncode == 0}
            except subprocess.TimeoutExpired:
                return {
                    "stdout": "",
                    "stderr": f"Execution timed out after {self.settings.sandbox_exec_timeout_seconds} seconds.",
                    "success": False,
                }
