"""FSRS-5 spaced-repetition scheduler with Anki-style learning steps.

Implements the Free Spaced Repetition Scheduler (FSRS) algorithm used by modern
Anki, combined with classic learning/relearning steps for cards that have not yet
graduated. Ratings follow Anki's 1-4 scale:

    1 = Again   2 = Hard   3 = Good   4 = Easy

The public entry point is :func:`schedule`, which takes the current card state and a
rating and returns the next state plus the number of days/minutes until the next
review. :func:`preview_intervals` returns the human-readable interval each of the
four buttons would produce, without mutating anything.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import datetime, timedelta

# Default FSRS-5 parameters (19 weights), matching Anki's defaults.
DEFAULT_W = [
    0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046,
    1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315,
    2.9898, 0.51655, 0.6621,
]

DEFAULT_W_STR = ", ".join(str(w) for w in DEFAULT_W)


def parse_weights(raw: str | None) -> list[float] | None:
    """Parse a comma/space separated list of 19 FSRS weights, or None to use defaults."""
    if not raw or not raw.strip():
        return None
    parts = [p for p in re.split(r"[\s,]+", raw.strip()) if p]
    try:
        values = [float(p) for p in parts]
    except ValueError:
        return None
    if len(values) != len(DEFAULT_W):
        return None
    return values

DECAY = -0.5
FACTOR = 19.0 / 81.0  # 0.9 ** (1/DECAY) - 1

MIN_DIFFICULTY = 1.0
MAX_DIFFICULTY = 10.0

AGAIN, HARD, GOOD, EASY = 1, 2, 3, 4

STATE_NEW = "new"
STATE_LEARNING = "learning"
STATE_REVIEW = "review"
STATE_RELEARNING = "relearning"


@dataclass
class CardState:
    state: str = STATE_NEW
    stability: float = 0.0
    difficulty: float = 0.0
    reps: int = 0
    lapses: int = 0
    learning_step: int = 0
    scheduled_days: int = 0
    last_reviewed: datetime | None = None


@dataclass
class DeckOptions:
    learning_steps: tuple[float, ...] = (1.0, 10.0)   # minutes
    relearning_steps: tuple[float, ...] = (10.0,)     # minutes
    graduating_interval: int = 1                       # days
    easy_interval: int = 4                             # days
    desired_retention: float = 0.9
    maximum_interval: int = 36500                      # days


@dataclass
class ScheduleResult:
    state: CardState
    due: datetime
    interval_minutes: float  # minutes until next review (for display/learning steps)


def parse_steps(raw: str, fallback: tuple[float, ...]) -> tuple[float, ...]:
    steps: list[float] = []
    for token in (raw or "").split():
        try:
            value = float(token)
        except ValueError:
            continue
        if value > 0:
            steps.append(value)
    return tuple(steps) if steps else fallback


# ── Core FSRS formulas ─────────────────────────────────────────────────────────

def _clamp_difficulty(d: float) -> float:
    return min(max(d, MIN_DIFFICULTY), MAX_DIFFICULTY)


def _init_difficulty(w: list[float], rating: int) -> float:
    return _clamp_difficulty(w[4] - math.exp(w[5] * (rating - 1)) + 1)


def _init_stability(w: list[float], rating: int) -> float:
    return max(w[rating - 1], 0.1)


def _next_difficulty(w: list[float], difficulty: float, rating: int) -> float:
    delta = -w[6] * (rating - 3)
    next_d = difficulty + delta * ((10 - difficulty) / 9)
    # mean reversion toward the difficulty of an "Easy" first answer
    d_easy = _init_difficulty(w, EASY)
    next_d = w[7] * d_easy + (1 - w[7]) * next_d
    return _clamp_difficulty(next_d)


def retrievability(elapsed_days: float, stability: float) -> float:
    if stability <= 0:
        return 0.0
    return (1 + FACTOR * elapsed_days / stability) ** DECAY


def _next_interval(stability: float, desired_retention: float, maximum_interval: int) -> int:
    interval = (stability / FACTOR) * (desired_retention ** (1 / DECAY) - 1)
    return max(1, min(round(interval), maximum_interval))


def _stability_after_recall(
    w: list[float], difficulty: float, stability: float, retr: float, rating: int
) -> float:
    hard_penalty = w[15] if rating == HARD else 1.0
    easy_bonus = w[16] if rating == EASY else 1.0
    growth = (
        math.exp(w[8])
        * (11 - difficulty)
        * (stability ** -w[9])
        * (math.exp(w[10] * (1 - retr)) - 1)
        * hard_penalty
        * easy_bonus
    )
    return stability * (1 + growth)


def _stability_after_forget(
    w: list[float], difficulty: float, stability: float, retr: float
) -> float:
    return (
        w[11]
        * (difficulty ** -w[12])
        * (((stability + 1) ** w[13]) - 1)
        * math.exp(w[14] * (1 - retr))
    )


def _short_term_stability(w: list[float], stability: float, rating: int) -> float:
    return stability * math.exp(w[17] * (rating - 3 + w[18]))


# ── Scheduling ─────────────────────────────────────────────────────────────────

def _graduate(
    w: list[float], card: CardState, options: DeckOptions, rating: int, now: datetime
) -> ScheduleResult:
    """Move a learning/new card into the review state."""
    if rating == EASY:
        interval = max(options.easy_interval, 1)
    else:
        interval = max(options.graduating_interval, 1)
    interval = min(interval, options.maximum_interval)
    new_state = CardState(
        state=STATE_REVIEW,
        stability=card.stability,
        difficulty=card.difficulty,
        reps=card.reps,
        lapses=card.lapses,
        learning_step=0,
        scheduled_days=interval,
        last_reviewed=now,
    )
    return ScheduleResult(state=new_state, due=now + timedelta(days=interval), interval_minutes=interval * 1440)


def schedule(
    card: CardState, rating: int, options: DeckOptions, now: datetime | None = None,
    w: list[float] | None = None,
) -> ScheduleResult:
    now = now or datetime.utcnow()
    w = w or DEFAULT_W
    rating = max(AGAIN, min(EASY, int(rating)))
    card = CardState(**{**card.__dict__})
    card.reps += 1

    # ── New card: initialise FSRS memory and enter the learning queue ──────────
    if card.state == STATE_NEW or card.stability <= 0:
        card.difficulty = _init_difficulty(w, rating)
        card.stability = _init_stability(w, rating)
        steps = options.learning_steps
        if rating == EASY or not steps:
            return _graduate(w, card, options, rating, now)
        # Again/Hard/Good start the learning ladder
        step_index = 0 if rating in (AGAIN, HARD) else min(1, len(steps) - 1)
        delay = steps[step_index] if rating != HARD else steps[0]
        if rating == GOOD and len(steps) == 1:
            return _graduate(w, card, options, rating, now)
        card.state = STATE_LEARNING
        card.learning_step = step_index
        return ScheduleResult(state=card, due=now + timedelta(minutes=delay), interval_minutes=delay)

    # ── Learning / relearning: walk the steps ladder ───────────────────────────
    if card.state in (STATE_LEARNING, STATE_RELEARNING):
        steps = options.learning_steps if card.state == STATE_LEARNING else options.relearning_steps
        card.stability = _short_term_stability(w, card.stability, rating)
        card.difficulty = _next_difficulty(w, card.difficulty, rating)
        if rating == EASY:
            return _graduate(w, card, options, rating, now)
        if rating == AGAIN:
            card.learning_step = 0
            delay = steps[0] if steps else 1.0
            return ScheduleResult(state=card, due=now + timedelta(minutes=delay), interval_minutes=delay)
        if rating == HARD:
            # repeat current step (or average with next, Anki-style)
            delay = steps[card.learning_step] if card.learning_step < len(steps) else (steps[-1] if steps else 1.0)
            return ScheduleResult(state=card, due=now + timedelta(minutes=delay), interval_minutes=delay)
        # GOOD: advance one step, graduate if past the last step
        next_step = card.learning_step + 1
        if next_step >= len(steps):
            return _graduate(w, card, options, rating, now)
        card.learning_step = next_step
        delay = steps[next_step]
        return ScheduleResult(state=card, due=now + timedelta(minutes=delay), interval_minutes=delay)

    # ── Review: full FSRS update ───────────────────────────────────────────────
    elapsed = 0.0
    if card.last_reviewed is not None:
        elapsed = max((now - card.last_reviewed).total_seconds() / 86400.0, 0.0)
    retr = retrievability(elapsed, card.stability)
    card.difficulty = _next_difficulty(w, card.difficulty, rating)

    if rating == AGAIN:
        card.lapses += 1
        card.stability = _stability_after_forget(w, card.difficulty, card.stability, retr)
        steps = options.relearning_steps
        if steps:
            card.state = STATE_RELEARNING
            card.learning_step = 0
            delay = steps[0]
            return ScheduleResult(state=card, due=now + timedelta(minutes=delay), interval_minutes=delay)
        interval = _next_interval(card.stability, options.desired_retention, options.maximum_interval)
        card.scheduled_days = interval
        return ScheduleResult(state=card, due=now + timedelta(days=interval), interval_minutes=interval * 1440)

    card.stability = _stability_after_recall(w, card.difficulty, card.stability, retr, rating)
    interval = _next_interval(card.stability, options.desired_retention, options.maximum_interval)
    card.scheduled_days = interval
    card.state = STATE_REVIEW
    return ScheduleResult(state=card, due=now + timedelta(days=interval), interval_minutes=interval * 1440)


def format_interval(minutes: float) -> str:
    """Human-readable interval label (pt-BR), Anki-style."""
    if minutes < 1:
        return "<1 min"
    if minutes < 60:
        return f"{round(minutes)} min"
    hours = minutes / 60
    if hours < 24:
        return f"{round(hours)} h"
    days = hours / 24
    if days < 30:
        return f"{round(days)} d"
    months = days / 30
    if months < 12:
        return f"{round(months)} mes" + ("es" if round(months) != 1 else "")
    years = days / 365
    return f"{years:.1f} a"


def preview_intervals(
    card: CardState, options: DeckOptions, now: datetime | None = None,
    w: list[float] | None = None,
) -> dict[str, str]:
    """Return the next-interval label for each of the four buttons."""
    now = now or datetime.utcnow()
    labels: dict[str, str] = {}
    for rating, key in ((AGAIN, "again"), (HARD, "hard"), (GOOD, "good"), (EASY, "easy")):
        result = schedule(card, rating, options, now=now, w=w)
        labels[key] = format_interval(result.interval_minutes)
    return labels
