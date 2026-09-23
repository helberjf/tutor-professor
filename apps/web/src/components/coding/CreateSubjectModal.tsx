'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { type ProgrammingSubject } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useCurriculumApi, useCurriculumTrack } from './curriculum-context';

const CONTEXT_PLACEHOLDER = `Instruções extras ou um guia de como a matéria deve ser organizada.

Ex (React):
1. Introdução
2. Fundamentos básicos
3. JSX e componentes
...
15. Implementações avançadas

Ou só instruções: foco no exame AWS SAA-C03, estilo de prova, nível avançado.`;

const GENERAL_CONTEXT_PLACEHOLDER = `Instruções extras ou um guia de como a matéria deve ser organizada.

Ex (Francês):
1. Pronúncia e saudações
2. Artigos e gênero
3. Presente dos verbos
...
15. Subjuntivo

Ou só instruções: foco na prova DELF B1, nível intermediário.`;

interface Props {
  onClose: () => void;
  onCreated: (subject: ProgrammingSubject) => void;
  /** Opened from "Sugerir matéria por IA": ask for a proposal right away. */
  autoSuggest?: boolean;
}

export function CreateSubjectModal({ onClose, onCreated, autoSuggest = false }: Props) {
  const curriculum = useCurriculumApi();
  const general = useCurriculumTrack() === 'general';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [contextEnabled, setContextEnabled] = useState(false);
  const [context, setContext] = useState('');
  const [emoji, setEmoji] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionReason, setSuggestionReason] = useState('');
  const autoSuggestedRef = useRef(false);

  // The AI only proposes: the fields are filled for the reader to keep, edit
  // or discard, and nothing is created until "Criar Matéria".
  async function suggestSubject() {
    setSuggesting(true);
    setError('');
    try {
      const suggestion = await curriculum.suggestSubject();
      setName(suggestion.name);
      setDescription(suggestion.description);
      setEmoji(suggestion.icon_emoji ?? '');
      setSuggestionReason(suggestion.reason);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("Não foi possível sugerir uma matéria agora."));
    } finally {
      setSuggesting(false);
    }
  }

  useEffect(() => {
    if (!autoSuggest || autoSuggestedRef.current) return;
    autoSuggestedRef.current = true;
    void suggestSubject();
  // Runs once when the modal opens from the suggestion button.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSuggest]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const subject = await curriculum.createCodingSubject({
        name: name.trim(),
        description: description.trim() || undefined,
        context: contextEnabled ? context.trim() || undefined : undefined,
        icon_emoji: emoji.trim() || undefined,
      });
      onCreated(subject);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("Erro ao criar matéria."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-800">{t("Nova Matéria")}</h2>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <button
            type="button"
            onClick={() => void suggestSubject()}
            disabled={suggesting || loading}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border-2 border-violet-200 bg-violet-50 px-4 text-sm font-black text-violet-700 hover:bg-violet-100 disabled:opacity-50"
          >
            {suggesting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {suggesting
              ? t("Pensando na próxima matéria...")
              : suggestionReason
                ? t("Sugerir outra matéria")
                : t("Sugerir matéria por IA?")}
          </button>
          {suggestionReason && (
            <p className="rounded-2xl bg-violet-50 px-4 py-3 text-xs font-bold text-violet-800 dark:bg-violet-400/10 dark:text-violet-100">
              <span className="block text-[11px] font-black uppercase tracking-wide text-violet-500">{t("Por que esta agora")}</span>
              {suggestionReason}
            </p>
          )}
          <div className="flex gap-3">
            <input
              aria-label={general ? '📘' : '⚛️'}
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder={general ? '📘' : '⚛️'}
              maxLength={2}
              className="w-16 rounded-2xl border-2 border-slate-200 bg-white px-3 py-3 text-center text-xl outline-none focus:border-primary"
            />
            <input
              aria-label={t("Nome da matéria")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={general ? t("Nome da matéria (ex: Francês)") : t("Nome da matéria (ex: React)")}
              maxLength={100}
              required
              autoFocus
              className="min-w-0 flex-1 rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 outline-none focus:border-primary"
            />
          </div>
          <input
              aria-label={t("Descrição")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("Descrição (opcional)")}
            maxLength={500}
            className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 outline-none focus:border-primary"
          />
          <div className="rounded-2xl border-2 border-slate-200 p-4">
            <button
              type="button"
              role="switch"
              aria-checked={contextEnabled}
              onClick={() => setContextEnabled((v) => !v)}
              className="flex w-full items-center justify-between gap-3"
            >
              <span className="text-left text-sm font-bold text-slate-700">
                {t("Adicionar contexto para a IA")}
                <span className="mt-0.5 block text-xs font-medium text-slate-400">
                  {t("Instruções extras ou um roteiro de tópicos usados ao gerar o conteúdo desta matéria")}
                </span>
              </span>
              <span
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${contextEnabled ? 'bg-primary-dark' : 'bg-slate-300'}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${contextEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
                />
              </span>
            </button>
            {contextEnabled && (
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder={general ? GENERAL_CONTEXT_PLACEHOLDER : CONTEXT_PLACEHOLDER}
                maxLength={2000}
                rows={7}
                className="mt-3 w-full resize-y rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 outline-none focus:border-primary"
              />
            )}
          </div>
          {error && <p className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-2xl border-2 border-slate-200 py-3 font-bold text-slate-600 hover:bg-slate-50">
              {t("Cancelar")}
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary-dark py-3 font-black text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : t("Criar Matéria")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
