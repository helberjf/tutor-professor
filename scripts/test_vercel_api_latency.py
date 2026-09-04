"""Deployment invariants that keep the serverless API responsive."""
from __future__ import annotations

import asyncio
import importlib
import json
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace


REPO_ROOT = Path(__file__).resolve().parent.parent
API_DIR = REPO_ROOT / "apps" / "api"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def test_api_runs_with_the_supabase_region() -> None:
    config = json.loads((API_DIR / "vercel.json").read_text(encoding="utf-8"))
    require(
        config.get("regions") == ["pdx1"],
        "the API function must run in pdx1, alongside the us-west-2 Supabase database",
    )


def test_edge_tts_is_lazy_and_still_works() -> None:
    sys.path.insert(0, str(API_DIR))
    sys.modules.pop("services.tts_service", None)
    sys.modules.pop("edge_tts", None)
    module = importlib.import_module("services.tts_service")

    require(
        "edge_tts" not in sys.modules,
        "importing the API must not eagerly import edge_tts and aiohttp on every cold start",
    )

    class FakeCommunicate:
        def __init__(self, text: str, voice: str):
            self.text = text
            self.voice = voice

        async def save(self, path: str) -> None:
            Path(path).write_bytes(f"{self.voice}:{self.text}".encode())

    module._load_edge_tts = lambda: SimpleNamespace(Communicate=FakeCommunicate)
    with tempfile.TemporaryDirectory(prefix="english-kids-tts-") as tmp:
        service = module.TTSService(provider="edge", cache_dir=tmp)
        result = asyncio.run(service.generate_speech("hello", "af_bella"))
        require(result is not None, "the lazy Edge provider must still generate audio")
        require(Path(result).is_file(), "the Edge provider must save the generated file")


if __name__ == "__main__":
    test_api_runs_with_the_supabase_region()
    test_edge_tts_is_lazy_and_still_works()
    print("vercel api latency: ok")
