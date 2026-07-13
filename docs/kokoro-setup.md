# Kokoro TTS Setup

This document provides instructions on how to set up and integrate Kokoro Text-to-Speech (TTS) with the Tutor and Professor backend. Kokoro is used to generate natural-sounding audio for words and phrases, enhancing the learning experience for children.

## What is Kokoro TTS?

Kokoro is a powerful, local-first text-to-speech engine that can run on your machine, often leveraging GPU acceleration for high-quality, low-latency audio generation. For this project, we assume you will be running a Kokoro server locally that the FastAPI backend can communicate with.

## Installation and Setup of Kokoro TTS Server

Since Kokoro is a separate project, you will need to follow its official installation instructions. Typically, this involves:

1.  **Cloning the Kokoro Repository**: Obtain the Kokoro project files from its official source.
2.  **Installing Dependencies**: Install Python dependencies and potentially GPU-related libraries if you plan to use a GPU.
3.  **Downloading Models**: Download the necessary voice models for the languages and voices you wish to use.
4.  **Running the Kokoro Server**: Start the Kokoro API server, which will expose an endpoint for TTS generation.

**Please refer to the official Kokoro TTS documentation for the most up-to-date and detailed installation instructions.**

*   [Kokoro TTS GitHub Repository](https://github.com/remsky/kokoro-fastapi-gpu) (Example, verify the official source)

**Key considerations during Kokoro setup:**

*   **API Endpoint**: Ensure the Kokoro server is configured to run on a specific port (the current default is `8880`) and is accessible from your FastAPI backend.
*   **Voice Models**: Download the voice models you intend to use. The `af_bella` voice is used as a default in this project.

## Configuring the Tutor and Professor Backend for Kokoro

Once your Kokoro TTS server is running, you need to configure the FastAPI backend to communicate with it.

### Environment Variables

In your backend's `.env` file (`apps/api/.env`), ensure the following variables are set:

*   **`TTS_PROVIDER`**: Set this to `kokoro`.
*   **`KOKORO_URL`**: This should be the URL where your local Kokoro TTS server is running. The default in this project is `http://127.0.0.1:8880/v1/audio/speech`.
*   **`KOKORO_MODEL`**: Set this to `kokoro` for the OpenAI-compatible speech endpoint used by this project.
*   **`KOKORO_DEFAULT_VOICE`**: Specify the default voice to use (e.g., `af_bella`).
*   **`AUDIO_CACHE_DIR`**: The directory where generated audio files will be cached. Default is `./audio_cache`.

**Example `.env` configuration:**

```ini
TTS_PROVIDER=kokoro
KOKORO_URL=http://127.0.0.1:8880/v1/audio/speech
KOKORO_MODEL=kokoro
KOKORO_DEFAULT_VOICE=af_bella
AUDIO_CACHE_DIR=./audio_cache
```

### Backend Integration Details

The backend's `services/tts_service.py` handles the integration with the Kokoro API. It includes:

*   **`TTSService` class**: Manages the TTS provider, default voice, and audio caching.
*   **`generate_speech` method**: Sends text to the Kokoro server and caches the resulting audio file locally.
*   **`get_audio_url` method**: Provides a URL to access the cached audio files via a static files endpoint in FastAPI.

### API Endpoint for Audio Generation

The backend exposes a `POST /api/audio/speak` endpoint that the frontend can call to request audio for a given text. This endpoint uses the `TTSService` to interact with Kokoro.

## Fallback Mechanism

In case the Kokoro TTS server is not running or fails to generate audio, the system is designed to provide a textual fallback. This ensures that the application remains functional even without the audio component, though the full learning experience will be enhanced with TTS.

## Running Kokoro with Docker (Optional)

If you are using Docker Compose for your project, you can integrate the Kokoro TTS server as another service. An example of a commented-out Kokoro service is available in the `docker-compose.yml` file in the project root. You would typically use a pre-built Docker image for Kokoro.

**Example `docker-compose.yml` snippet (uncomment and configure):**

```yaml
  # kokoro-tts:
  #   image: ghcr.io/remsky/kokoro-fastapi-cpu:v0.1.4
  #   ports:
  #     - "8880:8880"
  #   networks:
  #     - kids-tutor-net
  #   # Add any necessary environment variables or volumes for models
```

Ensure that the `KOKORO_URL` in your `api` service's `.env` file points to the Docker service name (e.g., `http://kokoro-tts:8880/v1/audio/speech`) if running within the same Docker Compose network. If you are running Kokoro outside of Docker, `http://127.0.0.1:8880` is appropriate.
