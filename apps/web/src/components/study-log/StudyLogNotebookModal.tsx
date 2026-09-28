'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { Check, Copy, Download, Loader2, Sparkles, X } from 'lucide-react';

import { ApiError, api, type StudyLogNotebook } from '@/lib/api';
import { t, tf } from '@/lib/i18n';

import { notebookFileName } from './study-log-helpers';

const DeepeningMarkdown = dynamic(
  () => import('@/components/coding/DeepeningMarkdown').then((module) => module.DeepeningMarkdown),
  { ssr: false, loading: () => <Loader2 className="animate-spin text-slate-400" size={20} /> },
);

const actionClass =
  'inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 transition hover:border-primary hover:bg-sky-50 hover:text-primary disabled:opacity-50';

/**
 * The sheets of a discipline, or of one of its subjects, as one document to
 * read, copy or save as Markdown. Entries still without a sheet can be written
 * from here, one at a time, the way the subject summary fills topic by topic.
 */
export function StudyLogNotebookModal({
  discipline,
  subject,
  aiAvailable,
  onClose,
  onSheetsWritten,
}: {
  discipline: string;
  /** undefined: the whole discipline; "" the entries without a subject. */
  subject?: string | null;
  aiAvailable: boolean;
  onClose: () => void;
  onSheetsWritten: () => void;
}) {
  const [notebook, setNotebook] = useState<StudyLogNotebook | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [writing, setWriting] = useState(false);
  const [copied, setCopied] = useState(false);
  // Rendered on <body>: a fixed layer inside the page's spaced column would
  // inherit its top margin; the page behind also stops scrolling.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      setMounted(false);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      setNotebook(await api.getStudyLogNotebook(discipline, subject));
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Não foi possível abrir o caderno."));
    }
  }, [discipline, subject]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !writing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, writing]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const writable = notebook?.pending.filter((item) => item.can_summarize) ?? [];
  const onlyTime = (notebook?.pending.length ?? 0) - writable.length;
  const words = notebook ? notebook.content.split(/\s+/).filter(Boolean).length : 0;

  async function writeMissing() {
    setWriting(true);
    setError('');
    let written = 0;
    for (const [index, item] of writable.entries()) {
      setProgress(tf("Escrevendo a ficha {current} de {total}: {title}", { current: index + 1, total: writable.length, title: item.title }));
      try {
        await api.summarizeStudyLogEntry(item.id);
        written += 1;
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t("Não foi possível escrever a ficha."));
        break;
      }
    }
    setProgress('');
    setWriting(false);
    if (written) {
      onSheetsWritten();
      await load();
    }
  }

  async function copy() {
    if (!notebook || !navigator.clipboard) return;
    await navigator.clipboard.writeText(notebook.content);
    setCopied(true);
  }

  function download() {
    if (!notebook) return;
    const url = URL.createObjectURL(new Blob([notebook.content], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = notebookFileName(notebook.title);
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="study-log-notebook-title"
      className="fixed inset-0 z-50 flex min-h-[100dvh] items-stretch justify-center bg-slate-950/80 sm:items-center sm:p-3 lg:p-4"
    >
      <div className="flex min-h-[100dvh] w-full flex-col dialog-sheet text-slate-900 shadow-2xl sm:h-[calc(100dvh-1.5rem)] sm:min-h-0 sm:max-w-4xl sm:rounded-3xl lg:h-[calc(100dvh-2rem)]">
        <header className="border-b border-slate-200 px-5 pb-4 pt-[calc(1rem_+_env(safe-area-inset-top))] sm:px-7 sm:pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-primary">{t("Caderno")}</p>
              <h2 id="study-log-notebook-title" className="mt-1 break-words text-xl font-black leading-tight text-slate-900 sm:text-2xl">
                {notebook?.title ?? discipline}
              </h2>
              {notebook ? (
                <p className="mt-1 text-sm font-bold text-slate-500">
                  {tf("{summarized} de {total} registros com ficha", { summarized: notebook.summarized_count, total: notebook.entry_count })}
                  {' · '}
                  {tf("{minutes} min de leitura", { minutes: Math.max(1, Math.round(words / 200)) })}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={writing}
              aria-label={t("Fechar caderno")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void copy()} disabled={!notebook} className={actionClass}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? t("Copiado") : t("Copiar")}
            </button>
            <button type="button" onClick={download} disabled={!notebook} className={actionClass}>
              <Download size={15} /> {t("Baixar .md")}
            </button>
            {writable.length > 0 && aiAvailable ? (
              <button
                type="button"
                onClick={() => void writeMissing()}
                disabled={writing}
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-violet-200 px-3 py-2 text-xs font-black text-violet-700 transition hover:border-violet-400 hover:bg-violet-50 disabled:opacity-50"
              >
                {writing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {writable.length === 1 ? t("Gerar a ficha que falta") : tf("Gerar as {count} fichas que faltam", { count: writable.length })}
              </button>
            ) : null}
          </div>
          {writable.length > 0 && !aiAvailable ? (
            <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600">
              {t("Configure uma chave de IA na Área da conta para gerar as fichas que faltam.")}
            </p>
          ) : null}
          {onlyTime > 0 ? (
            <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600">
              {t("Registros só com o tempo ficam sem ficha — edite e cole o que estudou para ter uma.")}
            </p>
          ) : null}
          {progress ? (
            <p className="mt-3 flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600">
              <Loader2 size={14} className="animate-spin" /> {progress}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-3 rounded-2xl bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700">{error}</p>
          ) : null}
        </header>

        <main className="flex-1 overflow-y-auto px-5 pb-[calc(1.5rem_+_env(safe-area-inset-bottom))] pt-6 sm:px-8 sm:pb-6 lg:px-12 lg:py-10">
          {notebook ? (
            <div className="text-[0.95rem]">
              <DeepeningMarkdown content={notebook.content} />
            </div>
          ) : error ? null : (
            <p className="flex items-center gap-2 text-sm font-bold text-slate-500">
              <Loader2 className="animate-spin" size={16} /> {t("Abrindo o caderno…")}
            </p>
          )}
        </main>
      </div>
    </div>,
    document.body,
  );
}
