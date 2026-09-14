'use client';

import { useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';

import { api, type CreateObjectiveItemPayload, type Objective, type ObjectiveArea } from '@/lib/api';
import { OBJECTIVE_AREAS } from './objective-areas';

interface Props {
  onClose: () => void;
  onCreated: (objective: Objective) => void;
}

/**
 * Creating the objective and listing its first study items in one step.
 *
 * Asking for the goal and then sending the person to a second screen to say
 * what it takes is how a goal ends up with no items and a permanent 0%. The
 * list is still optional: items can be added any time from the card.
 */
export function CreateObjectiveModal({ onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [items, setItems] = useState<CreateObjectiveItemPayload[]>([]);
  const [itemTitle, setItemTitle] = useState('');
  const [itemArea, setItemArea] = useState<ObjectiveArea>('free');
  const [itemWeight, setItemWeight] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function addItem() {
    const clean = itemTitle.trim();
    if (!clean) return;
    setItems((previous) => [...previous, { title: clean, area: itemArea, weight: itemWeight }]);
    setItemTitle('');
    setItemWeight(1);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const clean = title.trim();
    if (!clean) return;
    setSaving(true);
    setError('');
    try {
      const objective = await api.createObjective({
        title: clean,
        description: description.trim() || undefined,
        icon_emoji: emoji.trim() || undefined,
        target_date: targetDate || undefined,
        items,
      });
      onCreated(objective);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar o objetivo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-800">Novo objetivo</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-3">
            <input
              aria-label="Emoji do objetivo"
              value={emoji}
              onChange={(event) => setEmoji(event.target.value)}
              placeholder="🎯"
              maxLength={2}
              className="w-16 rounded-2xl border-2 border-slate-200 bg-white px-3 py-3 text-center text-xl outline-none focus:border-primary"
            />
            <input
              aria-label="Título do objetivo"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ex: passar na certificação AWS"
              maxLength={120}
              required
              autoFocus
              className="min-w-0 flex-1 rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 outline-none focus:border-primary"
            />
          </div>

          <textarea
            aria-label="Descrição do objetivo"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Por que este objetivo importa (opcional)"
            maxLength={500}
            rows={2}
            className="w-full resize-y rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 outline-none focus:border-primary"
          />

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Prazo (opcional)</span>
            <input
              type="date"
              value={targetDate}
              onChange={(event) => setTargetDate(event.target.value)}
              className="mt-2 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-primary"
            />
          </label>

          <div className="rounded-2xl border-2 border-slate-200 p-4">
            <p className="text-sm font-bold text-slate-700">O que precisa estudar</p>
            <p className="mt-0.5 text-xs font-medium text-slate-400">
              Cada item concluído aumenta a porcentagem do objetivo. O peso diz o tamanho do item.
            </p>

            {items.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {items.map((item, index) => (
                  <li
                    key={`${item.title}-${index}`}
                    className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{item.title}</span>
                    <span className="text-xs font-bold text-slate-400">peso {item.weight}</span>
                    <button
                      type="button"
                      aria-label={`Remover ${item.title}`}
                      onClick={() => setItems((previous) => previous.filter((_, position) => position !== index))}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                aria-label="Item de estudo"
                value={itemTitle}
                onChange={(event) => setItemTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    // Enter here adds an item; it must not submit the whole form.
                    event.preventDefault();
                    addItem();
                  }
                }}
                placeholder="Ex: terminar o módulo 3"
                maxLength={200}
                className="min-w-0 flex-1 rounded-2xl border-2 border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-primary"
              />
              <select
                aria-label="Área do item"
                value={itemArea}
                onChange={(event) => setItemArea(event.target.value as ObjectiveArea)}
                className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-primary"
              >
                {OBJECTIVE_AREAS.map((area) => (
                  <option key={area.id} value={area.id}>{area.label}</option>
                ))}
              </select>
              <select
                aria-label="Peso do item"
                value={itemWeight}
                onChange={(event) => setItemWeight(Number(event.target.value))}
                className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-primary"
              >
                {[1, 2, 3, 5, 8, 10].map((weight) => (
                  <option key={weight} value={weight}>peso {weight}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={addItem}
                disabled={!itemTitle.trim()}
                className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700 hover:bg-slate-200 disabled:opacity-50"
              >
                <Plus size={16} /> Adicionar
              </button>
            </div>
          </div>

          {error ? (
            <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700">{error}</p>
          ) : null}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 flex-1 rounded-2xl border-2 border-slate-200 py-3 font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary-dark py-3 font-black text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : 'Criar objetivo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
