'use client';

import { useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { api, type ProgrammingTopic } from '@/lib/api';

interface Props {
  subjectId: number;
  topicCount: number;
  onClose: () => void;
  onCreated: (topic: ProgrammingTopic) => void;
}

export function CreateTopicModal({ subjectId, topicCount, onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [generateAI, setGenerateAI] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError('');
    try {
      const topic = await api.createCodingTopic(subjectId, {
        title: title.trim(),
        order_index: topicCount,
        generate_ai: generateAI,
      });
      onCreated(topic);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar tópico.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-800">Novo Tópico</h2>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nome do tópico (ex: useState Hook)"
            maxLength={200}
            required
            autoFocus
            className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 outline-none focus:border-primary"
          />
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-violet-100 bg-violet-50 px-4 py-3">
            <input
              type="checkbox"
              checked={generateAI}
              onChange={(e) => setGenerateAI(e.target.checked)}
              className="h-5 w-5 rounded accent-violet-600"
            />
            <div>
              <p className="flex items-center gap-1.5 text-sm font-black text-violet-800">
                <Sparkles size={14} /> Gerar aula com IA
              </p>
              <p className="text-xs text-violet-600">Cria seções, quiz e flashcards automaticamente</p>
            </div>
          </label>
          {loading && generateAI && (
            <p className="text-center text-sm font-semibold text-violet-600">Gerando conteúdo com IA... pode demorar alguns segundos.</p>
          )}
          {error && <p className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-2xl border-2 border-slate-200 py-3 font-bold text-slate-600 hover:bg-slate-50">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary py-3 font-black text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
