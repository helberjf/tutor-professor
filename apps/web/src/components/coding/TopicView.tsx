'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, CheckCircle2, Copy, Loader2, Plus, Sparkles, Star, Trash2, Upload, X } from 'lucide-react';
import { api, type AIQuizQuestion, type ProgrammingFlashcard, type ProgrammingTopic } from '@/lib/api';
import { SyntaxCodeBlock } from './SyntaxCodeBlock';

interface Props {
  topic: ProgrammingTopic;
  subjectName: string;
  onBack: () => void;
  onTopicUpdated: (topic: ProgrammingTopic) => void;
}

type QuizState = { answered: boolean; selected: string; correct: boolean }[];
type FlashcardDraft = { front: string; back: string; code_example?: string };

function pickTextField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return '';
}

function normalizeFlashcardDraft(item: unknown): FlashcardDraft | null {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  const front = pickTextField(record, ['front', 'question', 'pergunta', 'term', 'conceito']).slice(0, 500);
  const back = pickTextField(record, ['back', 'answer', 'resposta', 'definition', 'explicacao']).slice(0, 2000);
  const code = pickTextField(record, ['code_example', 'code', 'codigo', 'example']).slice(0, 3000);
  if (!front || !back) return null;
  return { front, back, ...(code ? { code_example: code } : {}) };
}

function parseTextFlashcards(text: string): FlashcardDraft[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const separator = ['=>', '|', '\t', '::'].find((item) => block.includes(item));
      if (separator) {
        const [front, ...backParts] = block.split(separator);
        return normalizeFlashcardDraft({ front, back: backParts.join(separator) });
      }
      const [front, ...backParts] = block.split(/\r?\n/);
      return normalizeFlashcardDraft({ front, back: backParts.join('\n') });
    })
    .filter((draft): draft is FlashcardDraft => Boolean(draft))
    .slice(0, 50);
}

function parseFlashcardImport(raw: string): FlashcardDraft[] {
  const text = raw.trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text) as unknown;
    const items = Array.isArray(parsed) ? parsed : [parsed];
    const drafts = items
      .map(normalizeFlashcardDraft)
      .filter((draft): draft is FlashcardDraft => Boolean(draft))
      .slice(0, 50);
    if (drafts.length > 0) return drafts;
    throw new Error('JSON sem campos front/back ou question/answer.');
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    // Plain text import is handled below.
  }

  const drafts = parseTextFlashcards(text);
  if (drafts.length === 0) {
    throw new Error('Cole JSON valido ou texto no formato Frente | Verso.');
  }
  return drafts;
}

