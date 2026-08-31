'use client';

import { useState } from 'react';
import { Copy, Loader2, Sparkles, X } from 'lucide-react';

interface SubjectSummaryModalProps {
  subjectName: string;
  topicCount: number;
  content: string;
  onClose: () => void;
  onRegenerate: () => void;
  regenerating: boolean;
  error?: string;
}

/** One rendered line of the summary. The AI answers in Markdown so the text can
 *  be pasted into Notion; here it only needs the handful of marks the prompt
 *  actually asks for — headings and bullets. */
function SummaryLine({ line }: { line: string }) {
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

export function SubjectSummaryModal({
  subjectName,
  topicCount,
  content,
  onClose,
  onRegenerate,
  regenerating,
  error,
}: SubjectSummaryModalProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="subject-summary-title"
      className="fixed inset-0 z-50 flex min-h-[100dvh] items-stretch justify-center bg-slate-950/80 sm:items-center sm:p-3 lg:p-4"
    >
      <div className="flex min-h-[100dvh] w-full flex-col bg-white text-slate-900 shadow-2xl sm:min-h-0 sm:h-[calc(100dvh-1.5rem)] sm:rounded-3xl lg:h-[calc(100dvh-2rem)]">
        <header className="border-b border-slate-200 px-5 py-4 sm:px-7">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-primary">{subjectName}</p>
              <h2 id="subject-summary-title" className="mt-1 text-xl font-black leading-tight text-slate-900 sm:text-2xl">
                Resumo da matéria
              </h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
                Só o que cai na prova · {topicCount} {topicCount === 1 ? 'tópico' : 'tópicos'}
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
            <button
              type="button"
              onClick={() => {
                setCopied(false);
                onRegenerate();
              }}
              disabled={regenerating}
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-violet-200 px-3 py-2 text-xs font-black text-violet-700 transition hover:border-violet-400 hover:bg-violet-50 disabled:opacity-50"
            >
              {regenerating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {regenerating ? 'Gerando...' : 'Gerar de novo'}
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-3 rounded-2xl bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700">{error}</p>
          )}
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 lg:px-12 lg:py-10">
          <article className="mx-auto w-full max-w-[72ch]">
            {content.split('\n').map((line, index) => (
              <SummaryLine key={index} line={line} />
            ))}
          </article>
        </main>
      </div>
    </div>
  );
}
