'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, CheckCircle2, Loader2, Plus, Sparkles, Star, Trash2, X } from 'lucide-react';
import { api, type AIQuizQuestion, type ProgrammingFlashcard, type ProgrammingTopic } from '@/lib/api';

interface Props {
  topic: ProgrammingTopic;
  subjectName: string;
  onBack: () => void;
  onTopicUpdated: (topic: ProgrammingTopic) => void;
}

type QuizState = { answered: boolean; selected: string; correct: boolean }[];

export function TopicView({ topic: initialTopic, subjectName, onBack, onTopicUpdated }: Props) {
  const [topic, setTopic] = useState(initialTopic);
  const [flashcards, setFlashcards] = useState<ProgrammingFlashcard[]>([]);
  const [loadingFc, setLoadingFc] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [notes, setNotes] = useState(topic.notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [quizState, setQuizState] = useState<QuizState>([]);
  const [showAddFc, setShowAddFc] = useState(false);
  const [addFcFront, setAddFcFront] = useState('');
  const [addFcBack, setAddFcBack] = useState('');
  const [addFcCode, setAddFcCode] = useState('');
  const [addingFc, setAddingFc] = useState(false);

  useEffect(() => {
    setLoadingFc(true);
    api.getTopicFlashcards(topic.id)
      .then(setFlashcards)
      .finally(() => setLoadingFc(false));
  }, [topic.id]);

  useEffect(() => {
    if (topic.ai_content?.quiz) {
      setQuizState(topic.ai_content.quiz.map(() => ({ answered: false, selected: '', correct: false })));
    }
  }, [topic.ai_content]);

  async function handleGenerate() {
    setGenerating(true);
    setGenError('');
    try {
      const updated = await api.generateCodingTopicContent(topic.id);
      setTopic(updated);
      onTopicUpdated(updated);
      const fcs = await api.getTopicFlashcards(topic.id);
      setFlashcards(fcs);
    } catch (err: unknown) {
      setGenError(err instanceof Error ? err.message : 'Erro ao gerar conteúdo.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveNotes() {
    setSavingNotes(true);
    try {
      const updated = await api.updateCodingTopic(topic.id, { notes });
      setTopic(updated);
      onTopicUpdated(updated);
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleSetStatus(status: 'studied' | 'mastered') {
    const updated = await api.updateCodingTopic(topic.id, { status });
    setTopic(updated);
    onTopicUpdated(updated);
  }

  async function handleAddFlashcard(e: React.FormEvent) {
    e.preventDefault();
    if (!addFcFront.trim() || !addFcBack.trim()) return;
    setAddingFc(true);
    try {
      const fc = await api.createTopicFlashcard(topic.id, {
        front: addFcFront.trim(),
        back: addFcBack.trim(),
        code_example: addFcCode.trim() || undefined,
      });
      setFlashcards((prev) => [...prev, fc]);
      setAddFcFront('');
      setAddFcBack('');
      setAddFcCode('');
      setShowAddFc(false);
    } finally {
      setAddingFc(false);
    }
  }

  async function handleDeleteFlashcard(id: number) {
    await api.deleteCodingFlashcard(id);
    setFlashcards((prev) => prev.filter((fc) => fc.id !== id));
  }

  function handleQuizAnswer(qIdx: number, option: string, question: AIQuizQuestion) {
    setQuizState((prev) =>
      prev.map((s, i) =>
        i === qIdx ? { answered: true, selected: option, correct: option === question.correct_option } : s,
      ),
    );
  }

  const statusLabel =
    topic.status === 'mastered' ? '⭐ Dominado' : topic.status === 'studied' ? '✅ Estudado' : '🔘 Não iniciado';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="kid-surface border-primary/30 p-6">
        <button type="button" onClick={onBack} className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-primary">
          <ArrowLeft size={16} /> {subjectName}
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">{statusLabel}</span>
            <h1 className="mt-2 text-2xl font-black text-slate-800">{topic.title}</h1>
          </div>
          <div className="flex gap-2">
            {topic.status !== 'mastered' && (
              <button
                type="button"
                onClick={() => handleSetStatus(topic.status === 'studied' ? 'mastered' : 'studied')}
                className="flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-black text-white hover:bg-emerald-600"
              >
                {topic.status === 'studied' ? <><Star size={14} /> Dominar</> : <><CheckCircle2 size={14} /> Estudado</>}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Generate button or AI content */}
      {!topic.ai_content ? (
        <div className="rounded-3xl border-2 border-violet-100 bg-violet-50 p-8 text-center">
          <Sparkles size={32} className="mx-auto mb-3 text-violet-400" />
          <p className="font-bold text-violet-700">Nenhum conteúdo ainda.</p>
          <p className="mt-1 text-sm text-violet-500">Gere a aula com IA para criar seções, quiz e flashcards automaticamente.</p>
          {genError && <p className="mt-3 text-sm font-bold text-rose-600">{genError}</p>}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="mx-auto mt-4 flex items-center gap-2 rounded-2xl bg-violet-600 px-6 py-3 font-black text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {generating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            Gerar com IA
          </button>
        </div>
      ) : (
        <>
          {/* Sections */}
          <div className="space-y-4">
            {topic.ai_content.sections.map((section, i) => (
              <div key={i} className="rounded-3xl border-2 border-slate-100 bg-white p-5">
                <h3 className="mb-2 text-base font-black text-slate-800">{section.title}</h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{section.body}</p>
                {section.code_example && (
                  <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-900 p-4 text-xs text-slate-100">
                    <code>{section.code_example}</code>
                  </pre>
                )}
              </div>
            ))}
          </div>

          {/* Quiz */}
          {topic.ai_content.quiz.length > 0 && (
            <div className="rounded-3xl border-2 border-amber-100 bg-amber-50 p-5">
              <h2 className="mb-4 flex items-center gap-2 font-black text-amber-800">
                <BookOpen size={18} /> Quiz ({topic.ai_content.quiz.length} perguntas)
              </h2>
              <div className="space-y-5">
                {topic.ai_content.quiz.map((q, qIdx) => {
                  const state = quizState[qIdx];
                  return (
                    <div key={q.id} className="rounded-2xl bg-white p-4">
                      <p className="mb-3 font-semibold text-slate-800">{qIdx + 1}. {q.question}</p>
                      <div className="space-y-2">
                        {q.options.map((opt) => {
                          const isSelected = state?.selected === opt;
                          const isCorrect = opt === q.correct_option;
                          const answered = state?.answered;
                          let cls = 'rounded-xl border-2 px-4 py-2.5 text-sm font-semibold text-left w-full transition ';
                          if (!answered) cls += 'border-slate-200 hover:border-primary cursor-pointer';
                          else if (isCorrect) cls += 'border-emerald-400 bg-emerald-50 text-emerald-700';
                          else if (isSelected) cls += 'border-rose-300 bg-rose-50 text-rose-700';
                          else cls += 'border-slate-100 text-slate-400';
                          return (
                            <button key={opt} type="button" className={cls} disabled={answered} onClick={() => handleQuizAnswer(qIdx, opt, q)}>
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                      {state?.answered && (
                        <div className={`mt-3 rounded-xl px-3 py-2 text-xs font-semibold ${state.correct ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                          {state.correct ? '✅ Correto! ' : '❌ Incorreto. '}{q.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Regenerate */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 rounded-2xl border-2 border-violet-200 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Regenerar com IA
            </button>
          </div>
        </>
      )}

      {/* Notes */}
      <div className="rounded-3xl border-2 border-slate-100 bg-white p-5">
        <h2 className="mb-3 font-black text-slate-800">Minhas Notas</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anote o que aprendeu, dúvidas, links..."
          maxLength={5000}
          rows={4}
          className="w-full resize-none rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={handleSaveNotes}
          disabled={savingNotes || notes === (topic.notes ?? '')}
          className="mt-2 rounded-2xl bg-primary px-5 py-2 text-sm font-black text-white hover:bg-primary-dark disabled:opacity-40"
        >
          {savingNotes ? 'Salvando...' : 'Salvar Notas'}
        </button>
      </div>

      {/* Flashcards */}
      <div className="rounded-3xl border-2 border-slate-100 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-black text-slate-800">Flashcards ({loadingFc ? '...' : flashcards.length})</h2>
          <button
            type="button"
            onClick={() => setShowAddFc((v) => !v)}
            className="flex items-center gap-1.5 rounded-2xl border-2 border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 hover:border-primary"
          >
            {showAddFc ? <X size={14} /> : <Plus size={14} />}
            {showAddFc ? 'Cancelar' : 'Adicionar'}
          </button>
        </div>
        {showAddFc && (
          <form onSubmit={handleAddFlashcard} className="mb-4 space-y-3 rounded-2xl bg-slate-50 p-4">
            <input value={addFcFront} onChange={(e) => setAddFcFront(e.target.value)} placeholder="Frente (conceito / pergunta)" maxLength={500} required className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-primary" />
            <textarea value={addFcBack} onChange={(e) => setAddFcBack(e.target.value)} placeholder="Verso (resposta / explicação)" maxLength={2000} required rows={3} className="w-full resize-none rounded-xl border-2 border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-primary" />
            <textarea value={addFcCode} onChange={(e) => setAddFcCode(e.target.value)} placeholder="Exemplo de código (opcional)" maxLength={3000} rows={2} className="w-full resize-none rounded-xl border-2 border-slate-900 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-violet-400" />
            <button type="submit" disabled={addingFc || !addFcFront.trim() || !addFcBack.trim()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2 font-black text-white hover:bg-primary-dark disabled:opacity-50">
              {addingFc ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Adicionar Flashcard
            </button>
          </form>
        )}
        {loadingFc ? (
          <div className="flex justify-center py-4"><Loader2 className="animate-spin text-primary" size={24} /></div>
        ) : (
          <div className="space-y-3">
            {flashcards.map((fc) => (
              <div key={fc.id} className="rounded-2xl border-2 border-slate-100 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-black text-slate-800">{fc.front}</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{fc.back}</p>
                    {fc.code_example && (
                      <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">
                        <code>{fc.code_example}</code>
                      </pre>
                    )}
                  </div>
                  <button type="button" onClick={() => handleDeleteFlashcard(fc.id)} className="shrink-0 rounded-xl p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {flashcards.length === 0 && (
              <p className="py-4 text-center text-sm text-slate-400">Nenhum flashcard. Gere com IA ou adicione manualmente.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
