"""Speech follows the language of the text, not the (English) voice the child picked."""
from __future__ import annotations

import asyncio
import importlib
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace


REPO_ROOT = Path(__file__).resolve().parent.parent
API_DIR = REPO_ROOT / "apps" / "api"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def load_module():
    sys.path.insert(0, str(API_DIR))
    sys.modules.pop("services.tts_service", None)
    return importlib.import_module("services.tts_service")


def make_service(module, tmp: str, *, kokoro_ok: bool = True):
    """A Kokoro service whose network calls are recorded instead of sent."""

    calls: dict[str, list] = {"kokoro": [], "edge": []}

    class FakeCommunicate:
        def __init__(self, text: str, voice: str):
            calls["edge"].append(voice)

        async def save(self, path: str) -> None:
            Path(path).write_bytes(b"edge")

    module._load_edge_tts = lambda: SimpleNamespace(Communicate=FakeCommunicate)
    service = module.TTSService(provider="kokoro", cache_dir=tmp)

    def fake_request(payload, urls=None):
        calls["kokoro"].append(payload)
        if not kokoro_ok:
            raise RuntimeError("Kokoro is not reachable")
        return b"kokoro"

    service._request_audio = fake_request
    return service, calls


def test_french_uses_a_french_kokoro_voice() -> None:
    module = load_module()
    with tempfile.TemporaryDirectory() as tmp:
        service, calls = make_service(module, tmp)
        result = asyncio.run(service.generate_speech("Bonjour les enfants", "af_bella", language="French"))
        require(result is not None, "French must produce audio")
        payload = calls["kokoro"][0]
        require(payload["voice"] == "ff_siwis", f"French must use ff_siwis, got {payload['voice']}")
        require(payload["lang_code"] == "f", "Kokoro must be told the text is French")


def test_male_voice_stays_male_in_spanish() -> None:
    module = load_module()
    with tempfile.TemporaryDirectory() as tmp:
        service, calls = make_service(module, tmp)
        asyncio.run(service.generate_speech("Hola", "am_adam", language="es"))
        require(calls["kokoro"][0]["voice"] == "em_alex", "a male voice must map to a male Spanish voice")
        require(calls["kokoro"][0]["lang_code"] == "e", "Spanish lang_code must be sent")


def test_english_keeps_the_chosen_voice_and_its_cache() -> None:
    module = load_module()
    with tempfile.TemporaryDirectory() as tmp:
        service, calls = make_service(module, tmp)
        result = asyncio.run(service.generate_speech("Hello", "bf_emma", language="English"))
        payload = calls["kokoro"][0]
        require(payload["voice"] == "bf_emma", "English must keep the voice the child chose")
        require("lang_code" not in payload, "English requests must look as they always did")
        # Same file name as before languages existed, so cached English audio stays valid.
        require(Path(result).name == f"{service._get_text_hash('Hello', 'bf_emma')}.mp3", "English cache key changed")


def test_german_skips_kokoro_for_a_native_edge_voice() -> None:
    module = load_module()
    with tempfile.TemporaryDirectory() as tmp:
        service, calls = make_service(module, tmp)
        result = asyncio.run(service.generate_speech("Guten Tag", "af_bella", language="German"))
        require(result is not None, "German must still produce audio")
        require(not calls["kokoro"], "Kokoro has no German voice and must not be asked")
        require(calls["edge"] == ["de-DE-KatjaNeural"], f"German must use a German Edge voice, got {calls['edge']}")


def test_kokoro_down_falls_back_to_a_voice_of_the_same_language() -> None:
    module = load_module()
    with tempfile.TemporaryDirectory() as tmp:
        service, calls = make_service(module, tmp, kokoro_ok=False)
        result = asyncio.run(service.generate_speech("Bonjour", "af_bella", language="Francês"))
        require(result is not None, "the fallback must still produce audio")
        require(calls["edge"] == ["fr-FR-DeniseNeural"], f"the fallback must speak French, got {calls['edge']}")


def test_same_text_in_two_languages_is_cached_apart() -> None:
    module = load_module()
    with tempfile.TemporaryDirectory() as tmp:
        service, _ = make_service(module, tmp)
        english = asyncio.run(service.generate_speech("Paris", "af_bella", language="English"))
        french = asyncio.run(service.generate_speech("Paris", "af_bella", language="French"))
        require(english != french, "French audio must not reuse the English file")


def test_language_tags_for_the_browser_fallback() -> None:
    module = load_module()
    require(module.language_bcp47("French") == "fr-FR", "French → fr-FR")
    require(module.language_bcp47("pt") == "pt-BR", "pt → pt-BR")
    require(module.language_bcp47("Klingon") is None, "unknown languages have no tag")
    require(module.resolve_language("af_bella") is None, "a voice name is not a language")
    # Typed without accents still resolves: lookups ignore accents on both sides.
    require(module.resolve_language("Francês") == "french", "accented name resolves")
    require(module.resolve_language("frances") == "french", "unaccented name resolves too")
    require(module.resolve_language("alemao") == "german", "unaccented German resolves")


if __name__ == "__main__":
    test_french_uses_a_french_kokoro_voice()
    test_male_voice_stays_male_in_spanish()
    test_english_keeps_the_chosen_voice_and_its_cache()
    test_german_skips_kokoro_for_a_native_edge_voice()
    test_kokoro_down_falls_back_to_a_voice_of_the_same_language()
    test_same_text_in_two_languages_is_cached_apart()
    test_language_tags_for_the_browser_fallback()
    print("tts languages: ok")
