# Helber Coding Course Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add and run a durable coding-course seed for Henrique with an expanded AWS Cloud Practitioner course and the requested interview/system/frontend/devops subjects.

**Architecture:** Create a standalone Python seed module with a versioned in-code course catalog and reusable upsert function. Add a focused test that uses a temporary SQLite database and the existing SQLModel tables to prove catalog completeness, idempotency, and preservation of user fields.

**Tech Stack:** Python, SQLModel, existing FastAPI models, local PostgreSQL, `pg_dump` through the existing PostgreSQL container.

---

### Task 1: Failing Seed Test

**Files:**
- Create: `scripts/test_seed_helber_coding_courses.py`

- [ ] **Step 1: Write a failing test**

Create tests that import `scripts.seed_helber_coding_courses`, validate the catalog, seed a temp SQLite database twice, and assert no duplicates.

- [ ] **Step 2: Run the test and verify it fails**

Run: `python scripts/test_seed_helber_coding_courses.py`

Expected: fail because `scripts.seed_helber_coding_courses` does not exist yet.

### Task 2: Seed Module

**Files:**
- Create: `scripts/seed_helber_coding_courses.py`

- [ ] **Step 1: Implement the course catalog**

Add the requested subjects, with AWS as the largest course. Generate reading sections, quiz questions, and flashcards from structured topic definitions so the file stays maintainable.

- [ ] **Step 2: Implement idempotent upsert**

Find the target user and child. Upsert subjects and topics by normalized names. Preserve existing topic status and notes. Insert only missing flashcards and review items.

- [ ] **Step 3: Run the focused test**

Run: `python scripts/test_seed_helber_coding_courses.py`

Expected: pass.

### Task 3: Real Database Run

**Files:**
- No source change required.

- [ ] **Step 1: Create a PostgreSQL backup before seeding**

Use the existing local PostgreSQL container and write a timestamped dump under `tmp/backups`.

- [ ] **Step 2: Run the seed against `helberjf@gmail.com` / `Henrique`**

Run: `python scripts/seed_helber_coding_courses.py --email helberjf@gmail.com --child Henrique`

- [ ] **Step 3: Create a PostgreSQL backup after seeding**

Write a second timestamped dump under `tmp/backups`.

- [ ] **Step 4: Verify data**

Query the local database and the API for subject counts, topic counts, AWS depth, and at least one topic's reading/flashcard content.

### Task 4: Commit and Push

**Files:**
- `docs/superpowers/specs/2026-07-14-helber-coding-course-seed-design.md`
- `docs/superpowers/plans/2026-07-14-helber-coding-course-seed.md`
- `scripts/test_seed_helber_coding_courses.py`
- `scripts/seed_helber_coding_courses.py`

- [ ] **Step 1: Run final verification**

Run the focused seed test and a DB summary check.

- [ ] **Step 2: Commit**

Commit the source/docs changes on `main`.

- [ ] **Step 3: Push**

Push `main` to origin.

