# Admin Overview, Notifications and Account Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a clear admin overview with recent account events and let the administrator permanently delete any non-admin account.

**Architecture:** Extend the existing `/api/admin/overview` response with a compact, derived notification feed built from `User.created_at`, `User.status`, and `User.reviewed_at`. Add an admin-only delete endpoint that delegates to the existing complete account-erasure service, then expose it through the API client and account queue with an explicit browser confirmation.

**Tech Stack:** FastAPI, SQLModel, Next.js 15, React 19, TypeScript, Tailwind CSS, Python integration/source-contract tests.

---

### Task 1: Backend notification feed

**Files:**
- Modify: `scripts/test_admin_account_approval.py`
- Modify: `apps/api/main.py`

- [x] **Step 1: Write the failing integration assertions**

After the first family registers, assert that `/api/admin/overview` returns `recent_notifications` whose first item has type `account_approval_requested`, the family's id/email/name, status `pending`, and the signup time.

- [x] **Step 2: Run the test and verify RED**

Run: `python scripts/test_admin_account_approval.py`

Expected: FAIL because `recent_notifications` is absent.

- [x] **Step 3: Implement the derived feed**

Add a helper in `apps/api/main.py` that emits one event per non-admin account: pending accounts become `account_approval_requested` at `created_at`; reviewed accounts become `account_approved` or `account_rejected` at `reviewed_at`. Sort descending and keep the latest five, then include them in the overview response.

- [x] **Step 4: Run the integration test and verify GREEN**

Run: `python scripts/test_admin_account_approval.py`

Expected: PASS.

### Task 2: Admin account deletion API

**Files:**
- Modify: `scripts/test_admin_account_approval.py`
- Modify: `apps/api/main.py`

- [x] **Step 1: Write failing deletion assertions**

Assert that a non-admin account can be deleted through `DELETE /api/admin/users/{user_id}`, its open session becomes unauthorized, it disappears from the admin list, an unknown id returns 404, and deleting the administrator returns 409.

- [x] **Step 2: Run the test and verify RED**

Run: `python scripts/test_admin_account_approval.py`

Expected: FAIL with 405 because the admin delete route does not exist.

- [x] **Step 3: Implement the endpoint**

Require the current administrator, resolve the target user, reject a missing user with 404 and the administrator account with 409, call `account_data.delete_account(session, user)`, log the result, and return `{ "status": "deleted", "removed": deleted }`.

- [x] **Step 4: Run the integration test and verify GREEN**

Run: `python scripts/test_admin_account_approval.py`

Expected: PASS.

### Task 3: Web contract and admin interface

**Files:**
- Create: `scripts/test_admin_dashboard_ui.py`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/admin/page.tsx`
- Modify: `apps/web/src/components/admin-account-queue.tsx`

- [x] **Step 1: Write the failing source-contract test**

Require the API types to expose `AdminNotification`, `recent_notifications`, and `adminDeleteUser`; require the dashboard to render `Visão geral` and `Últimas notificações`; require the account queue to render `Apagar conta`, call `window.confirm`, and remove the deleted id from local state.

- [x] **Step 2: Run the UI test and verify RED**

Run: `python scripts/test_admin_dashboard_ui.py`

Expected: FAIL because the new contract and controls are absent.

- [x] **Step 3: Implement the TypeScript API contract**

Define notification event types and add `recent_notifications` to `AdminOverview`. Add `adminDeleteUser(userId)` using `DELETE /api/admin/users/{userId}` and returning the deletion summary.

- [x] **Step 4: Implement the dashboard feed**

Label the metric block `Visão geral`. Add a responsive `Últimas notificações` section that shows account-request/approval/rejection icons, names, emails, localized timestamps, status-specific colors, and a link to the account queue; show a calm empty state when there are no events.

- [x] **Step 5: Implement the destructive account action**

For each non-admin account in `AdminAccountQueue`, add a separated danger row with `Apagar conta`. Confirm the email and permanent scope, call the endpoint, remove the account from `users`, and display success/error feedback. Never render this action for the administrator.

- [x] **Step 6: Run the UI test and verify GREEN**

Run: `python scripts/test_admin_dashboard_ui.py`

Expected: PASS.

### Task 4: Full verification

**Files:**
- Verify only.

- [x] **Step 1: Run focused behavior checks**

Run: `python scripts/test_admin_account_approval.py` and `python scripts/test_admin_dashboard_ui.py`.

Expected: both PASS.

- [x] **Step 2: Run web static verification**

Run from `apps/web`: `pnpm typecheck` and `pnpm lint`.

Expected: both exit 0.

- [x] **Step 3: Run the security route audit**

Run: `python scripts/test_tenant_isolation.py`.

Expected: PASS, including admin-only access to the new route.
