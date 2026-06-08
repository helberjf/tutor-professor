export const POMODORO_STORAGE_KEY = 'english-kids-tutor:pomodoro:v1';
export const FOCUS_SECONDS = 25 * 60;
export const BREAK_SECONDS = 5 * 60;

export type PomodoroMode = 'focus' | 'break';

export interface PomodoroState {
  mode: PomodoroMode;
  seconds: number;
  running: boolean;
  startedAt: number | null;
  endsAt: number | null;
  sessionId: string | null;
  countedSessionIds: string[];
  completedByDate: Record<string, number>;
  lastCompletedAt: number | null;
}

export function getLocalDateKey(timestamp = Date.now()): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createInitialPomodoroState(): PomodoroState {
  return {
    mode: 'focus',
    seconds: FOCUS_SECONDS,
    running: false,
    startedAt: null,
    endsAt: null,
    sessionId: null,
    countedSessionIds: [],
    completedByDate: {},
    lastCompletedAt: null,
  };
}

export function getModeSeconds(mode: PomodoroMode): number {
  return mode === 'focus' ? FOCUS_SECONDS : BREAK_SECONDS;
}

export function getTodaysPomodoroCount(state: PomodoroState, now = Date.now()): number {
  return state.completedByDate[getLocalDateKey(now)] ?? 0;
}

export function formatTimer(seconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(safeSeconds / 60).toString().padStart(2, '0');
  const s = (safeSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function trimCountedSessionIds(ids: string[]): string[] {
  return ids.slice(-30);
}

export function resolvePomodoroState(state: PomodoroState, now = Date.now()): PomodoroState {
  if (!state.running || state.endsAt === null) return state;

  const remainingSeconds = Math.ceil((state.endsAt - now) / 1000);
  if (remainingSeconds > 0) {
    return { ...state, seconds: remainingSeconds };
  }

  const nextMode: PomodoroMode = state.mode === 'focus' ? 'break' : 'focus';
  const completedByDate = { ...state.completedByDate };
  const countedSessionIds = [...state.countedSessionIds];
  const alreadyCounted = Boolean(state.sessionId && countedSessionIds.includes(state.sessionId));

  if (state.mode === 'focus' && !alreadyCounted) {
    const completedAt = state.endsAt;
    const completedDay = getLocalDateKey(completedAt);
    completedByDate[completedDay] = (completedByDate[completedDay] ?? 0) + 1;
    if (state.sessionId) countedSessionIds.push(state.sessionId);
  }

  return {
    ...state,
    mode: nextMode,
    seconds: getModeSeconds(nextMode),
    running: false,
    startedAt: null,
    endsAt: null,
    sessionId: null,
    countedSessionIds: trimCountedSessionIds(countedSessionIds),
    completedByDate,
    lastCompletedAt: state.endsAt,
  };
}

export function startPomodoro(state: PomodoroState, now = Date.now()): PomodoroState {
  const resolved = resolvePomodoroState(state, now);
  const seconds = Math.max(1, resolved.seconds || getModeSeconds(resolved.mode));
  return {
    ...resolved,
    seconds,
    running: true,
    startedAt: now,
    endsAt: now + seconds * 1000,
    sessionId: resolved.sessionId ?? `${now}-${Math.random().toString(36).slice(2)}`,
  };
}

export function pausePomodoro(state: PomodoroState, now = Date.now()): PomodoroState {
  const resolved = resolvePomodoroState(state, now);
  if (!resolved.running || resolved.endsAt === null) return resolved;

  return {
    ...resolved,
    seconds: Math.max(0, Math.ceil((resolved.endsAt - now) / 1000)),
    running: false,
    startedAt: null,
    endsAt: null,
  };
}

export function resetPomodoro(state: PomodoroState, mode: PomodoroMode = state.mode): PomodoroState {
  return {
    ...state,
    mode,
    seconds: getModeSeconds(mode),
    running: false,
    startedAt: null,
    endsAt: null,
    sessionId: null,
  };
}

export function parseStoredPomodoroState(raw: string | null): PomodoroState {
  if (!raw) return createInitialPomodoroState();

  try {
    const parsed = JSON.parse(raw) as Partial<PomodoroState>;
    const initial = createInitialPomodoroState();
    const mode: PomodoroMode = parsed.mode === 'break' ? 'break' : 'focus';

    return {
      ...initial,
      ...parsed,
      mode,
      seconds: typeof parsed.seconds === 'number' ? parsed.seconds : getModeSeconds(mode),
      running: Boolean(parsed.running),
      startedAt: typeof parsed.startedAt === 'number' ? parsed.startedAt : null,
      endsAt: typeof parsed.endsAt === 'number' ? parsed.endsAt : null,
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
      countedSessionIds: Array.isArray(parsed.countedSessionIds) ? parsed.countedSessionIds.map(String) : [],
      completedByDate:
        parsed.completedByDate && typeof parsed.completedByDate === 'object'
          ? parsed.completedByDate
          : {},
      lastCompletedAt: typeof parsed.lastCompletedAt === 'number' ? parsed.lastCompletedAt : null,
    };
  } catch {
    return createInitialPomodoroState();
  }
}
