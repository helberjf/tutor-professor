import asyncio
import importlib
import os
import hashlib
import unicodedata
import requests
import aiofiles
from dataclasses import dataclass
from typing import Optional
from pathlib import Path


def _load_edge_tts():
    """Import the optional fallback only when a request actually needs it."""

    try:
        return importlib.import_module("edge_tts")
    except ImportError:
        return None

# Maps Kokoro voice names to Microsoft Edge TTS voice names
_EDGE_VOICE_MAP: dict[str, str] = {
    # American female
    "af_bella":   "en-US-JennyNeural",
    "af_nicole":  "en-US-AriaNeural",
    "af_sarah":   "en-US-SaraNeural",
    "af_sky":     "en-US-JennyNeural",
    # American male
    "am_adam":    "en-US-GuyNeural",
    "am_michael": "en-US-ChristopherNeural",
    # British female
    "bf_emma":    "en-GB-SoniaNeural",
    "bf_isabella":"en-GB-LibbyNeural",
    # British male
    "bm_george":  "en-GB-RyanNeural",
    "bm_lewis":   "en-GB-RyanNeural",
}
_EDGE_DEFAULT_VOICE = "en-US-JennyNeural"


@dataclass(frozen=True)
class _LanguageVoices:
    """Who speaks a language: Kokoro when it can, Edge when it cannot.

    Kokoro only knows a language through its voice: "ff_siwis" is French because
    it starts with "f". An English voice handed French text reads it with an
    English accent, so the voice has to follow the language of the text.
    """

    bcp47: str
    kokoro_lang: str | None  # None: Kokoro has no voice for it
    kokoro_female: str | None
    kokoro_male: str | None
    edge_female: str
    edge_male: str


_LANGUAGES: dict[str, _LanguageVoices] = {
    "english": _LanguageVoices("en-US", "a", "af_bella", "am_adam", "en-US-JennyNeural", "en-US-GuyNeural"),
    # Kokoro has a single French voice.
    "french": _LanguageVoices("fr-FR", "f", "ff_siwis", "ff_siwis", "fr-FR-DeniseNeural", "fr-FR-HenriNeural"),
    "spanish": _LanguageVoices("es-ES", "e", "ef_dora", "em_alex", "es-ES-ElviraNeural", "es-ES-AlvaroNeural"),
    "italian": _LanguageVoices("it-IT", "i", "if_sara", "im_nicola", "it-IT-ElsaNeural", "it-IT-DiegoNeural"),
    "portuguese": _LanguageVoices("pt-BR", "p", "pf_dora", "pm_alex", "pt-BR-FranciscaNeural", "pt-BR-AntonioNeural"),
    "german": _LanguageVoices("de-DE", None, None, None, "de-DE-KatjaNeural", "de-DE-ConradNeural"),
    "russian": _LanguageVoices("ru-RU", None, None, None, "ru-RU-SvetlanaNeural", "ru-RU-DmitryNeural"),
}

def _fold(text: str) -> str:
    """Lower case without accents, so a name typed with or without them matches."""

    decomposed = unicodedata.normalize("NFKD", text.strip().lower())
    return "".join(char for char in decomposed if not unicodedata.combining(char))


# Written with their accents; lookups fold both sides, so unaccented input
# ("frances", "portugues") still resolves without listing it twice.
_LANGUAGE_ALIASES: dict[str, str] = {
    "en": "english", "en-us": "english", "en-gb": "english", "inglês": "english",
    "fr": "french", "fr-fr": "french", "français": "french", "francês": "french",
    "es": "spanish", "es-es": "spanish", "español": "spanish", "espanhol": "spanish",
    "it": "italian", "it-it": "italian", "italiano": "italian",
    "pt": "portuguese", "pt-br": "portuguese", "português": "portuguese",
    "de": "german", "de-de": "german", "deutsch": "german", "alemão": "german",
    "ru": "russian", "ru-ru": "russian", "русский": "russian", "russo": "russian",
}
_FOLDED_ALIASES: dict[str, str] = {_fold(alias): language for alias, language in _LANGUAGE_ALIASES.items()}


