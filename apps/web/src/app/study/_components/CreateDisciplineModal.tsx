'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';

import { api, type StudyDiscipline } from '@/lib/api';
import { t } from '@/lib/i18n';

/** "Criar nova disciplina": Francês, Direito... Its subjects are created inside it. */
export function CreateDisciplineModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (discipline: StudyDiscipline) => void;
}) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const discipline = await api.createStudyDiscipline({
        name: name.trim(),
        icon_emoji: emoji.trim() || undefined,
        description: description.trim() || undefined,
      });
      onCreated(discipline);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("Não foi possível criar a disciplina."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-800">{t("Nova disciplina")}</h2>
          <button type="button" onClick={onClose} aria-label={t("Fechar")} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>
        <p className="mb-5 text-sm font-semibold text-slate-500">
          {t("Uma disciplina reúne matérias, como Programação reúne Python e React. Depois de criar, adicione as matérias dela.")}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-3">
            <input
              aria-label={t("Emoji da disciplina")}
              value={emoji}
              onChange={(event) => setEmoji(event.target.value)}
              placeholder="🇫🇷"
              maxLength={4}
              className="w-16 rounded-2xl border-2 border-slate-200 bg-white px-3 py-3 text-center text-xl outline-none focus:border-primary"
            />
            <input
              aria-label={t("Nome da disciplina")}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("Nome da disciplina (ex: Francês)")}
              maxLength={100}
              required
              autoFocus
              className="min-w-0 flex-1 rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 outline-none focus:border-primary"
            />
          </div>
          <input
            aria-label={t("Descrição")}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("Descrição (opcional)")}
            maxLength={500}
            className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 outline-none focus:border-primary"
          />
          {error && <p className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-2xl border-2 border-slate-200 py-3 font-bold text-slate-600 hover:bg-slate-50">
              {t("Cancelar")}
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary-dark py-3 font-black text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : t("Criar disciplina")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