export function TopicView({ topic: initialTopic, subjectName, onBack, onTopicUpdated }: Props) {
  const [topic, setTopic] = useState(initialTopic);
  const [flashcards, setFlashcards] = useState<ProgrammingFlashcard[]>([]);
  const [loadingFc, setLoadingFc] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [showRegenerateContext, setShowRegenerateContext] = useState(false);
  const [regenerateContext, setRegenerateContext] = useState('');
  const [notes, setNotes] = useState(topic.notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [quizState, setQuizState] = useState<QuizState>([]);
  const [showAddFc, setShowAddFc] = useState(false);
  const [addFcFront, setAddFcFront] = useState('');
  const [addFcBack, setAddFcBack] = useState('');
  const [addFcCode, setAddFcCode] = useState('');
  const [addingFc, setAddingFc] = useState(false);
  const [showImportFc, setShowImportFc] = useState(false);
  const [importFcText, setImportFcText] = useState('');
  const [importFcError, setImportFcError] = useState('');
  const [importingFc, setImportingFc] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const [showAdditionalFlashcardForm, setShowAdditionalFlashcardForm] = useState(false);
  const [additionalFlashcardContext, setAdditionalFlashcardContext] = useState('');
  const [generatingAdditionalFlashcards, setGeneratingAdditionalFlashcards] = useState(false);
  const [additionalFlashcardError, setAdditionalFlashcardError] = useState('');
  const [additionalFlashcardSuccess, setAdditionalFlashcardSuccess] = useState('');

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

  async function handleGenerate(context?: string) {
    setGenerating(true);
    setGenError('');
    try {
      const contextText = context?.trim();
      const updated = contextText
        ? await api.generateCodingTopicContent(topic.id, { context: contextText })
        : await api.generateCodingTopicContent(topic.id);
      setTopic(updated);
      onTopicUpdated(updated);
      setShowRegenerateContext(false);
      setRegenerateContext('');
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

  async function handleGenerateAdditionalFlashcards(e: React.FormEvent) {
    e.preventDefault();
    setGeneratingAdditionalFlashcards(true);
    setAdditionalFlashcardError('');
    setAdditionalFlashcardSuccess('');
    try {
      const created = await api.generateAdditionalCodingFlashcards(topic.id, additionalFlashcardContext);
      setFlashcards((current) => [...current, ...created]);
      const updatedTopic = { ...topic, flashcard_count: topic.flashcard_count + 5 };
      setTopic(updatedTopic);
      onTopicUpdated(updatedTopic);
      setAdditionalFlashcardSuccess('5 novas questões foram criadas com IA.');
      setShowAdditionalFlashcardForm(false);
      setAdditionalFlashcardContext('');
    } catch (err) {
      setAdditionalFlashcardError(err instanceof Error ? err.message : 'Não foi possível criar mais questões.');
    } finally {
      setGeneratingAdditionalFlashcards(false);
    }
  }

  async function handleCopyFlashcards() {
    setCopyMessage('');
    setImportFcError('');
    const payload = flashcards.map((fc) => ({
      front: fc.front,
      back: fc.back,
      ...(fc.code_example ? { code_example: fc.code_example } : {}),
    }));
    const text = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage('JSON copiado.');
    } catch {
      setImportFcText(text);
      setShowImportFc(true);
      setCopyMessage('Nao consegui copiar automaticamente; deixei o JSON no campo de importacao.');
    }
  }

  async function handleImportFlashcards(e: React.FormEvent) {
    e.preventDefault();
    setImportFcError('');
    setCopyMessage('');

    let drafts: FlashcardDraft[];
    try {
      drafts = parseFlashcardImport(importFcText);
    } catch (err) {
      setImportFcError(err instanceof Error ? err.message : 'Não foi possível ler os flashcards.');
      return;
    }
    if (drafts.length === 0) {
      setImportFcError('Cole pelo menos um flashcard.');
      return;
    }

    setImportingFc(true);
    try {
      const created: ProgrammingFlashcard[] = [];
      for (const draft of drafts) {
        created.push(await api.createTopicFlashcard(topic.id, draft));
      }
      setFlashcards((prev) => [...prev, ...created]);
      setImportFcText('');
      setShowImportFc(false);
      setCopyMessage(`${created.length} flashcard${created.length === 1 ? '' : 's'} importado${created.length === 1 ? '' : 's'}.`);
    } catch (err) {
      setImportFcError(err instanceof Error ? err.message : 'Não foi possível importar os flashcards.');
    } finally {
      setImportingFc(false);
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
            onClick={() => void handleGenerate()}
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
                  <SyntaxCodeBlock code={section.code_example} language={subjectName} className="mt-3" />
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
            {showRegenerateContext ? (
              <div className="w-full max-w-xl rounded-3xl border-2 border-violet-200 bg-violet-50 p-4">
                <label className="block text-left">
                  <span className="text-sm font-black text-violet-800">Como quer regenerar com IA?</span>
                  <textarea
                    value={regenerateContext}
                    onChange={(event) => setRegenerateContext(event.target.value)}
                    placeholder="Ex.: foque em exemplos de entrevista, explique mais devagar, use TypeScript, traga armadilhas comuns..."
                    maxLength={1000}
                    rows={3}
                    className="mt-2 w-full resize-none rounded-2xl border-2 border-violet-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-violet-500"
                  />
                </label>
                {genError && <p className="mt-2 text-sm font-bold text-rose-600">{genError}</p>}
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRegenerateContext(false);
                      setRegenerateContext('');
                      setGenError('');
                    }}
                    disabled={generating}
                    className="rounded-2xl border-2 border-violet-200 bg-white px-4 py-2 text-sm font-black text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleGenerate(regenerateContext)}
                    disabled={generating}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-2 text-sm font-black text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    Regenerar agora
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setGenError('');
                  setShowRegenerateContext(true);
                }}
                disabled={generating}
                className="flex items-center gap-2 rounded-2xl border-2 border-violet-200 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
              >
                {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Regenerar com IA
              </button>
            )}
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
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-black text-slate-800">Flashcards ({loadingFc ? '...' : flashcards.length})</h2>
          <div className="flex flex-wrap gap-2">
            {!showAdditionalFlashcardForm && (
              <button
                type="button"
                onClick={() => {
                  setShowAdditionalFlashcardForm(true);
                  setShowAddFc(false);
                  setShowImportFc(false);
                  setAdditionalFlashcardError('');
                  setAdditionalFlashcardSuccess('');
                }}
                className="flex items-center gap-1.5 rounded-2xl border-2 border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-bold text-violet-700 hover:bg-violet-100"
              >
                <Sparkles size={14} />
                Criar mais questões com IA
              </button>
            )}
            <button
              type="button"
              onClick={handleCopyFlashcards}
              disabled={loadingFc || flashcards.length === 0}
              className="flex items-center gap-1.5 rounded-2xl border-2 border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 hover:border-primary disabled:opacity-40"
            >
              <Copy size={14} />
              Copiar JSON
            </button>
            <button
              type="button"
              onClick={() => {
                setShowImportFc((value) => !value);
                setShowAddFc(false);
                setImportFcError('');
              }}
              className="flex items-center gap-1.5 rounded-2xl border-2 border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 hover:border-primary"
            >
              {showImportFc ? <X size={14} /> : <Upload size={14} />}
              {showImportFc ? 'Cancelar' : 'Importar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddFc((v) => !v);
                setShowImportFc(false);
              }}
              className="flex items-center gap-1.5 rounded-2xl border-2 border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 hover:border-primary"
            >
              {showAddFc ? <X size={14} /> : <Plus size={14} />}
              {showAddFc ? 'Cancelar' : 'Adicionar'}
            </button>
          </div>
        </div>
        {additionalFlashcardSuccess && (
          <p className="mb-3 rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700">{additionalFlashcardSuccess}</p>
        )}
        {showAdditionalFlashcardForm && (
          <form onSubmit={handleGenerateAdditionalFlashcards} className="mb-4 space-y-3 rounded-2xl border-2 border-violet-100 bg-violet-50 p-4">
            <label className="block">
              <span className="text-sm font-black text-violet-800">Contexto para as novas questões (opcional)</span>
              <textarea
                value={additionalFlashcardContext}
                onChange={(event) => setAdditionalFlashcardContext(event.target.value)}
                placeholder="Ex.: foque em debugging, entrevistas técnicas ou armadilhas comuns..."
                maxLength={1000}
                rows={3}
                disabled={generatingAdditionalFlashcards}
                className="mt-2 w-full resize-none rounded-2xl border-2 border-violet-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-violet-500 disabled:opacity-60"
              />
            </label>
            <p className="text-sm font-bold text-violet-700">Serão criadas 5 questões</p>
            {additionalFlashcardError && (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{additionalFlashcardError}</p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowAdditionalFlashcardForm(false);
                  setAdditionalFlashcardContext('');
                  setAdditionalFlashcardError('');
                }}
                disabled={generatingAdditionalFlashcards}
                className="rounded-2xl border-2 border-violet-200 bg-white px-4 py-2 text-sm font-black text-violet-700 hover:bg-violet-100 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={generatingAdditionalFlashcards}
                className="flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-2 text-sm font-black text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {generatingAdditionalFlashcards ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {generatingAdditionalFlashcards ? 'Criando questões...' : 'Criar 5 questões'}
              </button>
            </div>
          </form>
        )}
        {copyMessage && (
          <p className="mb-3 rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700">{copyMessage}</p>
        )}
        {showImportFc && (
          <form onSubmit={handleImportFlashcards} className="mb-4 space-y-3 rounded-2xl bg-slate-50 p-4">
            <textarea
              value={importFcText}
              onChange={(e) => setImportFcText(e.target.value)}
              placeholder={'[\n  {"front":"O que e closure?","back":"Funcao que lembra o escopo onde foi criada.","code_example":"function outer() { return function inner() {} }"}\n]\n\nou:\nPergunta | Resposta\nOutra pergunta => Outra resposta'}
              rows={8}
              className="w-full resize-y rounded-xl border-2 border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 outline-none focus:border-primary"
            />
            {importFcError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{importFcError}</p>}
            <button
              type="submit"
              disabled={importingFc || !importFcText.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-2 font-black text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {importingFc ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              Importar flashcards
            </button>
          </form>
        )}
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
                      <SyntaxCodeBlock code={fc.code_example} language={subjectName} className="mt-2 rounded-xl p-3" />
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
