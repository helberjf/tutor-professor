"""Run representative existing API regressions without dotenv, secrets or network.

Usage from the repository root: python scripts/e2e/run_legacy.py
"""
import os
from pathlib import Path
import runpy
import socket
import subprocess
import sys
import tempfile
import threading

REPO = Path(__file__).resolve().parents[2]
SCRIPTS = ["test_admin_account_approval.py", "test_tenant_isolation.py", "test_account_modules.py",
           "test_study_session_flow.py", "test_objectives_progress.py", "test_exam_simulado_mode.py",
           "test_password_security.py", "test_study_log.py", "test_ai_credits.py",
           "test_session_revocation_race.py", "test_account_self_service.py", "test_parallel_requests.py",
           "test_chat_context.py", "test_book_generation_limits.py", "test_book_page_requests.py"]


def run_child(script):
    if script not in SCRIPTS:
        raise ValueError("Unapproved legacy script")
    root = Path(os.environ["LEGACY_E2E_ROOT"]).resolve()
    if root != Path.cwd().resolve() or not root.name.startswith("tutor-legacy-"):
        raise ValueError("Legacy E2E: invalid temporary root")
    # Existing scripts allocate their own mkdtemp directories. Keep those inside
    # the parent's TemporaryDirectory so their databases/audio are also removed.
    tempfile.tempdir = str(root)
    for name in ("TEMP", "TMP", "TMPDIR"):
        os.environ[name] = str(root)
    runtime = threading.local()
    original_pair = socket.socketpair

    def pair(*args, **kwargs):
        runtime.internal = True
        try:
            return original_pair(*args, **kwargs)
        finally:
            runtime.internal = False

    socket.socketpair = pair

    def audit(event, args):
        if event == "socket.connect" and not getattr(runtime, "internal", False):
            raise PermissionError("Legacy E2E: network disabled")
        if event == "sqlite3.connect":
            filename = os.fsdecode(args[0])
            if filename != ":memory:" and not Path(filename).resolve().is_relative_to(root):
                raise PermissionError("Legacy E2E: only temporary SQLite databases allowed")

    sys.addaudithook(audit)
    import dotenv
    dotenv.load_dotenv = lambda *args, **kwargs: False
    sys.path.insert(0, str(REPO / "scripts"))
    sys.argv = [str(REPO / "scripts" / script)]
    runpy.run_path(str(REPO / "scripts" / script), run_name="__main__")


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--child":
        run_child(sys.argv[2])
    else:
        scripts = sys.argv[1:] or SCRIPTS
        if any(script not in SCRIPTS for script in scripts):
            raise ValueError("Unapproved legacy script")
        failures = []
        for script in scripts:
            with tempfile.TemporaryDirectory(prefix="tutor-legacy-") as directory:
                allowed = {"path", "systemroot", "windir", "comspec", "pathext", "temp", "tmp",
                           "userprofile", "localappdata", "appdata", "home", "lang"}
                env = {key: value for key, value in os.environ.items() if key.lower() in allowed}
                env.update(APP_ENV="test", PYTHONUTF8="1", EMAIL_PROVIDER="console", TTS_PROVIDER="none",
                           LEGACY_E2E_ROOT=directory,
                           SESSION_SECRET="synthetic-legacy-regression-only", ALLOW_GUEST_ACCESS="false",
                           DATABASE_URL=f"sqlite:///{Path(directory, 'legacy.sqlite').as_posix()}",
                           AUDIO_CACHE_DIR=str(Path(directory, "audio")))
                result = subprocess.run([sys.executable, str(Path(__file__).resolve()), "--child", script],
                                        cwd=directory, env=env, capture_output=True, text=True, encoding="utf8")
                print(f"{'PASS' if result.returncode == 0 else 'FAIL'} {script}")
                if result.returncode:
                    failures.append(script)
                    print(result.stdout[-4000:] + result.stderr[-4000:])
        print(f"{len(scripts) - len(failures)} passed, {len(failures)} failed")
        sys.exit(bool(failures))
