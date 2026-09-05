'use client';

interface ActivityDetailsProps {
  details: Record<string, unknown> | null;
  compact?: boolean;
}

interface AnswerDetail {
  question_number?: number;
  question?: string;
  selected_option?: string;
  selected_options?: string[];
  correct?: boolean;
}

function answerDetails(details: Record<string, unknown> | null): AnswerDetail[] {
  if (!details) return [];
  const value = Array.isArray(details.answers) ? details.answers : Array.isArray(details.questions) ? details.questions : [];
  const answers = value.filter((item): item is AnswerDetail => Boolean(item && typeof item === 'object'));
  if (answers.length > 0 || typeof details.question !== 'string') return answers;
  return [details as AnswerDetail];
}

export function ActivityDetails({ details, compact = false }: ActivityDetailsProps) {
  const answers = answerDetails(details);
  const studiedText = typeof details?.studied_text === 'string' ? details.studied_text.trim() : '';
  if (answers.length === 0 && !studiedText) return null;

  return (
    <details className={`mt-3 rounded-xl border border-white/80 bg-white/60 ${compact ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
      <summary className="cursor-pointer text-xs font-black text-slate-600">
        {answers.length > 0 ? `Ver ${answers.length} ${answers.length === 1 ? 'resposta' : 'respostas'}` : 'Ver conteúdo estudado'}
      </summary>
      {studiedText && <p className="mt-2 whitespace-pre-wrap text-xs font-medium leading-relaxed text-slate-600">{studiedText}</p>}
      {answers.length > 0 && (
        <ol className="mt-2 space-y-1.5">
          {answers.map((answer, index) => {
            const selected = Array.isArray(answer.selected_options)
              ? answer.selected_options.join(', ')
              : answer.selected_option || 'Sem resposta';
            return (
              <li key={`${answer.question_number ?? index}-${index}`} className="text-xs text-slate-600">
                <span className="mr-1 font-black">{answer.correct ? '✅' : '❌'}</span>
                <span className="font-black">{answer.question_number ?? index + 1}.</span>{' '}
                <span>{answer.question || 'Questão'}</span>
                <span className="ml-1 font-semibold text-slate-500">→ {selected}</span>
              </li>
            );
          })}
        </ol>
      )}
    </details>
  );
}
