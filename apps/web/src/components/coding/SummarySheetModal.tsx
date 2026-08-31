'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Loader2, Pencil, Sparkles, X } from 'lucide-react';

interface SummarySheetModalProps {
  subjectName: string;
  heading: string;
  scopeLabel: string;
  content: string;
  onClose: () => void;
  onRegenerate: () => void;
  regenerating: boolean;
  /** Progress line while the subject sheet fills topic by topic. */
  progress?: string;
  error?: string;
  /** Provided only where editing has a single owner: the topic sheet. */
  onSave?: (content: string) => Promise<void>;
}

/** One rendered line of the sheet. The AI answers in Markdown so the text can
 *  be pasted into Notion; here it only needs the handful of marks the prompt
 *  actually asks for - headings and bullets. */
function SheetLine({ line }: { line: string }) {
  // The prompt asks for plain bullets, so ** only shows up as stray emphasis.
  const plain = (text: string) => text.replace(/\*\*/g, '');

  if (line.startsWith('# ')) {
    return <h3 className="mt-6 text-[1.5em] font-black leading-tight text-slate-900 first:mt-0">{plain(line.slice(2))}</h3>;
  }
  if (line.startsWith('## ')) {
    return <h4 className="mt-6 border-b-2 border-slate-100 pb-1 text-[1.15em] font-black text-slate-800">{plain(line.slice(3))}</h4>;
  }
  if (line.startsWith('### ')) {
    return <h5 className="mt-4 text-[1em] font-black text-slate-700">{plain(line.slice(4))}</h5>;
  }
  if (/^[-*] /.test(line)) {
    return (
      <p className="mt-2 flex gap-2 text-[0.95em] font-medium leading-relaxed text-slate-700">
        <span aria-hidden className="text-primary">•</span>
        <span>{plain(line.slice(2))}</span>
      </p>
    );
  }
  if (!line.trim()) return <div className="h-2" />;
  return <p className="mt-3 text-[0.95em] font-medium leading-relaxed text-slate-700">{plain(line)}</p>;
}

export function SummarySheetModal({
  subjectName,
  heading,
  scopeLabel,
  content,
  onClose,
  onRegenerate,
  regenerating,
  progress,
  error,
  onSave,
}: SummarySheetModalProps) {
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // A re-generated sheet replaces what the editor was holding.
  useEffect(() => {
    setDraft(null);
    setCopied(false);
  }, [content]);

  // The whole point of the sheet is being short, so show how short it came out.
  const words = content.split(/\s+/).filter(Boolean).length;
  const readingMinutes = Math.max(1, Math.round(words / 200));

  async function handleCopy() {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
  }

  async function handleSave() {
    if (draft === null || !onSave) return;
    setSaving(true);
    try {
      await onSave(draft);
      setDraft(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="summary-sheet-title"
      className="fixed inset-0 z-50 flex min-h-[100dvh] items-stretch justify-center bg-slate-950/80 sm:items-center sm:p-3 lg:p-4"
    >
      <div className="flex min-h-[100dvh] w-full flex-col bg-white text-slate-900 shadow-2xl sm:min-h-0 sm:h-[calc(100dvh-1.5rem)] sm:rounded-3xl lg:h-[calc(100dvh-2rem)]">
        <header className="border-b border-slate-200 px-5 py-4 sm:px-7">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-primary">{subjectName}</p>
              <h2 id="summary-sheet-title" className="mt-1 text-xl font-black leading-tight text-slate-900 sm:text-2xl">
                {heading}
              </h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
                Só o que cai na prova · {scopeLabel} · {words} palavras · {readingMinutes} min de leitura
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar resumo"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 hover:bg-slate-100"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 transition hover:border-primary hover:bg-sky-50 hover:text-primary"
            >
              <Copy size={15} />
              {copied ? 'Copiado!' : 'Copiar para Notion'}
            </button>
            {onSave && draft === null && (
              <button
                type="button"
                onClick={() => setDraft(content)}
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 transition hover:border-primary hover:bg-sky-50 hover:text-primary"
              >
                <Pencil size={15} />
                Editar
              </button>
            )}
            {onSave && draft !== null && (
              <>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || !draft.trim()}
                  className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-3 py-2 text-xs font-black text-white hover:bg-primary-dark disabled:opacity-50"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onRegenerate}
              disabled={regenerating || draft !== null}
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-violet-200 px-3 py-2 text-xs font-black text-violet-700 transition hover:border-violet-400 hover:bg-violet-50 disabled:opacity-50"
            >
              {regenerating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {regenerating ? 'Gerando...' : 'Gerar de novo'}
            </button>
          </div>
          {progress && (
            <p className="mt-3 flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600">
              <Loader2 size={14} className="animate-spin" />
              {progress}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 rounded-2xl bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700">{error}</p>
          )}
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 lg:px-12 lg:py-10">
          <article className="mx-auto w-full max-w-[72ch]">
            {draft === null ? (
              content
                .split('\n')
                .map((line, index) => <SheetLine key={index} line={line} />)
            ) : (
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={24}
                aria-label="Editar o resumo"
                className="w-full resize-y rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 font-mono text-sm leading-relaxed text-slate-700 outline-none focus:border-primary"
              />
            )}
          </article>
        </main>
      </div>
    </div>
  );
}
