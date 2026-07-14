'use client';

import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, BookOpen, Brain, CheckCircle2, ChevronDown, ChevronRight, Code2, KeyRound, Loader2, Plus, RotateCcw, Trash2, Users, X } from 'lucide-react';
import Link from 'next/link';

import { ApiError, api, type AdminFlashcard, type AdminFlashcardPayload, type AdminModule, type AdminModuleDetail, type AdminModuleQuizQuestion, type AdminUser, type AIProvider } from '@/lib/api';
import { StatusCard } from '@/components/status-card';

// ─── Tab types ───────────────────────────────────────────────────────────────
type Tab = 'modules' | 'flashcards' | 'users' | 'editor';

// ─── Editor languages ────────────────────────────────────────────────────────
const EDITOR_LANGS = [
  { value: 'typescript', label: 'TypeScript' },
  { value: 'tsx', label: 'TSX / React' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'json', label: 'JSON' },
];

// ─── Category labels ─────────────────────────────────────────────────────────
const CATEGORY_META: Record<string, { emoji: string; label: string; color: string }> = {
  leetcode:   { emoji: 'LC', label: 'LeetCode', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  react:      { emoji: '⚛️',  label: 'React',      color: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  typescript: { emoji: '🔷',  label: 'TypeScript', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  general:    { emoji: '📚',  label: 'Geral',      color: 'bg-slate-100 text-slate-700 border-slate-200' },
};
function categoryMeta(cat: string) {
  return CATEGORY_META[cat] ?? { emoji: '📄', label: cat, color: 'bg-slate-100 text-slate-700 border-slate-200' };
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-100 ${className ?? ''}`} />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULES TAB
// ═══════════════════════════════════════════════════════════════════════════════
function ModulesTab() {
  const [modules, setModules] = useState<AdminModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminModuleDetail | null>(null);
  const [loadingModule, setLoadingModule] = useState(false);
  const [quizActive, setQuizActive] = useState(false);
  const [quizIndex, setQuizIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [quizDone, setQuizDone] = useState(false);
  const [openSection, setOpenSection] = useState<number | null>(0);

  useEffect(() => {
    api.adminListModules()
      .then(setModules)
      .catch(() => {/* silent */})
      .finally(() => setLoading(false));
  }, []);

  async function openModule(slug: string) {
    setLoadingModule(true);
    setSelected(null);
    setQuizActive(false);
    setQuizIndex(0);
    setChosen(null);
    setScore(0);
    setQuizDone(false);
    setOpenSection(0);
    try {
      const detail = await api.adminGetModule(slug);
      setSelected(detail);
    } catch {/* silent */} finally {
      setLoadingModule(false);
    }
  }

  function startQuiz() {
    setQuizActive(true);
    setQuizIndex(0);
    setChosen(null);
    setScore(0);
    setQuizDone(false);
  }

  function handleAnswer(option: string) {
    if (chosen || !selected) return;
    setChosen(option);
    const q = selected.quiz[quizIndex];
    if (option === q.correct_option) setScore((s) => s + 1);
  }

  function nextQuestion() {
    if (!selected) return;
    if (quizIndex < selected.quiz.length - 1) {
      setQuizIndex((i) => i + 1);
      setChosen(null);
    } else {
      setQuizDone(true);
    }
  }

  const categories = [...new Set(modules.map((m) => m.category))];

  // ── Module detail view ───────────────────────────────────────────────────
  if (loadingModule) {
    return (
      <div className="space-y-3 pt-2">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (selected) {
    const meta = categoryMeta(selected.category);
    const q: AdminModuleQuizQuestion | undefined = selected.quiz[quizIndex];

    return (
      <div>
        <button
          onClick={() => setSelected(null)}
          className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-primary-dark"
        >
          <ArrowLeft size={15} /> Voltar aos módulos
        </button>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className={`rounded-full border px-3 py-1 text-xs font-black ${meta.color}`}>
            {meta.emoji} {meta.label}
          </span>
          <h2 className="text-2xl font-black text-slate-800 md:text-3xl">{selected.title}</h2>
        </div>
        <p className="mb-6 text-sm text-slate-500">{selected.description}</p>

        {!quizActive ? (
          <>
            {/* Sections */}
            <div className="space-y-3">
              {selected.sections.map((section, i) => (
                <div key={i} className="overflow-hidden rounded-2xl border-2 border-slate-100 bg-white">
                  <button
                    onClick={() => setOpenSection(openSection === i ? null : i)}
                    className="flex w-full items-center justify-between px-5 py-4 text-left font-black text-slate-800 hover:bg-slate-50"
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-light text-xs font-black text-primary-dark">
                        {i + 1}
                      </span>
                      {section.title}
                    </span>
                    {openSection === i ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </button>

                  {openSection === i && (
                    <div className="border-t border-slate-100 px-5 py-4">
                      <p className="whitespace-pre-line text-sm leading-7 text-slate-600">{section.body}</p>
                      {section.code_example && (
                        <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs leading-relaxed text-emerald-300">
                          <code>{section.code_example}</code>
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {selected.practice?.length ? (
              <div className="mt-6 space-y-3">
                <div className="flex items-center gap-2">
                  <Code2 size={18} className="text-amber-700" />
                  <h3 className="text-lg font-black text-slate-800">Pratica LeetCode</h3>
                </div>
                {selected.practice.map((item) => (
                  <article key={item.id} className="rounded-2xl border-2 border-amber-100 bg-amber-50/40 p-5">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-amber-700">
                        {item.difficulty}
                      </span>
                      <h4 className="text-base font-black text-slate-800">{item.title}</h4>
                    </div>
                    <p className="text-sm leading-7 text-slate-600">{item.prompt}</p>
                    <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs leading-relaxed text-emerald-300">
                      <code>{item.starter_code}</code>
                    </pre>
                    <div className="mt-4 rounded-xl bg-white p-4">
                      <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-slate-400">Casos de teste</p>
                      <div className="space-y-2">
                        {item.test_cases.map((testCase, index) => (
                          <div key={`${item.id}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
                            <span className="font-bold">Input:</span> {testCase.input}
                            <span className="mx-2 text-slate-300">|</span>
                            <span className="font-bold">Expected:</span> {testCase.expected}
                          </div>
                        ))}
                      </div>
                    </div>
                    <details className="mt-4 rounded-xl border border-amber-200 bg-white p-4">
                      <summary className="cursor-pointer text-sm font-black text-amber-800">Ver solucao e explicacao</summary>
                      <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs leading-relaxed text-emerald-300">
                        <code>{item.solution}</code>
                      </pre>
                      <p className="mt-3 text-sm leading-7 text-slate-600">{item.explanation}</p>
                    </details>
                  </article>
                ))}
              </div>
            ) : null}

            {selected.quiz.length > 0 && (
              <button
                onClick={startQuiz}
                className="kid-button mt-6 bg-primary hover:bg-primary-dark"
              >
                <Brain size={16} className="mr-2" />
                Iniciar Quiz ({selected.quiz.length} perguntas)
              </button>
            )}
          </>
        ) : quizDone ? (
          /* Quiz result */
          <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-6 text-center">
            <CheckCircle2 size={40} className="mx-auto mb-3 text-emerald-600" />
            <h3 className="text-xl font-black text-slate-800">Quiz concluído!</h3>
            <p className="mt-2 text-4xl font-black text-emerald-700">
              {score}/{selected.quiz.length}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {Math.round((score / selected.quiz.length) * 100)}% de acerto
            </p>
            <button
              onClick={() => setQuizActive(false)}
              className="kid-button mt-6 bg-primary hover:bg-primary-dark"
            >
              Voltar ao conteúdo
            </button>
          </div>
        ) : q ? (
          /* Quiz question */
          <div>
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-500">
                Pergunta {quizIndex + 1}/{selected.quiz.length}
              </span>
              <button onClick={() => setQuizActive(false)} className="text-xs text-slate-400 hover:text-slate-600">
                Sair do quiz
              </button>
            </div>
            <div className="rounded-2xl border-2 border-slate-100 bg-white p-5">
              <p className="mb-5 text-base font-black text-slate-800">{q.question}</p>
              <div className="space-y-2">
                {q.options.map((opt) => {
                  const isChosen = chosen === opt;
                  const isCorrect = opt === q.correct_option;
                  let cls = 'rounded-xl border-2 px-4 py-3 text-sm font-semibold text-left w-full transition ';
                  if (!chosen) {
                    cls += 'border-slate-200 hover:border-primary hover:bg-primary-light text-slate-700';
                  } else if (isCorrect) {
                    cls += 'border-emerald-400 bg-emerald-50 text-emerald-800';
                  } else if (isChosen) {
                    cls += 'border-rose-400 bg-rose-50 text-rose-700';
                  } else {
                    cls += 'border-slate-100 bg-slate-50 text-slate-400';
                  }
                  return (
                    <button key={opt} className={cls} disabled={!!chosen} onClick={() => handleAnswer(opt)}>
                      {isChosen && !isCorrect && '✗ '}
                      {isCorrect && chosen && '✓ '}
                      {opt}
                    </button>
                  );
                })}
              </div>
              {chosen && (
                <div className="mt-4">
                  <p className="mb-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <span className="font-bold text-slate-700">Explicação: </span>
                    {q.explanation}
                  </p>
                  <button
                    onClick={nextQuestion}
                    className="kid-button bg-primary hover:bg-primary-dark"
                  >
                    {quizIndex < selected.quiz.length - 1 ? 'Próxima →' : 'Ver resultado'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // ── Module list ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-3 pt-2">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-2">
      {categories.map((cat) => {
        const meta = categoryMeta(cat);
        const catModules = modules.filter((m) => m.category === cat);
        return (
          <div key={cat}>
            <div className="mb-3 flex items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-black ${meta.color}`}>
                {meta.emoji} {meta.label}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {catModules.map((mod) => (
                <button
                  key={mod.slug}
                  onClick={() => void openModule(mod.slug)}
                  className="flex flex-col gap-1 rounded-2xl border-2 border-slate-100 bg-white px-5 py-4 text-left transition hover:border-primary hover:shadow-sm"
                >
                  <span className="font-black text-slate-800">{mod.title}</span>
                  <span className="text-xs text-slate-500">{mod.description}</span>
                  <span className="mt-2 text-xs text-slate-400">
                    {mod.total_sections} seções · {mod.total_quiz} perguntas
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLASHCARDS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function FlashcardsTab() {
  const [cards, setCards] = useState<AdminFlashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AdminFlashcardPayload>({ front: '', back: '', category: 'general' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);
  // Study mode
  const [studyMode, setStudyMode] = useState(false);
  const [studyIndex, setStudyIndex] = useState(0);
  const [studyFlipped, setStudyFlipped] = useState(false);
  const [filterCat, setFilterCat] = useState('all');

  const load = useCallback(() => {
    setLoading(true);
    api.adminListFlashcards()
      .then(setCards)
      .catch(() => {/* silent */})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.front.trim() || !form.back.trim()) { setFormError('Frente e verso são obrigatórios.'); return; }
    setSaving(true);
    setFormError('');
    try {
      const card = await api.adminCreateFlashcard(form);
      setCards((prev) => [card, ...prev]);
      setForm({ front: '', back: '', category: 'general' });
      setShowForm(false);
    } catch {
      setFormError('Não foi possível criar o flashcard.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setDeleting(id);
    try {
      await api.adminDeleteFlashcard(id);
      setCards((prev) => prev.filter((c) => c.id !== id));
    } catch {/* silent */} finally {
      setDeleting(null);
    }
  }

  const allCategories = [...new Set(cards.map((c) => c.category))];
  const filtered = filterCat === 'all' ? cards : cards.filter((c) => c.category === filterCat);
  const studyCards = filtered;
  const studyCard = studyCards[studyIndex];

  if (studyMode && studyCards.length > 0) {
    return (
      <div className="pt-2">
        <div className="mb-4 flex items-center justify-between">
          <button onClick={() => setStudyMode(false)} className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-primary-dark">
            <ArrowLeft size={15} /> Sair do estudo
          </button>
          <span className="text-xs font-bold text-slate-400">{studyIndex + 1}/{studyCards.length}</span>
        </div>

        {/* Flashcard flip */}
        <div style={{ perspective: '1200px' }}>
          <div
            className="relative w-full transition-transform duration-500"
            style={{
              transformStyle: 'preserve-3d',
              transform: studyFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              minHeight: '240px',
            }}
          >
            {/* Front */}
            <div
              className="absolute inset-0 flex flex-col rounded-2xl border-2 border-primary/30 bg-white p-6 shadow-md"
              style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
            >
              <span className={`mb-4 w-fit rounded-full border px-2.5 py-0.5 text-xs font-black ${categoryMeta(studyCard?.category ?? 'general').color}`}>
                {categoryMeta(studyCard?.category ?? 'general').emoji} {categoryMeta(studyCard?.category ?? 'general').label}
              </span>
              <div className="flex flex-1 items-center justify-center">
                <p className="text-center text-xl font-black text-slate-800">{studyCard?.front}</p>
              </div>
              <button
                onClick={() => setStudyFlipped(true)}
                className="mt-4 w-full rounded-xl border-2 border-dashed border-slate-200 py-2.5 text-sm font-bold text-slate-400 hover:border-primary hover:text-primary-dark"
              >
                Virar →
              </button>
            </div>
            {/* Back */}
            <div
              className="absolute inset-0 flex flex-col rounded-2xl border-2 border-emerald-300 bg-white p-6 shadow-md"
              style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            >
              <span className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-400">Resposta</span>
              <div className="flex flex-1 flex-col justify-center gap-3">
                <p className="text-base leading-7 text-slate-700">{studyCard?.back}</p>
                {studyCard?.code_example && (
                  <pre className="overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-emerald-300">
                    <code>{studyCard.code_example}</code>
                  </pre>
                )}
              </div>
              <button
                onClick={() => {
                  setStudyFlipped(false);
                  if (studyIndex < studyCards.length - 1) {
                    setTimeout(() => setStudyIndex((i) => i + 1), 200);
                  } else {
                    setStudyMode(false);
                  }
                }}
                className="mt-4 w-full rounded-xl bg-emerald-500 py-3 text-sm font-black text-white hover:bg-emerald-600"
              >
                {studyIndex < studyCards.length - 1 ? 'Próximo →' : 'Concluir'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-2">
      {/* Header actions */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterCat('all')}
            className={`rounded-full border px-3 py-1 text-xs font-black transition ${filterCat === 'all' ? 'border-primary bg-primary-light text-primary-dark' : 'border-slate-200 text-slate-500 hover:border-primary'}`}
          >
            Todos ({cards.length})
          </button>
          {allCategories.map((cat) => {
            const m = categoryMeta(cat);
            return (
              <button
                key={cat}
                onClick={() => setFilterCat(cat)}
                className={`rounded-full border px-3 py-1 text-xs font-black transition ${filterCat === cat ? `${m.color}` : 'border-slate-200 text-slate-500 hover:border-primary'}`}
              >
                {m.emoji} {m.label} ({cards.filter((c) => c.category === cat).length})
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          {filtered.length > 0 && (
            <button
              onClick={() => { setStudyIndex(0); setStudyFlipped(false); setStudyMode(true); }}
              className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-4 py-2 text-xs font-black text-white hover:bg-emerald-600"
            >
              <RotateCcw size={13} /> Estudar
            </button>
          )}
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-xs font-black text-white hover:bg-primary-dark"
          >
            <Plus size={13} /> Novo
          </button>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="mb-5 rounded-2xl border-2 border-primary/30 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-black text-slate-800">Novo flashcard</h3>
            <button type="button" onClick={() => setShowForm(false)}><X size={16} className="text-slate-400" /></button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">Frente (termo)</label>
              <input
                value={form.front}
                onChange={(e) => setForm((f) => ({ ...f, front: e.target.value }))}
                className="w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="Ex: O que é um generic?"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">Verso (resposta)</label>
              <textarea
                value={form.back}
                onChange={(e) => setForm((f) => ({ ...f, back: e.target.value }))}
                rows={3}
                className="w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="Resposta / definição"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">Exemplo de código (opcional)</label>
              <textarea
                value={form.code_example ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, code_example: e.target.value || undefined }))}
                rows={4}
                className="w-full rounded-xl border-2 border-slate-200 bg-slate-900 px-3 py-2.5 font-mono text-xs text-emerald-300 outline-none focus:border-primary"
                placeholder="function example<T>(x: T): T { return x; }"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">Categoria</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="rounded-xl border-2 border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
              >
                <option value="react">⚛️ React</option>
                <option value="typescript">🔷 TypeScript</option>
                <option value="leetcode">LC LeetCode</option>
                <option value="general">📚 Geral</option>
              </select>
            </div>
          </div>
          {formError && <p className="mt-2 text-xs font-bold text-rose-600">{formError}</p>}
          <button
            type="submit"
            disabled={saving}
            className="kid-button mt-4 bg-primary hover:bg-primary-dark"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            <span className="ml-2">{saving ? 'Salvando...' : 'Criar flashcard'}</span>
          </button>
        </form>
      )}

      {/* Cards list */}
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 py-10 text-center">
          <p className="text-sm font-bold text-slate-400">Nenhum flashcard ainda.</p>
          <p className="mt-1 text-xs text-slate-400">Clique em &quot;Novo&quot; para criar o primeiro.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((card) => {
            const meta = categoryMeta(card.category);
            return (
              <div key={card.id} className="rounded-2xl border-2 border-slate-100 bg-white px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-black ${meta.color}`}>
                        {meta.emoji}
                      </span>
                      <p className="font-black text-slate-800">{card.front}</p>
                    </div>
                    <p className="mt-1 text-sm text-slate-500 line-clamp-2">{card.back}</p>
                    {card.code_example && (
                      <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-2 text-xs text-emerald-300">
                        <code>{card.code_example.slice(0, 120)}{card.code_example.length > 120 ? '…' : ''}</code>
                      </pre>
                    )}
                  </div>
                  <button
                    onClick={() => void handleDelete(card.id)}
                    disabled={deleting === card.id}
                    className="mt-0.5 shrink-0 rounded-full p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-40"
                  >
                    {deleting === card.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EDITOR TAB
// ═══════════════════════════════════════════════════════════════════════════════
function EditorTab() {
  const [lang, setLang] = useState('typescript');
  const [code, setCode] = useState(
    `// Rascunho — TypeScript / React\n// Use esta área para experimentar ideias\n\ninterface User {\n  id: number;\n  name: string;\n}\n\nfunction greet(user: User): string {\n  return \`Olá, \${user.name}!\`;\n}\n`,
  );
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleClear() {
    setCode('');
  }

  return (
    <div className="pt-2">
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {EDITOR_LANGS.map((l) => (
            <button
              key={l.value}
              onClick={() => setLang(l.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
                lang === l.value
                  ? 'bg-slate-800 text-white'
                  : 'border border-slate-200 text-slate-500 hover:border-slate-400'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-500 hover:border-slate-400"
          >
            {copied ? '✓ Copiado' : 'Copiar'}
          </button>
          <button
            onClick={handleClear}
            className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-400 hover:border-rose-400"
          >
            Limpar
          </button>
        </div>
      </div>

      {/* Editor area */}
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        spellCheck={false}
        className="w-full rounded-2xl border-2 border-slate-800 bg-slate-900 p-5 font-mono text-sm leading-relaxed text-emerald-300 outline-none focus:border-primary"
        style={{ minHeight: '420px', resize: 'vertical' }}
        placeholder="// Escreva seu código aqui..."
      />
      <p className="mt-2 text-right text-xs text-slate-400">
        {code.split('\n').length} linhas · {code.length} caracteres
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [forms, setForms] = useState<Record<number, { provider: string; model: string; base_url: string; api_key: string }>>({});

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [userList, providerList] = await Promise.all([
        api.adminListUsers(),
        api.getAIProviders(),
      ]);
      setUsers(userList);
      setProviders(providerList);
      setForms(Object.fromEntries(userList.map((user) => [
        user.id,
        {
          provider: user.ai_settings.provider,
          model: user.ai_settings.model,
          base_url: user.ai_settings.base_url ?? '',
          api_key: '',
        },
      ])));
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Nao foi possivel carregar usuarios.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  function updateForm(userId: number, field: 'provider' | 'model' | 'base_url' | 'api_key', value: string) {
    setForms((current) => ({
      ...current,
      [userId]: {
        ...(current[userId] ?? {
          provider: 'gemini',
          model: 'gemini-3.1-flash-lite',
          base_url: '',
          api_key: '',
        }),
        [field]: value,
      },
    }));
  }

  async function saveUserSettings(user: AdminUser) {
    const form = forms[user.id];
    if (!form) return;
    if (!user.ai_settings.has_api_key && !form.api_key.trim()) {
      setMessage({ tone: 'error', text: 'Cole a chave de API antes de salvar para este usuario.' });
      return;
    }
    setSavingUserId(user.id);
    setMessage(null);
    try {
      const saved = await api.adminSaveUserAISettings(user.id, {
        provider: form.provider,
        model: form.model,
        base_url: form.base_url.trim() || undefined,
        ...(form.api_key.trim() ? { api_key: form.api_key.trim() } : {}),
      });
      setUsers((current) => current.map((item) => (
        item.id === user.id ? { ...item, ai_settings: saved } : item
      )));
      setForms((current) => ({
        ...current,
        [user.id]: {
          provider: saved.provider,
          model: saved.model,
          base_url: saved.base_url ?? '',
          api_key: '',
        },
      }));
      setMessage({ tone: 'success', text: `Chave de IA salva para ${user.email}.` });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Nao foi possivel salvar a chave de IA.',
      });
    } finally {
      setSavingUserId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-primary-dark">Usuarios</p>
          <h2 className="text-2xl font-black text-slate-800">Chaves de IA por conta</h2>
        </div>
        <button
          type="button"
          onClick={loadUsers}
          className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-black text-slate-600 hover:border-primary hover:text-primary-dark"
        >
          <RotateCcw size={15} /> Atualizar
        </button>
      </div>

      {message ? (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`rounded-xl px-4 py-3 text-sm font-bold ${
            message.tone === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {users.map((user) => {
        const form = forms[user.id] ?? {
          provider: user.ai_settings.provider,
          model: user.ai_settings.model,
          base_url: user.ai_settings.base_url ?? '',
          api_key: '',
        };
        const provider = providers.find((item) => item.id === form.provider);
        const saving = savingUserId === user.id;
        return (
          <article key={user.id} className="rounded-2xl border-2 border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-800">{user.first_name} {user.last_name}</h3>
                <p className="break-all text-sm font-bold text-slate-500">{user.email}</p>
                <p className="mt-1 text-xs font-bold text-slate-400">
                  Login: {user.auth_provider} - Criado em {new Date(user.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${
                user.ai_settings.has_api_key ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}>
                <KeyRound size={13} />
                {user.ai_settings.has_api_key ? `Chave ${user.ai_settings.api_key_preview ?? 'salva'}` : 'Sem chave'}
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm font-black text-slate-700">
                Provedor
                <select
                  value={form.provider}
                  onChange={(event) => {
                    const nextProvider = event.target.value;
                    const selectedProvider = providers.find((item) => item.id === nextProvider);
                    updateForm(user.id, 'provider', nextProvider);
                    if (selectedProvider) updateForm(user.id, 'model', selectedProvider.default_model);
                  }}
                  className="mt-1 w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"
                >
                  {providers.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-black text-slate-700">
                Modelo
                <input
                  value={form.model}
                  onChange={(event) => updateForm(user.id, 'model', event.target.value)}
                  className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"
                />
              </label>
              <label className="text-sm font-black text-slate-700 md:col-span-2">
                Base URL
                <input
                  value={form.base_url}
                  onChange={(event) => updateForm(user.id, 'base_url', event.target.value)}
                  placeholder={provider?.requires_base_url ? 'URL obrigatoria para este provedor' : 'Opcional'}
                  className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"
                />
              </label>
              <label className="text-sm font-black text-slate-700 md:col-span-2">
                Nova chave API
                <input
                  type="password"
                  value={form.api_key}
                  onChange={(event) => updateForm(user.id, 'api_key', event.target.value)}
                  placeholder="Cole a nova chave"
                  autoComplete="new-password"
                  className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"
                />
              </label>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => saveUserSettings(user)}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
                {saving ? 'Salvando...' : 'Salvar chave'}
              </button>
            </div>
          </article>
        );
      })}

      {users.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center text-sm font-bold text-slate-500">
          Nenhum usuario cadastrado ainda.
        </p>
      ) : null}
    </div>
  );
}

export default function AdminLearnPage() {
  const [checkDone, setCheckDone] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('modules');

  useEffect(() => {
    api.adminCheck()
      .then((res) => setIsAdmin(res.is_admin))
      .catch(() => setIsAdmin(false))
      .finally(() => setCheckDone(true));
  }, []);

  if (!checkDone) {
    return (
      <StatusCard
        tone="loading"
        title="Verificando acesso"
        message="Confirmando permissões de administrador..."
        secondaryHref="/"
        secondaryLabel="Voltar ao início"
      />
    );
  }

  if (!isAdmin) {
    return (
      <StatusCard
        tone="error"
        title="Acesso restrito"
        message="Esta área é exclusiva para o administrador configurado nas variáveis de ambiente do backend."
        secondaryHref="/"
        secondaryLabel="Voltar ao início"
      />
    );
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'modules',    label: 'Módulos',    icon: <BookOpen size={15} /> },
    { id: 'flashcards', label: 'Flashcards', icon: <Brain size={15} /> },
    { id: 'users',      label: 'Usuarios',   icon: <Users size={15} /> },
    { id: 'editor',     label: 'Editor',     icon: <Code2 size={15} /> },
  ];

  return (
    <main className="min-h-screen px-4 py-6 md:px-10 md:py-12">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-primary-dark hover:text-primary">
            <ArrowLeft size={16} /> Início
          </Link>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
            🔒 Admin
          </span>
        </div>

        <h1 className="mb-1 text-3xl font-black text-slate-800 md:text-4xl">Aprender React & TypeScript</h1>
        <p className="mb-6 text-sm text-slate-500">Teoria, quizzes, flashcards e editor de código.</p>

        {/* Tabs */}
        <div className="mb-6 flex gap-2 rounded-2xl border-2 border-slate-100 bg-slate-50 p-1.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-black transition ${
                activeTab === tab.id
                  ? 'bg-white text-primary-dark shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'modules'    && <ModulesTab />}
        {activeTab === 'flashcards' && <FlashcardsTab />}
        {activeTab === 'users'      && <UsersTab />}
        {activeTab === 'editor'     && <EditorTab />}
      </div>
    </main>
  );
}
