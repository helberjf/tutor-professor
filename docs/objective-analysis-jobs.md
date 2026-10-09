# Resumable objective analysis API

Run `python apps/api/database_bootstrap.py` with `DATABASE_URL` set to the target
database before deploying API code. Migration `0041` adds nullable
`objective.analysis_workflow` JSON; it preserves existing scopes, diagnoses and
foreign keys. Existing `create_all` installations are accepted and upgraded.
From `apps/api`, `python -m alembic upgrade head` is also supported on an already
versioned database. The Vercel API does not run migrations at startup.

Both routes require the normal authenticated parent session and active owned
profile. They take no request body:

| Request | Behavior |
| --- | --- |
| `POST /api/objectives/{id}/analysis-job` | Snapshot the complete selected evidence, or resume the same incomplete snapshot. Changed study evidence, objective, scope, curriculum, audience or provider settings starts a new job. A completed job starts a fresh review. Starting makes no provider call and reserves no credit. |
| `POST /api/objectives/{id}/analysis-job/{job_id}/step` | Run at most one provider call with a 45-second timeout; validate and persist one checkpoint. Repeated calls while a claim is active return `running` without another provider call. A lost final response can be recovered by repeating the same completed step. |

Each successful response has this exact envelope:

```json
{
  "job_id": "UUID",
  "status": "pending",
  "completed_steps": 1,
  "total_steps": 62,
  "objective": null
}
```

`status` is `pending`, `running` or `complete`. `objective` contains the normal
objective schema only when complete. `total_steps` can increase when the actual
summary sizes require another consolidation round; callers should keep driving
steps until `complete`. Objective reads include `study_analysis_pending`, a safe
boolean to expose the resume action even when the account has spent its last
credit. Private snapshots, summaries, claim tokens and billing receipts never
appear in objective responses or account exports. API keys are resolved per
request and never stored in workflow JSON.

Steps claim the objective for 90 seconds. Database row locks cover only claims,
billing and checkpoints; transactions are released before calling the provider.
Expired claims can be taken over, and old workers cannot publish, release a
replacement claim or charge again. Validated earlier checkpoints survive a
failure; the previously published diagnosis remains until the complete final
assessment validates against current objective, scope and curriculum signatures.
Provider-only scope metadata deduplicates shared subject labels and summary
limits adapt to the actual prompt budget, preserving all selected topics and
the full original evidence.

The first provider step reserves one metered platform credit and admits the
whole job against the AI rate limit. The first provider answer records usage
once, including an answered but invalid response. All later steps and retries
reuse this admission. An unanswered failure refunds the reservation and its
next retry checks credit again. Credits are refunded only within their original
allowance day, so a late failure cannot enlarge a newly refreshed allowance.
Own keys record usage once without consuming platform credit. Deleting an
objective or deleting its plan with objectives refunds an unanswered reserved
credit atomically before erasing the workflow receipt.

Errors use the usual `detail` response: `404` for foreign/missing objectives or
replaced job IDs, `409` for changed inputs/settings or stale workers, `422` for
missing/unavailable study scope, `403` for missing key settings, `402` when an
unadmitted step has no credit, `429` when a new job exceeds the AI operation
rate limit, and `502` for failed provider calls or invalid output. Retrying a
`502` uses the same job; updating settings or scope requires starting again.

The legacy `POST /api/objectives/{id}/analyze` remains backward compatible and
retains its configurable 12-call/50-second operation limits. The resumable routes
have no total operation call or time cap and never sample selected study data.
