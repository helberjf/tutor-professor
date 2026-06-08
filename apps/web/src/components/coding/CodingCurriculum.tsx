'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Brain, CheckCircle2, Flame, Loader2, Plus, Trash2 } from 'lucide-react';
import { api, type CodingReviewCard, type ProgrammingSubject, type ProgrammingTopic } from '@/lib/api';
import { CreateSubjectModal } from './CreateSubjectModal';
import { CreateTopicModal } from './CreateTopicModal';
import { TopicView } from './TopicView';
import { ReviewSession } from './ReviewSession';

type View =
  | { type: 'subjects' }
  | { type: 'topics'; subject: ProgrammingSubject }
  | { type: 'topic'; subject: ProgrammingSubject; topic: ProgrammingTopic }
  | { type: 'review'; subject: ProgrammingSubject; cards: CodingReviewCard[] };

export function CodingCurriculum() {
  const [view, setView] = useState<View>({ type: 'subjects' });
  const [subjects, setSubjects] = useState<ProgrammingSubject[]>([]);
  const [topics, setTopics] = useState<ProgrammingTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [showCreateSubject, setShowCreateSubject] = useState(false);
  const [showCreateTopic, setShowCreateTopic] = useState(false);
  const [loadingReview, setLoadingReview] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSubjects();
  }, []);

  async function loadSubjects() {
    setLoading(true);
    setError('');
    try {
      setSubjects(await api.getCodingSubjects());
    } catch {
      setError('Erro ao carregar matérias.');
    } finally {
      setLoading(false);
    }
  }

  async function loadTopics(subject: ProgrammingSubject) {
    setLoadingTopics(true);
    try {
      setTopics(await api.getCodingTopics(subject.id));
      setView({ type: 'topics', subject });
    } finally {
      setLoadingTopics(false);
    }
  }

  async function handleStartReview(subject: ProgrammingSubject) {
    setLoadingReview(true);
    try {
      const session = await api.getCodingReview(subject.id);
      if (session.total_due === 0) {
        alert('Nenhum flashcard para revisar agora. Continue estudando e volte mais tarde!');
        return;
      }
      setView({ type: 'review', subject, cards: session.items });
    } finally {
      setLoadingReview(false);
    }
  }

  async function handleDeleteSubject(id: number) {
    if (!confirm('Remover esta matéria e todos os seus tópicos e flashcards?')) return;
    await api.deleteCodingSubject(id);
    setSubjects((prev) => prev.filter((s) => s.id !== id));
    if (view.type !== 'subjects') setView({ type: 'subjects' });
  }

  async function handleDeleteTopic(id: number, subject: ProgrammingSubject) {
    if (!confirm('Remover este tópico e seus flashcards?')) return;
    await api.deleteCodingTopic(id);
    setTopics((prev) => prev.filter((t) => t.id !== id));
    await loadSubjects();
    if (view.type === 'topic') setView({ type: 'topics', subject });
  }

  // ── Subjects view ────────────────────────────────────────────────────────
  if (view.type === 'subjects') {
    return (
      <div className="space-y-6">
        <section className="kid-surface border-primary/30 p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Programação · Currículo</p>
          <h1 className="mt-2 text-3xl font-black text-slate-800">Minhas Matérias</h1>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <MetricChip icon={<BookOpen size={20} />} label="Matérias" value={subjects.length} tone="sky" />
            <MetricChip icon={<CheckCircle2 size={20} />} label="Tópicos estudados" value={subjects.reduce((a, s) => a + s.studied_count, 0)} tone="green" />
            <MetricChip icon={<Flame size={20} />} label="Para revisar" value={subjects.reduce((a, s) => a + s.due_review_count, 0)} tone="orange" />
          </div>
        </section>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={32} /></div>
        ) : (
          <>
            {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p>}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {subjects.map((subject) => (
                <div
                  key={subject.id}
                  className="group cursor-pointer rounded-3xl border-2 border-slate-100 bg-white p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md"
                  onClick={() => loadTopics(subject)}
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-light text-2xl">
                      {subject.icon_emoji || '📚'}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDeleteSubject(subject.id); }}
                      className="rounded-xl p-1.5 text-slate-300 opacity-0 transition hover:text-rose-500 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <h3 className="font-black text-slate-800">{subject.name}</h3>
                  {subject.description && <p className="mt-1 text-xs text-slate-500 line-clamp-2">{subject.description}</p>}
                  <div className="mt-3 flex items-center gap-3 text-xs font-semibold text-slate-500">
                    <span>{subject.studied_count}/{subject.topic_count} estudados</span>
                    {subject.due_review_count > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 font-black text-amber-700">{subject.due_review_count} para revisar</span>
                    )}
                  </div>
                  {subject.topic_count > 0 && (
                    <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100">
                      <div
                        className="h-1.5 rounded-full bg-emerald-400 transition-all"
                        style={{ width: `${(subject.studied_count / subject.topic_count) * 100}%` }}
                      />
                    </div>
                  )}
                  <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      disabled={loadingTopics}
                      onClick={() => loadTopics(subject)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-primary px-3 py-2 text-xs font-black text-white hover:bg-primary-dark disabled:opacity-50"
                    >
                      {loadingTopics ? <Loader2 size={12} className="animate-spin" /> : <BookOpen size={12} />} Estudar
                    </button>
                    <button
                      type="button"
                      disabled={loadingReview || subject.due_review_count === 0}
                      onClick={() => handleStartReview(subject)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border-2 border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-700 hover:bg-amber-100 disabled:opacity-40"
                    >
                      {loadingReview ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />} Revisar
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setShowCreateSubject(true)}
                className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-slate-200 bg-white p-5 text-slate-400 transition hover:border-primary hover:text-primary-dark"
              >
                <Plus size={28} />
                <span className="font-black">Nova Matéria</span>
              </button>
            </div>
          </>
        )}
        {showCreateSubject && (
          <CreateSubjectModal
            onClose={() => setShowCreateSubject(false)}
            onCreated={(s) => { setSubjects((prev) => [...prev, s]); setShowCreateSubject(false); }}
          />
        )}
      </div>
    );
  }

  // ── Topics view ──────────────────────────────────────────────────────────
  if (view.type === 'topics') {
    const { subject } = view;
    const statusIcon = (s: string) => s === 'mastered' ? '⭐' : s === 'studied' ? '✅' : '🔘';
    return (
      <div className="space-y-6">
        <section className="kid-surface border-primary/30 p-6">
          <button type="button" onClick={() => setView({ type: 'subjects' })} className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-primary">
            <ArrowLeft size={16} /> Todas as matérias
          </button>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{subject.icon_emoji || '📚'}</span>
            <div>
              <h1 className="text-2xl font-black text-slate-800">{subject.name}</h1>
              {subject.description && <p className="text-sm text-slate-500">{subject.description}</p>}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-4 text-sm font-semibold text-slate-500">
            <span>{subject.studied_count}/{subject.topic_count} tópicos estudados</span>
            {subject.due_review_count > 0 && (
              <button
                type="button"
                onClick={() => handleStartReview(subject)}
                disabled={loadingReview}
                className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 font-black text-amber-700 hover:bg-amber-200"
              >
                {loadingReview ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />}
                {subject.due_review_count} para revisar
              </button>
            )}
          </div>
        </section>

        <div className="space-y-3">
          {loadingTopics ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={28} /></div>
          ) : topics.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white px-6 py-12 text-center">
              <p className="font-bold text-slate-500">Nenhum tópico ainda.</p>
              <p className="mt-1 text-sm text-slate-400">Crie o primeiro tópico do roteiro.</p>
            </div>
          ) : (
            topics.map((topic, idx) => (
              <div
                key={topic.id}
                className="flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-slate-100 bg-white px-5 py-4 transition hover:border-primary/40"
                onClick={() => setView({ type: 'topic', subject, topic })}
              >
                <span className="w-5 shrink-0 text-center text-sm font-bold text-slate-400">{idx + 1}</span>
                <span className="text-lg">{statusIcon(topic.status)}</span>
                <div className="flex-1">
                  <p className="font-black text-slate-800">{topic.title}</p>
                  <p className="text-xs text-slate-400">
                    {topic.flashcard_count} flashcard{topic.flashcard_count !== 1 ? 's' : ''}
                    {!topic.ai_content && ' · sem aula gerada'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDeleteTopic(topic.id, subject); }}
                  className="shrink-0 rounded-xl p-1.5 text-slate-300 hover:text-rose-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
          <button
            type="button"
            onClick={() => setShowCreateTopic(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-white py-4 font-black text-slate-400 hover:border-primary hover:text-primary-dark"
          >
            <Plus size={18} /> Novo Tópico
          </button>
        </div>

        {showCreateTopic && (
          <CreateTopicModal
            subjectId={subject.id}
            topicCount={topics.length}
            onClose={() => setShowCreateTopic(false)}
            onCreated={(t) => {
              setTopics((prev) => [...prev, t]);
              setShowCreateTopic(false);
              loadSubjects();
            }}
          />
        )}
      </div>
    );
  }

  // ── Topic detail view ────────────────────────────────────────────────────
  if (view.type === 'topic') {
    const { subject, topic } = view;
    return (
      <TopicView
        topic={topic}
        subjectName={subject.name}
        onBack={() => setView({ type: 'topics', subject })}
        onTopicUpdated={(updated) => {
          setTopics((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
          loadSubjects();
        }}
      />
    );
  }

  // ── Review session view ──────────────────────────────────────────────────
  if (view.type === 'review') {
    const { subject, cards } = view;
    return (
      <ReviewSession
        subjectName={subject.name}
        cards={cards}
        onClose={() => {
          loadSubjects();
          setView({ type: 'topics', subject });
        }}
      />
    );
  }

  return null;
}

function MetricChip({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: 'sky' | 'green' | 'orange' }) {
  const colors = { sky: 'bg-sky-50 text-sky-700', green: 'bg-emerald-50 text-emerald-700', orange: 'bg-amber-50 text-amber-700' };
  return (
    <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${colors[tone]}`}>
      {icon}
      <div>
        <p className="text-xl font-black">{value}</p>
        <p className="text-xs font-semibold opacity-75">{label}</p>
      </div>
    </div>
  );
}