def resolve_language(language: str | None) -> str | None:
    """Accept "French", "fr" or "Francês" and return "french"; None if unknown."""

    key = _fold(language or "")
    if not key:
        return None
    if key in _LANGUAGES:
        return key
    return _FOLDED_ALIASES.get(key)


def language_bcp47(language: str | None) -> str | None:
    """The tag a browser voice needs ("fr-FR"), for the client-side fallback."""

    resolved = resolve_language(language)
    return _LANGUAGES[resolved].bcp47 if resolved else None


@dataclass(frozen=True)
class _SpeechPlan:
    kokoro_voice: str | None  # None: go straight to Edge
    kokoro_lang: str | None
    edge_voice: str
    cache_key: str


class TTSService:
    def __init__(
        self,
        provider: str = "kokoro",
        default_voice: str = "af_bella",
        cache_dir: str = "./audio_cache",
        audio_store=None,
    ):
        self.provider = provider
        self.default_voice = self._normalize_voice(default_voice)
        self.model = os.getenv("KOKORO_MODEL", "kokoro")
        # Optional shared cache, so an instance can reuse what another one
        # already synthesised. None means local-directory only.
        self.audio_store = audio_store
        self.cache_dir = Path(cache_dir)
        try:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            self.cache_writable = True
        except OSError:
            # Read-only filesystem (a serverless bundle). Synthesis still works;
            # only the on-disk cache is unavailable.
            self.cache_writable = False

        configured_url = os.getenv("KOKORO_URL", "").strip()
        self.kokoro_url = configured_url or "http://127.0.0.1:8880/v1/audio/speech"
        self.kokoro_urls = self._build_kokoro_urls(configured_url)
        self.request_timeout = float(os.getenv("KOKORO_TIMEOUT_SECONDS", "8"))
        # Sent to the small auth proxy that stands in front of Kokoro when it
        # is reachable over a tunnel (scripts/kokoro_auth_proxy.py). Empty for
        # a localhost Kokoro, which needs no door.
        self.auth_token = os.getenv("KOKORO_AUTH_TOKEN", "").strip()

    def _build_kokoro_urls(self, configured_url: str) -> list[str]:
        if configured_url:
            return [configured_url]

        return [
            "http://127.0.0.1:8880/v1/audio/speech",
            "http://localhost:8880/v1/audio/speech",
            "http://127.0.0.1:8888/v1/audio/speech",
            "http://localhost:8888/v1/audio/speech",
        ]

    def _normalize_voice(self, voice: str | None) -> str:
        normalized = (voice or "").strip() or "af_bella"
        legacy_voice_map = {
            "af_heart": "af_bella",
        }
        return legacy_voice_map.get(normalized, normalized)

    def normalize_voice(self, voice: str | None) -> str:
        return self._normalize_voice(voice)

    def _get_text_hash(self, text: str, voice: str) -> str:
        return hashlib.md5(f"{text}:{voice}:{self.provider}".encode()).hexdigest()

    def _kokoro_voice_to_edge(self, voice: str) -> str:
        return _EDGE_VOICE_MAP.get(voice, _EDGE_DEFAULT_VOICE)

    def _plan_speech(self, voice: str, language: str | None) -> _SpeechPlan:
        """Pick the voice that actually speaks the language of the text.

        English (or no language at all) keeps the child's chosen voice and the
        cache key it always had. Any other language swaps in a native voice of
        the same gender, since the voices a child can choose are all English.
        """

        resolved = resolve_language(language)
        if resolved is None or resolved == "english":
            return _SpeechPlan(voice, None, self._kokoro_voice_to_edge(voice), voice)

        spec = _LANGUAGES[resolved]
        male = len(voice) > 1 and voice[1] == "m"
        edge_voice = spec.edge_male if male else spec.edge_female
        if spec.kokoro_lang is None:
            return _SpeechPlan(None, None, edge_voice, edge_voice)

        if voice[:1] == spec.kokoro_lang:
            kokoro_voice = voice  # already a voice of this language
        else:
            kokoro_voice = spec.kokoro_male if male else spec.kokoro_female
        return _SpeechPlan(kokoro_voice, spec.kokoro_lang, edge_voice, kokoro_voice)

    async def generate_speech(
        self,
        text: str,
        voice: Optional[str] = None,
        *,
        language: str | None = None,
        kokoro_url: str | None = None,
    ) -> Optional[str]:
        voice = self._normalize_voice(voice or self.default_voice)
        if not text.strip():
            return None

        plan = self._plan_speech(voice, language)
        text_hash = self._get_text_hash(text, plan.cache_key)
        file_path = self.cache_dir / f"{text_hash}.mp3"

        if file_path.exists():
            return str(file_path)

        # Somebody else may already have synthesised this exact phrase. The path
        # is returned without a local file on purpose: the caller turns it into a
        # URL, and the store signs that URL itself.
        if self.audio_store is not None and self.audio_store.exists(file_path.name):
            return str(file_path)

        if self.provider == "edge" or (self.provider == "kokoro" and plan.kokoro_voice is None):
            # German and Russian land here under Kokoro: it has no voice for them.
            generated = await self._generate_with_edge_tts(text, plan.edge_voice, file_path)
        elif self.provider == "kokoro":
            generated = await self._generate_with_kokoro(text, plan, file_path, kokoro_url)
        else:
            return None

        if generated:
            await self._publish_to_store(Path(generated))
        return generated

    async def _publish_to_store(self, file_path: Path) -> None:
        """Copy a freshly synthesised file into the shared cache, best effort.

        A store that is down must not turn a successful synthesis into a failed
        request — the áudio already exists locally and the caller can use it.
        """

        if self.audio_store is None or not file_path.is_file():
            return
        try:
            data = await asyncio.to_thread(file_path.read_bytes)
            await asyncio.to_thread(self.audio_store.put, file_path.name, data)
        except Exception as exc:  # noqa: BLE001 - see docstring
            print(f"Áudio store upload failed for {file_path.name}: {exc}")

    async def _generate_with_edge_tts(self, text: str, edge_voice: str, file_path: Path) -> Optional[str]:
        edge_tts = _load_edge_tts()
        if edge_tts is None:
            print("TTS Error: edge-tts is not installed. Run: pip install edge-tts")
            return None

        try:
            communicate = edge_tts.Communicate(text, edge_voice)
            await communicate.save(str(file_path))
            return str(file_path)
        except Exception as e:
            print(f"Edge TTS Error: {e}")
            return None

    async def _generate_with_kokoro(
        self, text: str, plan: _SpeechPlan, file_path: Path, kokoro_url: str | None = None
    ) -> Optional[str]:
        try:
            payload = {
                "model": self.model,
                "input": text,
                "voice": plan.kokoro_voice,
                "response_format": "mp3"
            }
            if plan.kokoro_lang:
                # Pins the phonemizer as well as the timbre.
                payload["lang_code"] = plan.kokoro_lang
            # An explicit address wins over the probed defaults: on a host with
            # no Kokoro sidecar, probing localhost is four guaranteed failures.
            urls = [kokoro_url] if kokoro_url else self.kokoro_urls
            audio_bytes = await asyncio.to_thread(self._request_audio, payload, urls)
            if not audio_bytes:
                return None

            async with aiofiles.open(file_path, mode='wb') as f:
                await f.write(audio_bytes)
            return str(file_path)
        except Exception as e:
            print(f"Kokoro TTS unavailable ({e}), falling back to edge-tts...")
            return await self._generate_with_edge_tts(text, plan.edge_voice, file_path)

    def _request_audio(
        self, payload: dict[str, str], urls: list[str] | None = None
    ) -> Optional[bytes]:
        last_error: Exception | None = None

        for kokoro_url in (urls or self.kokoro_urls):
            try:
                response = requests.post(
                    kokoro_url,
                    json=payload,
                    timeout=self.request_timeout,
                    headers=(
                        {"X-Kokoro-Token": self.auth_token} if self.auth_token else None
                    ),
                )
                response.raise_for_status()
                if not response.content:
                    return None

                self.kokoro_url = kokoro_url
                return response.content
            except Exception as exc:
                last_error = exc

        if last_error:
            raise RuntimeError(
                f"Kokoro is not reachable. Tried: {', '.join(self.kokoro_urls)}. Last error: {last_error}"
            ) from last_error

        return None

    def get_audio_url(self, file_path: str) -> str:
        if not file_path:
            return ""
        filename = os.path.basename(file_path)
        return f"/api/audio/file/{filename}"
