'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Clock, Code2, Database, Loader2, Sparkles, Terminal, Trash2, Trophy } from 'lucide-react';
import { api, type LeetCodeMethod } from '@/lib/api';
import { SyntaxCodeBlock } from './SyntaxCodeBlock';

interface Props {
  onBack: () => void;
}

const LANGUAGES = ['TypeScript', 'JavaScript', 'Python', 'Java', 'Go'];

// Cor por linguagem (TypeScript é o padrão).
const LANG_META: Record<string, { chip: string; dot: string; bar: string }> = {
  TypeScript: { chip: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500', bar: 'border-l-blue-400' },
  JavaScript: { chip: 'bg-amber-100 text-amber-800', dot: 'bg-amber-400', bar: 'border-l-amber-400' },
  Python: { chip: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', bar: 'border-l-emerald-400' },
  Java: { chip: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500', bar: 'border-l-orange-400' },
  Go: { chip: 'bg-cyan-100 text-cyan-700', dot: 'bg-cyan-500', bar: 'border-l-cyan-400' },
};

const LANG_HEX: Record<string, string> = {
  TypeScript: '#3b82f6',
  JavaScript: '#fbbf24',
  Python: '#10b981',
  Java: '#f97316',
  Go: '#06b6d4',
};

const DEFAULT_LANG_META = { chip: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400', bar: 'border-l-slate-300' };

function langMeta(lang: string) {
  return LANG_META[lang] ?? DEFAULT_LANG_META;
}

export function LeetCodeTrainer({ onBack }: Props) {
  const [methods, setMethods] = useState<LeetCodeMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [hint, setHint] = useState('');
  const [language, setLanguage] = useState('TypeScript');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [registeringActivity, setRegisteringActivity] = useState(false);
  const [activityMessage, setActivityMessage] = useState('');

  useEffect(() => {
    loadMethods();
  }, []);

  async function loadMethods() {
    setLoading(true);
    setError('');
    try {
      setMethods(await api.getLeetCodeMethods());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar os métodos.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setError('');
    try {
      const method = await api.generateLeetCodeMethod({ hint: hint.trim() || undefined, language });
      // Novo método entra minimizado no fim da lista
      setMethods((prev) => [...prev, method]);
      setHint('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar o método com IA.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Remover este método?')) return;
    try {
      await api.deleteLeetCodeMethod(id);
      setMethods((prev) => prev.filter((m) => m.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível remover o método.');
    }
  }

  async function handleRegisterActivity() {
    setRegisteringActivity(true);
    setActivityMessage('');
    try {
      await api.logActivity({
        activity_type: 'leetcode',
        activity_title: 'LeetCode Trainer',
        result_details: {
          total_methods: methods.length,
          languages: Array.from(new Set(methods.map((method) => method.language))),
        },
      });
      setActivityMessage('Atividade registrada no activity-log.');
    } catch {
      setActivityMessage('Não foi possível registrar agora.');
    } finally {
      setRegisteringActivity(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="kid-surface border-amber-300/50 p-6">
        <button type="button" onClick={onBack} className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-primary">
          <ArrowLeft size={16} /> Programação
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100">
            <Trophy size={24} className="text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800">LeetCode Trainer</h1>
            <p className="text-sm text-slate-500">
              Métodos e técnicas para resolver problemas — cada card explica o que é, mostra um exemplo e o resultado.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleRegisterActivity()}
          disabled={registeringActivity}
          className="mt-4 inline-flex items-center gap-2 rounded-2xl border-2 border-amber-200 bg-amber-50 px-4 py-2 text-sm font-black text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
        >
          {registeringActivity ? <Loader2 size={16} className="animate-spin" /> : <Trophy size={16} />}
          Registrar atividade de LeetCode
        </button>
        {activityMessage && <p className="mt-3 text-sm font-bold text-slate-500">{activityMessage}</p>}
      </section>

      {/* Generate next method */}
      <div className="rounded-3xl border-2 border-violet-100 bg-violet-50 p-5">
        <p className="mb-3 text-sm font-black text-violet-800">
          Gerar o próximo método com IA
          <span className="ml-2 font-normal text-violet-500">
            (a IA sabe quais você já tem e escolhe o próximo passo)
          </span>
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            maxLength={120}
            placeholder="Opcional: pedir um método específico (ex: Sliding Window)"
            className="flex-1 rounded-2xl border-2 border-violet-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-violet-400"
          />
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={{ borderLeftColor: LANG_HEX[language] ?? '#c4b5fd', borderLeftWidth: 6 }}
            className="rounded-2xl border-2 border-violet-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-violet-400"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-violet-700 disabled:opacity-50"
          >
            {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {generating ? 'Gerando...' : `Gerar método ${methods.length + 1}`}
          </button>
        </div>
      </div>

      {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p>}

      {/* Methods list (accordion, collapsed by default) */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={32} /></div>
      ) : methods.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white px-6 py-12 text-center">
          <Code2 size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="font-bold text-slate-500">Nenhum método ainda.</p>
          <p className="mt-1 text-sm text-slate-400">Gere o primeiro método com IA — comece por Two Pointers ou Binary Search.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {methods.map((m, idx) => {
            const expanded = expandedId === m.id;
            const meta = langMeta(m.language);
            return (
              <div
                key={m.id}
                style={{ borderLeftColor: LANG_HEX[m.language] ?? '#cbd5e1' }}
                className={`overflow-hidden rounded-3xl border-2 border-l-[6px] bg-white transition ${expanded ? 'border-amber-300' : 'border-slate-100'}`}
              >
                {/* Collapsed header */}
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : m.id)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left"
                >
                  <span className="w-5 shrink-0 text-center text-sm font-bold text-slate-400">{idx + 1}</span>
                  <div className="flex-1">
                    <p className="font-black text-slate-800">{m.name}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                      {m.category && <span className="rounded-full bg-sky-100 px-2 py-0.5 font-bold text-sky-700">{m.category}</span>}
                      <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-bold ${meta.chip}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} /> {m.language}
                      </span>
                      {m.complexity_time && (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">
                          <Clock size={10} /> {m.complexity_time}
                        </span>
                      )}
                      {m.complexity_space && (
                        <span className="flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 font-bold text-violet-700">
                          <Database size={10} /> {m.complexity_space}
                        </span>
                      )}
                    </div>
                  </div>
                  {expanded ? <ChevronUp size={18} className="shrink-0 text-slate-400" /> : <ChevronDown size={18} className="shrink-0 text-slate-400" />}
                </button>

                {/* Expanded content */}
                {expanded && (
                  <div className="space-y-4 border-t-2 border-slate-100 px-5 py-5">
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">O que é e quando usar</p>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{m.explanation}</p>
                    </div>

                    {m.code_example && (
                      <div>
                        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-slate-400">
                          <Code2 size={12} /> Exemplo ({m.language})
                        </p>
                        <SyntaxCodeBlock code={m.code_example} language={m.language} />
                      </div>
                    )}

                    {m.example_output && (
                      <div>
                        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-slate-400">
                          <Terminal size={12} /> Resultado do exemplo
                        </p>
                        <pre className="leetcode-result-output">
                          {m.example_output}
                        </pre>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleDelete(m.id)}
                        className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                      >
                        <Trash2 size={13} /> Remover método
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
