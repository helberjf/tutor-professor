# Objective analysis across bounded requests

The existing complete-history pipeline rejects more than eleven batches before calling the provider, and also stops after 50 seconds. A reproducible 60-topic fixture produces 60 batches; even three batches fail with a simulated 25-second provider latency. Production logs show repeated HTTP 502 responses from the analyze route.

Increasing the operation timeout exceeds the API's 60-second hosting limit. Sampling or reducing the 60-topic selection violates the approved feature. Use a durable, resumable workflow with at most one external provider call per request.

- [x] Add a persisted private workflow on the objective, with a unique job ID, complete evidence snapshot, batch/consolidation cursor, validated summaries, and expiring claim token. Keep the published analysis until a complete final result passes current input, scope and curriculum checks.
- [x] Add POST `/api/objectives/{id}/analysis-job` to start or resume a matching incomplete job and POST `/api/objectives/{id}/analysis-job/{job_id}/step` to perform one bounded step. Response: `job_id`, `status` (`pending`, `running`, `complete`), `completed_steps`, `total_steps`, `objective` (only on completion). Never expose raw private workflow state.
- [x] Reserve a single platform credit for the workflow, count usage once on the first provider answer, and preserve that accounting across retries. Refund an unanswered failed operation; re-admit on its retry. Resolve provider settings without requiring a second credit for an already admitted job. Store no API keys in workflow JSON. Reject foreign profiles and changed inputs; claims prevent overlapping calls and stale workers from publishing.
- [x] Add failing regressions for more than twelve batches, cumulative latency above fifty seconds, resume after failure, invalid model output, stale scope, ownership, and metered billing. Preserve lossless evidence and hierarchy consolidation.
- [x] Change the frontend API helper to drive start/step requests, report progress, recover in-flight claims after transient connection failures, and return only the final objective. Display accessible progress in creation and existing cards. Do not restore manual task fields.
- [x] Run backend checks, web tests, typecheck, lint and build; use agent-browser with synthetic data to verify progress, retry and final publication visually. Request an independent review before merging.
- [ ] Apply the migration, deploy API, push main, and verify the actual public frontend deployment and API contract.

This fixes the already approved complete-history/60-topic behavior. No selection reduction, partial diagnosis, background work after a serverless response, or per-step credit charges.

## Validation

Read-only production diagnosis confirmed the reported objective has 38 selected topics, 157 records and 118 learning records; its approximately 350k-character history required 20 batches, exceeding the old 12-call limit. Its two failed requests returned HTTP 502 within 343ms, before provider work could run.

The workflow and component regressions passed. Independent reviews found and resolved resume after the last credit, refund when an objective/plan is deleted during an unanswered call, and consolidation of verbose 60-topic scopes. Provider scope metadata is compacted without dropping selected topic identity or original study text; summary sizes adapt to the real remaining context budget. AI rate admission counts the operation once rather than each HTTP step.

agent-browser verified a single 60-topic objective save, a simulated failure after 4 parts, resume from 4/14 and a final percentage/gap/ordered-plan result. A second failed update retained the previous diagnosis and resumed successfully. Dark 390px mobile and light 1280px desktop screenshots were inspected with no horizontal overflow. The browser and fixture/dev servers were closed. Visual verification used synthetic study/provider data; it made no paid live-provider calls.

Production migration 0041 was applied and its nullable private workflow column verified. The temporary production environment file was removed after verification.

The primary agent independently reran the job HTTP/pure, in-flight deletion refund and migration 0041 suites; all passed. Tenant isolation, workflow/helper/component/objective/plan web tests, TypeScript, ESLint, Next production build and dark-mode coverage passed. Both independent reviewers approved the final implementation.
