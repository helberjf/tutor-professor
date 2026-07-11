'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, ChevronRight, Layers, Loader2, Pencil, Plus, RotateCcw,
  Save, Search, Settings2, Sparkles, Trash2, X, Zap,
} from 'lucide-react';
import {
  api, type DeckCard, type DeckConfig, type DeckOverview, type DeckRating, type DeckStats, type DeckStudyCard,
  type ProgrammingTopic,
} from '@/lib/api';
import { SyntaxCodeBlock } from './SyntaxCodeBlock';

interface Props {
  subjectId: number;
  subjectName: string;
  subjectIcon?: string | null;
  onBack: () => void;
  onChanged?: () => void;
}

type Tab = 'study' | 'cards' | 'options';

const STATE_BADGE: Record<string, { label: string; cls: string }> = {
  new: { label: 'Novo', cls: 'bg-sky-100 text-sky-700' },
  learning: { label: 'Aprendendo', cls: 'bg-amber-100 text-amber-700' },
  relearning: { label: 'Reaprendendo', cls: 'bg-rose-100 text-rose-700' },
  review: { label: 'Revisão', cls: 'bg-emerald-100 text-emerald-700' },
};

export function FlashcardDeck({ subjectId, subjectName, subjectIcon, onBack, onChanged }: Props) {
  const [tab, setTab] = useState<Tab>('study');
  const [overview, setOverview] = useState<DeckOverview | null>(null);
  const [topics, setTopics] = useState<ProgrammingTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [overviewError, setOverviewError] = useState('');
  const [topicsError, setTopicsError] = useState('');
  const [topicsLoading, setTopicsLoading] = useState(false);
  const loggedCompletionRef = useRef(false);
  const deckMountedRef = useRef(true);
  const overviewLoadRequestRef = useRef(0);
  const topicsLoadRequestRef = useRef(0);

  async function loadOverview(showLoading = false): Promise<boolean> {
    const requestId = ++overviewLoadRequestRef.current;
    if (deckMountedRef.current && showLoading) setLoading(true);
    if (deckMountedRef.current) setOverviewError('');
    try {
      const nextOverview = await api.getDeckOverview(subjectId);
      if (requestId !== overviewLoadRequestRef.current) return false;
      if (deckMountedRef.current) setOverview(nextOverview);
      return true;
    } catch {
      if (deckMountedRef.current && requestId === overviewLoadRequestRef.current) {
        setOverviewError('Não foi possível carregar o deck.');
      }
      return false;
    } finally {
      if (deckMountedRef.current && requestId === overviewLoadRequestRef.current) setLoading(false);
    }
  }

  async function retryTopics(): Promise<boolean> {
    const requestId = ++topicsLoadRequestRef.current;
    if (deckMountedRef.current) {
      setTopicsLoading(true);
      setTopicsError('');
    }
    try {
      const nextTopics = await api.getCodingTopics(subjectId);
      if (requestId !== topicsLoadRequestRef.current) return false;
      if (deckMountedRef.current) setTopics(nextTopics);
      return true;
    } catch {
      if (deckMountedRef.current && requestId === topicsLoadRequestRef.current) {
        setTopicsError('Não foi possível carregar os tópicos.');
      }
      return false;
    } finally {
      if (deckMountedRef.current && requestId === topicsLoadRequestRef.current) setTopicsLoading(false);
    }
  }

  useEffect(() => {
    deckMountedRef.current = true;
    return () => { deckMountedRef.current = false; };
  }, []);

  useEffect(() => {
    void loadOverview(true);
    void retryTopics();
    return () => {
      overviewLoadRequestRef.current += 1;
      topicsLoadRequestRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  const stats = overview?.stats;

  return (
    <div className="space-y-6">
      <section className="kid-surface border-primary/30 p-6">
        <button type="button" onClick={onBack} className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-primary">
          <ArrowLeft size={16} /> Todas as matérias
        </button>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{subjectIcon || '🃏'}</span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Flashcards</p>
            <h1 className="text-2xl font-black text-slate-800">{subjectName}</h1>
          </div>
        </div>
        {stats && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatChip label="Novos" value={stats.new} tone="sky" />
            <StatChip label="Aprendendo" value={stats.learning} tone="amber" />
            <StatChip label="A revisar" value={stats.review_due} tone="orange" />
            <StatChip label="Total" value={stats.total} tone="slate" />
          </div>
        )}
      </section>

      <div className="study-mode-tabs">
        <DeckTab active={tab === 'study'} onClick={() => setTab('study')} icon={<Zap size={16} />} label="Estudar" />
        <DeckTab active={tab === 'cards'} onClick={() => setTab('cards')} icon={<Layers size={16} />} label="Cards" />
        <DeckTab active={tab === 'options'} onClick={() => setTab('options')} icon={<Settings2 size={16} />} label="Opções" />
      </div>

      {overviewError && (
        <div role="alert" className="flex flex-col gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 sm:flex-row sm:items-center sm:justify-between">
          <p>{overviewError}</p>
          <button type="button" onClick={() => void loadOverview(true)} className="rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs hover:bg-rose-100">Tentar recarregar deck</button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={32} /></div>
      ) : !overview ? null : tab === 'study' ? (
        <StudyTab
          subjectId={subjectId}
          subjectName={subjectName}
          stats={stats}
          onFinished={loadOverview}
          onLogged={() => { loggedCompletionRef.current = true; }}
        />
      ) : tab === 'cards' ? (
        <CardsTab
          subjectId={subjectId}
          subjectName={subjectName}
          overview={overview}
          topics={topics}
          topicsError={topicsError}
          topicsLoading={topicsLoading}
          retryTopics={retryTopics}
          onReload={loadOverview}
          onChanged={onChanged}
        />
      ) : (
        <OptionsTab subjectId={subjectId} config={overview?.config} onSaved={loadOverview} />
      )}
    </div>
  );
}

// ── Study tab ────────────────────────────────────────────────────────────────

function StudyTab({ subjectId, subjectName, stats, onFinished, onLogged }: { subjectId: number; subjectName: string; stats?: DeckStats; onFinished: () => void; onLogged: () => void }) {
  const [queue, setQueue] = useState<DeckStudyCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [counts, setCounts] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
  const [completedCounts, setCompletedCounts] = useState<typeof counts | null>(null);
  const studyModalOpen = queue !== null && queue.length > 0;

  useEffect(() => {
    if (!studyModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [studyModalOpen]);

  async function start() {
    setLoading(true);
    try {
      const session = await api.getDeckStudy(subjectId);
      setQueue(session.items);
      setIndex(0);
      setRevealed(false);
      setCounts({ again: 0, hard: 0, good: 0, easy: 0 });
      setCompletedCounts(null);
    } finally {
      setLoading(false);
    }
  }

  async function answer(rating: DeckRating) {
    if (!queue) return;
    const card = queue[index];
    setSubmitting(true);
    try {
      await api.submitDeckAttempt({ review_item_id: card.review_item_id, rating });
    } finally {
      setSubmitting(false);
    }
    const nextCounts = { ...counts, [rating]: counts[rating] + 1 };
    setCounts(nextCounts);
    if (index + 1 >= queue.length) {
      setCompletedCounts(nextCounts);
      onLogged();
      onFinished();
      setQueue([]); // mark finished
    } else {
      setIndex((i) => i + 1);
      setRevealed(false);
    }
  }

  function closeStudyModal() {
    setQueue(null);
    setIndex(0);
    setRevealed(false);
    setSubmitting(false);
    setCounts({ again: 0, hard: 0, good: 0, easy: 0 });
    setCompletedCounts(null);
    onFinished();
  }

  // Not started yet
  if (queue === null) {
    const due = (stats?.new ?? 0) + (stats?.learning ?? 0) + (stats?.review_due ?? 0);
    return (
      <div className="rounded-3xl border-2 border-slate-100 bg-white px-6 py-12 text-center">
        <p className="text-lg font-black text-slate-800">
          {due > 0 ? `${due} card${due !== 1 ? 's' : ''} para estudar agora` : 'Nada para revisar agora 🎉'}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {due > 0 ? 'Erre / Difícil / Bom / Fácil — o intervalo da próxima revisão ajusta sozinho (FSRS).' : 'Volte mais tarde ou adicione novos cards.'}
        </p>
        {due > 0 && (
          <button
            type="button"
            onClick={start}
            disabled={loading}
            className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-primary px-8 py-3 font-black text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />} Começar
          </button>
        )}
      </div>
    );
  }

  // Finished
  if (queue.length === 0) {
    const finalCounts = completedCounts ?? counts;

    return (
      <div className="flex flex-col items-center gap-6 py-12 text-center">
        <div className="rounded-full bg-emerald-100 p-6"><CheckCircle2 size={48} className="text-emerald-500" /></div>
        <h2 className="text-2xl font-black text-slate-800">Sessão concluída!</h2>
        <div className="flex flex-wrap justify-center gap-6">
          <Tally label="Errei" value={finalCounts.again} cls="text-rose-500" />
          <Tally label="Difícil" value={finalCounts.hard} cls="text-amber-500" />
          <Tally label="Bom" value={finalCounts.good} cls="text-sky-600" />
          <Tally label="Fácil" value={finalCounts.easy} cls="text-emerald-600" />
        </div>
        <button type="button" onClick={start} disabled={loading} className="inline-flex items-center gap-2 rounded-2xl bg-primary px-8 py-3 font-black text-white hover:bg-primary-dark disabled:opacity-50">
          {loading ? <Loader2 size={18} className="animate-spin" /> : <RotateCcw size={18} />} Buscar mais
        </button>
      </div>
    );
  }

  const card = queue[index];
  const badge = STATE_BADGE[card.state] ?? STATE_BADGE.new;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Estudo de flashcards"
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-950/80 sm:items-center sm:p-6"
    >
      <div className="relative flex h-[100dvh] w-full flex-col overflow-y-auto bg-white px-5 py-6 sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-[1.5rem] sm:border-2 sm:border-slate-200 sm:p-7 sm:shadow-[0_28px_90px_rgba(15,23,42,0.35)]">
        <button
          type="button"
          onClick={closeStudyModal}
          aria-label="Fechar tela cheia dos flashcards"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 sm:right-4 sm:top-4"
        >
          <X size={15} />
        </button>

        <div className="space-y-5 pr-2 sm:pr-0">
          <div className="flex items-center justify-between gap-10">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{card.topic_title}</p>
              <p className="text-sm font-bold text-slate-600">{index + 1} / {queue.length}</p>
            </div>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${badge.cls}`}>{badge.label}</span>
          </div>

          <div className="h-1.5 w-full rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${(index / queue.length) * 100}%` }} />
          </div>

          <div className="min-h-48 rounded-3xl border-2 border-slate-100 bg-white p-5 sm:p-6">
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-400">Frente</p>
            <p className="text-lg font-black text-slate-800">{card.front}</p>

            {!revealed ? (
              <button
                type="button"
                onClick={() => setRevealed(true)}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-primary py-3 font-black text-primary hover:bg-primary-light"
              >
                <ChevronRight size={18} /> Mostrar resposta
              </button>
            ) : (
              <>
                <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                  <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-400">Verso</p>
                  <p className="leading-relaxed text-slate-700">{card.back}</p>
                  {card.code_example && <SyntaxCodeBlock code={card.code_example} language={subjectName} className="mt-3 p-3" />}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <GradeButton label="Errei" preview={card.previews.again} onClick={() => answer('again')} disabled={submitting} cls="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" />
                  <GradeButton label="Difícil" preview={card.previews.hard} onClick={() => answer('hard')} disabled={submitting} cls="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100" />
                  <GradeButton label="Bom" preview={card.previews.good} onClick={() => answer('good')} disabled={submitting} cls="border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100" />
                  <GradeButton label="Fácil" preview={card.previews.easy} onClick={() => answer('easy')} disabled={submitting} cls="border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GradeButton({ label, preview, onClick, disabled, cls }: { label: string; preview: string; onClick: () => void; disabled: boolean; cls: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-0.5 rounded-2xl border-2 py-2.5 text-sm font-black transition disabled:opacity-50 ${cls}`}
    >
      <span>{label}</span>
      <span className="text-[11px] font-bold opacity-70">{preview}</span>
    </button>
  );
}

// ── Cards tab (browser) ──────────────────────────────────────────────────────

function CardsTab({ subjectId, subjectName, overview, topics, topicsError, topicsLoading, retryTopics, onReload, onChanged }: {
  subjectId: number;
  subjectName: string;
  overview: DeckOverview | null;
  topics: ProgrammingTopic[];
  topicsError: string;
  topicsLoading: boolean;
  retryTopics: () => Promise<boolean>;
  onReload: () => Promise<boolean>;
  onChanged?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [creatingWithAi, setCreatingWithAi] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const [context, setContext] = useState('');
  const [generatingWithAi, setGeneratingWithAi] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiSuccess, setAiSuccess] = useState('');
  const mountedRef = useRef(true);
  const generationLockRef = useRef(false);
  const cards = overview?.cards ?? [];

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  async function reloadAndNotify() {
    void retryTopics();
    const overviewReloaded = await onReload();
    if (mountedRef.current && overviewReloaded) onChanged?.();
  }

  async function generateWithAi() {
    if (generationLockRef.current) return;
    generationLockRef.current = true;
    try {
      if (!selectedTopicId) {
        setAiError('Selecione um tópico.');
        return;
      }
      setGeneratingWithAi(true);
      setAiError('');
      setAiSuccess('');
      await api.generateAdditionalCodingFlashcards(selectedTopicId, context);
      void retryTopics();
      const overviewReloaded = await onReload();
      if (overviewReloaded) onChanged?.();
      if (!mountedRef.current) return;
      if (!overviewReloaded) {
        setAiError('As questões foram criadas, mas não foi possível recarregar o deck.');
        return;
      }
      setCreatingWithAi(false);
      setSelectedTopicId(null);
      setContext('');
      setAiSuccess('5 questões criadas com sucesso.');
    } catch (err) {
      if (mountedRef.current) {
        setAiError(err instanceof Error ? err.message : 'Não foi possível criar as questões.');
      }
    } finally {
      generationLockRef.current = false;
      if (mountedRef.current) setGeneratingWithAi(false);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) =>
      c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q) || c.topic_title.toLowerCase().includes(q),
    );
  }, [cards, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            aria-label="Buscar cards"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar cards..."
            className="min-h-11 w-full rounded-2xl border-2 border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-slate-700 outline-none focus:border-primary"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setCreatingWithAi(false);
            setAiError('');
            setAiSuccess('');
            setCreating((value) => !value);
          }}
          disabled={generatingWithAi}
          className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-4 font-black text-white hover:bg-primary-dark disabled:opacity-50"
        >
          <Plus size={18} /> Novo card
        </button>
        <button
          type="button"
          onClick={() => {
            setCreating(false);
            setAiError('');
            setAiSuccess('');
            setCreatingWithAi((value) => !value);
          }}
          disabled={generatingWithAi}
          className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border-2 border-primary bg-white px-4 font-black text-primary hover:bg-primary-light disabled:opacity-50"
        >
          <Sparkles size={18} /> Criar com IA
        </button>
      </div>

      {creating && overview && (
        <CardForm
          subjectId={subjectId}
          disabled={generatingWithAi}
          onCancel={() => setCreating(false)}
          onSaved={() => { setCreating(false); void reloadAndNotify(); }}
        />
      )}

      {creatingWithAi && (
        <div aria-busy={generatingWithAi} className="space-y-3 rounded-2xl border-2 border-primary/30 bg-primary-light/30 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-black text-slate-700">Criar cards com IA</p>
            <button
              type="button"
              onClick={() => setCreatingWithAi(false)}
              disabled={generatingWithAi}
              aria-label="Cancelar criação com IA"
              className="rounded-lg p-1 text-slate-400 hover:bg-white disabled:opacity-50"
            >
              <X size={16} />
            </button>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Tópico *</span>
            <select
              required
              value={selectedTopicId ?? ''}
              onChange={(event) => setSelectedTopicId(event.target.value ? Number(event.target.value) : null)}
              disabled={generatingWithAi || topics.length === 0 || Boolean(topicsError)}
              className="min-h-11 rounded-xl border-2 border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-primary disabled:opacity-50"
            >
              <option value="">Selecione um tópico</option>
              {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}
            </select>
            {topics.length === 0 && !topicsError && (
              <span role="status" className="text-xs font-bold text-amber-700">Nenhum tópico disponível para gerar questões.</span>
            )}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Contexto opcional</span>
            <textarea
              value={context}
              onChange={(event) => setContext(event.target.value)}
              maxLength={1000}
              rows={3}
              disabled={generatingWithAi}
              placeholder="Ex.: foque em exemplos práticos e erros comuns"
              className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-primary disabled:opacity-50"
            />
            <span className="text-right text-[11px] font-semibold text-slate-400">{context.length}/1000</span>
          </label>
          <p className="text-xs font-bold text-slate-500">Serão criadas 5 questões</p>
          {aiError && <p role="alert" className="text-xs font-bold text-rose-600">{aiError}</p>}
          <button
            type="button"
            onClick={() => void generateWithAi()}
            disabled={generatingWithAi || !selectedTopicId || topics.length === 0 || Boolean(topicsError)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 font-black text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {generatingWithAi ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {generatingWithAi ? 'Criando...' : 'Criar 5 questões'}
          </button>
        </div>
      )}

      {topicsError && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <p>{topicsError}</p>
          <button
            type="button"
            onClick={() => void retryTopics()}
            disabled={topicsLoading || generatingWithAi}
            className="rounded-xl border border-amber-200 bg-white px-3 py-1.5 text-xs hover:bg-amber-100 disabled:opacity-50"
          >
            {topicsLoading ? 'Recarregando...' : 'Tentar recarregar tópicos'}
          </button>
        </div>
      )}

      {aiSuccess && <p role="status" aria-live="polite" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{aiSuccess}</p>}

      {filtered.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white px-6 py-12 text-center">
          <p className="font-bold text-slate-500">{cards.length === 0 ? 'Nenhum card ainda.' : 'Nenhum card encontrado.'}</p>
          <p className="mt-1 text-sm text-slate-400">{cards.length === 0 ? 'Crie cards manualmente ou gere tópicos com IA na aba Estudar da matéria.' : 'Tente outra busca.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((card) => (
            <CardRow
              key={card.flashcard_id}
              card={card}
              subjectName={subjectName}
              onReload={reloadAndNotify}
              locked={generatingWithAi}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CardRow({ card, subjectName, onReload, locked }: { card: DeckCard; subjectName: string; onReload: () => void; locked: boolean }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const badge = STATE_BADGE[card.state] ?? STATE_BADGE.new;

  async function remove() {
    if (locked) return;
    if (!confirm('Remover este card?')) return;
    setBusy(true);
    try {
      await api.deleteCodingFlashcard(card.flashcard_id);
      onReload();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <CardForm
        initial={card}
        disabled={locked}
        onCancel={() => setEditing(false)}
        onSaved={() => { setEditing(false); onReload(); }}
      />
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl border-2 border-slate-100 bg-white px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-black text-slate-800">{card.front}</p>
        <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{card.back}</p>
        {card.code_example && (
          <button
            type="button"
            onClick={() => setShowCode((visible) => !visible)}
            aria-expanded={showCode}
            className="mt-2 text-xs font-black text-primary hover:underline"
          >
            {showCode ? 'Ocultar código' : 'Ver código'}
          </button>
        )}
        {showCode && card.code_example && (
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <SyntaxCodeBlock code={card.code_example} language={subjectName} className="p-3" />
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] font-bold">
          <span className={`rounded-full px-2 py-0.5 ${badge.cls}`}>{badge.label}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">{card.topic_title}</span>
          <span className="text-slate-400">próx.: {card.interval_label}</span>
          {card.lapses > 0 && <span className="text-rose-400">{card.lapses} lapso(s)</span>}
          {card.is_leech && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">leech</span>}
          {card.suspended && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-600">suspenso</span>}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <button type="button" aria-label="Editar card" onClick={() => setEditing(true)} disabled={locked} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-primary disabled:opacity-50"><Pencil size={15} /></button>
        <button type="button" aria-label="Excluir card" onClick={remove} disabled={busy || locked} className="rounded-xl p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50"><Trash2 size={15} /></button>
      </div>
    </div>
  );
}

function CardForm({ subjectId, initial, disabled = false, onCancel, onSaved }: { subjectId?: number; initial?: DeckCard; disabled?: boolean; onCancel: () => void; onSaved: () => void }) {
  const [front, setFront] = useState(initial?.front ?? '');
  const [back, setBack] = useState(initial?.back ?? '');
  const [code, setCode] = useState(initial?.code_example ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (disabled) return;
    if (!front.trim() || !back.trim()) { setErr('Frente e verso são obrigatórios.'); return; }
    setBusy(true);
    setErr('');
    try {
      if (initial) {
        await api.updateCodingFlashcard(initial.flashcard_id, { front, back, code_example: code });
      } else if (subjectId != null) {
        await api.createDeckCard(subjectId, { front, back, code_example: code });
      }
      onSaved();
    } catch {
      setErr('Não foi possível salvar o card.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border-2 border-primary/30 bg-primary-light/30 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-black text-slate-700">{initial ? 'Editar card' : 'Novo card'}</p>
        <button type="button" aria-label="Fechar formulário do card" onClick={onCancel} disabled={disabled || busy} className="rounded-lg p-1 text-slate-400 hover:bg-white disabled:opacity-50"><X size={16} /></button>
      </div>
      <input value={front} onChange={(e) => setFront(e.target.value)} disabled={disabled || busy} placeholder="Frente (pergunta / conceito)" className="min-h-11 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-primary disabled:opacity-50" />
      <textarea value={back} onChange={(e) => setBack(e.target.value)} disabled={disabled || busy} placeholder="Verso (resposta / explicação)" rows={3} className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-primary disabled:opacity-50" />
      <textarea value={code} onChange={(e) => setCode(e.target.value)} disabled={disabled || busy} placeholder="Exemplo de código (opcional)" rows={2} className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 outline-none focus:border-primary disabled:opacity-50" />
      {err && <p className="text-xs font-bold text-rose-600">{err}</p>}
      <button type="button" onClick={save} disabled={busy || disabled} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 font-black text-white hover:bg-primary-dark disabled:opacity-50">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar
      </button>
    </div>
  );
}

// ── Options tab (deck config) ────────────────────────────────────────────────

function OptionsTab({ subjectId, config, onSaved }: { subjectId: number; config?: DeckConfig; onSaved: () => void }) {
  const [form, setForm] = useState<DeckConfig | null>(config ?? null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { setForm(config ?? null); }, [config]);

  if (!form) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={28} /></div>;

  function set<K extends keyof DeckConfig>(key: K, value: DeckConfig[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setMsg('');
    try {
      await api.updateDeckConfig(subjectId, {
        ...form,
        desired_retention: Math.min(0.99, Math.max(0.7, form.desired_retention)),
      });
      setMsg('Opções salvas.');
      onSaved();
    } catch {
      setMsg('Não foi possível salvar as opções.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Group title="Limites diários" hint="Quantos cards inéditos e revisões entram por dia.">
        <NumField label="Novos cards / dia" value={form.new_per_day} onChange={(v) => set('new_per_day', v)} />
        <NumField label="Máx. revisões / dia" value={form.max_reviews_per_day} onChange={(v) => set('max_reviews_per_day', v)} />
        <Toggle label="Novos cards ignoram o limite de revisões" value={form.new_cards_ignore_review_limit} onChange={(v) => set('new_cards_ignore_review_limit', v)} />
      </Group>

      <Group title="Cards novos" hint="Passos (minutos) antes do card 'graduar' para revisão e a ordem de entrada.">
        <TextField label="Passos de aprendizado" value={form.learning_steps} onChange={(v) => set('learning_steps', v)} placeholder="1 10" />
        <SelectField label="Ordem de inserção" value={form.insertion_order} onChange={(v) => set('insertion_order', v as DeckConfig['insertion_order'])} options={[['sequential', 'Sequencial'], ['random', 'Aleatória']]} />
        <NumField label="Intervalo de graduação (dias)" value={form.graduating_interval} onChange={(v) => set('graduating_interval', v)} />
        <NumField label="Intervalo fácil (dias)" value={form.easy_interval} onChange={(v) => set('easy_interval', v)} />
      </Group>

      <Group title="Lapsos" hint="O que acontece quando você erra e quando um card vira 'leech' (erra demais).">
        <TextField label="Passos de reaprendizado" value={form.relearning_steps} onChange={(v) => set('relearning_steps', v)} placeholder="10" />
        <NumField label="Limite de leech (lapsos)" value={form.leech_threshold} onChange={(v) => set('leech_threshold', v)} />
        <SelectField label="Ação no leech" value={form.leech_action} onChange={(v) => set('leech_action', v as DeckConfig['leech_action'])} options={[['tag', 'Apenas marcar'], ['suspend', 'Suspender']]} />
      </Group>

      <Group title="FSRS" hint="Algoritmo moderno do Anki. Maior retenção = revisões mais frequentes.">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-400">Retenção desejada — {Math.round(form.desired_retention * 100)}%</label>
          <input type="range" min={70} max={99} value={Math.round(form.desired_retention * 100)} onChange={(e) => set('desired_retention', Number(e.target.value) / 100)} className="accent-primary" />
        </div>
        <NumField label="Intervalo máximo (dias)" value={form.maximum_interval} onChange={(v) => set('maximum_interval', v)} />
        <div className="sm:col-span-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Parâmetros FSRS (19 pesos)</span>
            <button type="button" onClick={() => set('fsrs_parameters', '')} className="text-[11px] font-bold text-primary hover:underline">Restaurar padrão</button>
          </div>
          <textarea
            value={form.fsrs_parameters}
            onChange={(e) => set('fsrs_parameters', e.target.value)}
            rows={3}
            placeholder="deixe em branco para usar os pesos padrão"
            className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 outline-none focus:border-primary"
          />
          <p className="mt-1 text-[11px] text-slate-400">19 valores separados por vírgula. Em branco = padrão do Anki. Valores inválidos são ignorados (usa-se o padrão).</p>
        </div>
      </Group>

      {msg && <p className="text-sm font-bold text-emerald-600">{msg}</p>}
      <button type="button" onClick={save} disabled={busy} className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-8 py-3 font-black text-white hover:bg-primary-dark disabled:opacity-50">
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Salvar opções
      </button>
    </div>
  );
}

function Group({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border-2 border-slate-100 bg-white p-5">
      <h3 className="flex items-center gap-2 text-lg font-black text-slate-800"><Sparkles size={16} className="text-primary" /> {title}</h3>
      <p className="mt-0.5 text-xs text-slate-400">{hint}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="min-h-11 rounded-xl border-2 border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-primary" />
    </label>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-h-11 rounded-xl border-2 border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-primary" />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="min-h-11 rounded-xl border-2 border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-primary">
        {options.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
      </select>
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex items-center justify-between gap-3 rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-left"
    >
      <span className="text-sm font-bold text-slate-600">{label}</span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${value ? 'bg-primary' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${value ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────

function StatChip({ label, value, tone }: { label: string; value: number; tone: 'sky' | 'amber' | 'orange' | 'slate' }) {
  const colors = {
    sky: 'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-700',
    orange: 'bg-orange-50 text-orange-700',
    slate: 'bg-slate-50 text-slate-700',
  };
  return (
    <div className={`rounded-2xl px-4 py-3 ${colors[tone]}`}>
      <p className="text-2xl font-black">{value}</p>
      <p className="text-xs font-semibold opacity-75">{label}</p>
    </div>
  );
}

function DeckTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`study-mode-tab ${active ? 'study-mode-tab-active' : 'study-mode-tab-idle'}`}
    >
      {icon} {label}
    </button>
  );
}

function Tally({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="text-center">
      <p className={`text-3xl font-black ${cls}`}>{value}</p>
      <p className="text-sm font-bold text-slate-500">{label}</p>
    </div>
  );
}
