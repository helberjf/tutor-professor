# Vercel API latency design

## Problem

The production frontend is served quickly from Vercel's Sao Paulo edge, but the
authenticated API path is materially slower. The FastAPI function currently
runs in `iad1` (`us-east-1`) while the Supabase transaction pooler and database
run in `us-west-2`. Every database round trip therefore crosses the United
States. Cold starts also import `edge_tts` and its `aiohttp` dependency even
though production uses Kokoro, adding about one second to module import.

## Design

1. Pin the API's single Vercel Function region to `pdx1`, which is Vercel's
   `us-west-2` region and therefore colocated with the current Supabase project.
   Static frontend delivery remains global and unchanged.
2. Make `edge_tts` a lazy fallback import. Import it only when the Edge provider
   is selected or Kokoro actually falls back, while preserving the existing
   graceful behavior when the optional package is missing.
3. Keep the existing database, routes, authentication, audio storage, and VPS
   deployment path unchanged.

## Verification

- A source-level deployment test requires `apps/api/vercel.json` to select only
  `pdx1`.
- A service test proves importing `tts_service` does not import `edge_tts`, then
  proves the Edge path still synthesizes a file through a test implementation.
- Run the complete Python, frontend script, lint, typecheck, and build suites.
- Deploy the API, inspect the deployment to confirm `pdx1`, and repeat identical
  health, login, and cold/warm latency probes against production.

## Rollback

Remove the `regions` setting to return to Vercel's `iad1` default. Reverting the
lazy import restores the previous eager TTS import without changing stored data
or public URLs.
