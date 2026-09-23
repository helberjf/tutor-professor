/** Types and pure helpers shared by the study page and its components.
 *
 * Extracted from page.tsx so the presentational components can live in their own
 * files without importing the page container (which would be a cycle).
 */
import type { PomodoroMode } from '@/lib/pomodoro';
import { t } from '@/lib/i18n';

export type StudyTab = 'english' | 'coding' | 'diverse' | 'dashboard';
export type CodingMode = 'reading' | 'flashcards' | 'questions' | 'exam';

export function getLocalDateValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function formatDateLabel(value: string | null) {
  if (!value) return 'Nenhum registro';
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', {
    weekday: 'short', day: '2-digit', month: 'short',
  });
}

export function getPomodoroCompletionMessage(mode: PomodoroMode) {
  return mode === 'focus'
    ? t("Bloco de foco concluído. Hora de uma pausa.")
    : t("Pausa concluída. Hora de voltar ao foco.");
}
