import type { DeckRating } from '@/lib/api';

export type AnswerVerdict = 'exact' | 'close' | 'wrong';
export type DiffKind = 'ok' | 'missing' | 'extra';

export interface DiffPart {
  text: string;
  kind: DiffKind;
}

export interface AnswerComparison {
  verdict: AnswerVerdict;
  similarity: number;
  diff: DiffPart[];
}

/** Acima disso a resposta digitada conta como "quase" em vez de errada. */
export const CLOSE_THRESHOLD = 0.85;

const MAX_COMPARE_CHARS = 1200;
const MAX_DIFF_TOKENS = 600;

/** Normaliza texto em prosa: sem acento, sem pontuação, minúsculo, espaços colapsados. */
export function normalizeAnswer(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normaliza código: mantém caixa e pontuação, só colapsa espaços e indentação. */
export function normalizeCode(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    const swap = previous;
    previous = current;
    current = swap;
  }

  return previous[b.length];
}

/** Semelhança entre 0 (nada a ver) e 1 (idêntico), já normalizada pelo tamanho. */
export function similarity(a: string, b: string): number {
  const left = a.slice(0, MAX_COMPARE_CHARS);
  const right = b.slice(0, MAX_COMPARE_CHARS);
  const longest = Math.max(left.length, right.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(left, right) / longest;
}

interface Token {
  raw: string;
  norm: string;
}

function tokenize(value: string, code: boolean): Token[] {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({ raw, norm: code ? raw : normalizeAnswer(raw) }))
    .filter((token) => token.norm.length > 0)
    .slice(0, MAX_DIFF_TOKENS);
}

function pushPart(parts: DiffPart[], text: string, kind: DiffKind) {
  const last = parts[parts.length - 1];
  if (last && last.kind === kind) {
    last.text = `${last.text} ${text}`;
    return;
  }
  parts.push({ text, kind });
}

/**
 * Diff palavra a palavra (LCS) entre o que foi digitado e o esperado.
 * `ok` = acertou, `extra` = escreveu a mais, `missing` = faltou.
 */
export function diffWords(typed: string, expected: string, code = false): DiffPart[] {
  const left = tokenize(typed, code);
  const right = tokenize(expected, code);
  const parts: DiffPart[] = [];

  const table: number[][] = Array.from({ length: left.length + 1 }, () =>
    new Array<number>(right.length + 1).fill(0),
  );
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        left[i].norm === right[j].norm
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i].norm === right[j].norm) {
      pushPart(parts, right[j].raw, 'ok');
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      pushPart(parts, left[i].raw, 'extra');
      i += 1;
    } else {
      pushPart(parts, right[j].raw, 'missing');
      j += 1;
    }
  }
  while (i < left.length) {
    pushPart(parts, left[i].raw, 'extra');
    i += 1;
  }
  while (j < right.length) {
    pushPart(parts, right[j].raw, 'missing');
    j += 1;
  }

  return parts;
}

/** Compara a resposta digitada com o verso do card. Nunca decide a nota sozinha. */
export function compareAnswer(
  typed: string,
  expected: string,
  options: { code?: boolean } = {},
): AnswerComparison {
  const code = options.code === true;
  const normalizedTyped = code ? normalizeCode(typed) : normalizeAnswer(typed);
  const normalizedExpected = code ? normalizeCode(expected) : normalizeAnswer(expected);
  const score = similarity(normalizedTyped, normalizedExpected);

  let verdict: AnswerVerdict = 'wrong';
  if (normalizedTyped.length > 0 && normalizedTyped === normalizedExpected) {
    verdict = 'exact';
  } else if (normalizedTyped.length > 0 && score >= CLOSE_THRESHOLD) {
    verdict = 'close';
  }

  return { verdict, similarity: score, diff: diffWords(typed, expected, code) };
}

/**
 * Nota sugerida (não aplicada) a partir do resultado e de quantas tentativas
 * foram usadas: acertar de primeira vale mais do que acertar na segunda.
 */
export function suggestRating(verdict: AnswerVerdict, attempts: number): DeckRating {
  const tries = Math.max(1, Math.floor(attempts));
  if (tries === 1) {
    if (verdict === 'exact') return 'good';
    if (verdict === 'close') return 'hard';
    return 'again';
  }
  return verdict === 'exact' ? 'hard' : 'again';
}
