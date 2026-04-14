import asyncio
import os
import hashlib
import requests
import aiofiles
from typing import Optional
from pathlib import Path

class TTSService:
    def __init__(self, provider: str = "kokoro", default_voice: str = "af_heart", cache_dir: str = "./audio_cache"):
        self.provider = provider
        self.default_voice = default_voice
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        # Local Kokoro API endpoint (assuming it's running in another container or local service)
        self.kokoro_url = os.getenv("KOKORO_URL", "http://localhost:8888/v1/audio/speech")
        self.request_timeout = float(os.getenv("KOKORO_TIMEOUT_SECONDS", "8"))

    def _get_text_hash(self, text: str, voice: str) -> str:
        return hashlib.md5(f"{text}:{voice}".encode()).hexdigest()

    async def generate_speech(self, text: str, voice: Optional[str] = None) -> Optional[str]:
        voice = voice or self.default_voice
        if not text.strip():
            return None

        text_hash = self._get_text_hash(text, voice)
        file_path = self.cache_dir / f"{text_hash}.mp3"

        # Check cache
        if file_path.exists():
            return str(file_path)

        # Generate using Kokoro (or fallback)
        if self.provider == "kokoro":
            try:
                payload = {
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
                print(f"TTS Error: {e}")
                return None
        
        return None

    def _request_audio(self, payload: dict[str, str]) -> Optional[bytes]:
        response = requests.post(
            self.kokoro_url,
            json=payload,
            timeout=self.request_timeout,
        )
        response.raise_for_status()
        if not response.content:
            return None
        return response.content

    def get_audio_url(self, file_path: str) -> str:
        if not file_path:
            return ""
        filename = os.path.basename(file_path)
        return f"/api/audio/file/{filename}"
