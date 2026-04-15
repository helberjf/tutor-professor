import asyncio
import os
import hashlib
import requests
import aiofiles
from typing import Optional
from pathlib import Path

# edge-tts is optional — only imported when TTS_PROVIDER=edge
try:
    import edge_tts
    _EDGE_TTS_AVAILABLE = True
except ImportError:
    _EDGE_TTS_AVAILABLE = False

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


class TTSService:
    def __init__(self, provider: str = "kokoro", default_voice: str = "af_bella", cache_dir: str = "./audio_cache"):
        self.provider = provider
        self.default_voice = self._normalize_voice(default_voice)
        self.model = os.getenv("KOKORO_MODEL", "kokoro")
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        configured_url = os.getenv("KOKORO_URL", "").strip()
        self.kokoro_url = configured_url or "http://127.0.0.1:8880/v1/audio/speech"
        self.kokoro_urls = self._build_kokoro_urls(configured_url)
        self.request_timeout = float(os.getenv("KOKORO_TIMEOUT_SECONDS", "8"))

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

    async def generate_speech(self, text: str, voice: Optional[str] = None) -> Optional[str]:
        voice = self._normalize_voice(voice or self.default_voice)
        if not text.strip():
            return None

        text_hash = self._get_text_hash(text, voice)
        file_path = self.cache_dir / f"{text_hash}.mp3"

        if file_path.exists():
            return str(file_path)

        if self.provider == "edge":
            return await self._generate_with_edge_tts(text, voice, file_path)

        if self.provider == "kokoro":
            return await self._generate_with_kokoro(text, voice, file_path)

        return None

    async def _generate_with_edge_tts(self, text: str, voice: str, file_path: Path) -> Optional[str]:
        if not _EDGE_TTS_AVAILABLE:
            print("TTS Error: edge-tts is not installed. Run: pip install edge-tts")
            return None

        edge_voice = self._kokoro_voice_to_edge(voice)
        try:
            communicate = edge_tts.Communicate(text, edge_voice)
            await communicate.save(str(file_path))
            return str(file_path)
        except Exception as e:
            print(f"Edge TTS Error: {e}")
            return None

    async def _generate_with_kokoro(self, text: str, voice: str, file_path: Path) -> Optional[str]:
        try:
            payload = {
                "model": self.model,
                "input": text,
                "voice": voice,
                "response_format": "mp3"
            }
            audio_bytes = await asyncio.to_thread(self._request_audio, payload)
            if not audio_bytes:
                return None

            async with aiofiles.open(file_path, mode='wb') as f:
                await f.write(audio_bytes)
            return str(file_path)
        except Exception as e:
            print(f"Kokoro TTS unavailable ({e}), falling back to edge-tts...")
            return await self._generate_with_edge_tts(text, voice, file_path)

    def _request_audio(self, payload: dict[str, str]) -> Optional[bytes]:
        last_error: Exception | None = None

        for kokoro_url in self.kokoro_urls:
            try:
                response = requests.post(
                    kokoro_url,
                    json=payload,
                    timeout=self.request_timeout,
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
