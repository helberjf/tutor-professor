'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { api, type ProgrammingSubject } from '@/lib/api';

interface Props {
  onClose: () => void;
  onCreated: (subject: ProgrammingSubject) => void;
}

export function CreateSubjectModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const subject = await api.createCodingSubject({
        name: name.trim(),
        description: description.trim() || undefined,
        icon_emoji: emoji.trim() || undefined,
      });
      onCreated(subject);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar matéria.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-800">Nova Matéria</h2>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-3">
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="⚛️"
              maxLength={2}
              className="w-16 rounded-2xl border-2 border-slate-200 bg-white px-3 py-3 text-center text-xl outline-none focus:border-primary"
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome da matéria (ex: React)"
              maxLength={100}
              required
              autoFocus
              className="flex-1 rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 outline-none focus:border-primary"
            />
          </div>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descrição (opcional)"
            maxLength={500}
            className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 outline-none focus:border-primary"
          />
          {error && <p className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-2xl border-2 border-slate-200 py-3 font-bold text-slate-600 hover:bg-slate-50">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary py-3 font-black text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : 'Criar Matéria'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
