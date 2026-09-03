'use client';

import { useEffect, useState } from 'react';
import { Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import { ApiError, api, type ModuleInfo } from '@/lib/api';

/**
 * Switches for the optional parts of the product.
 *
 * The programming curriculum ships off: most families come for the language
 * tutor, and showing both at once makes the app harder to explain than it is.
 * Whoever wants it turns it on here.
 */
export function AccountModulesSection() {
  const [modules, setModules] = useState<ModuleInfo[] | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.getAccountModules()
      .then((result) => {
        if (!cancelled) setModules(result.modules);
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(cause instanceof ApiError ? cause.message : 'Nao foi possivel carregar os modulos.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(module: ModuleInfo) {
    if (module.locked || savingId) return;
    setSavingId(module.id);
    setError('');
    setSaved('');
    try {
      const result = await api.updateAccountModules({ [module.id]: !module.enabled });
      setModules(result.modules);
      setSaved(
        !module.enabled
          ? `${module.label} ativado. O menu ja mostra a nova secao.`
          : `${module.label} desativado. Seus dados continuam salvos.`,
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Nao foi possivel salvar a mudanca.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="kid-surface mb-6 border-indigo-200 p-5 md:p-8">
      <div className="flex items-center gap-3">
        <ToggleRight className="text-indigo-600" size={28} />
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-400">Personalizar</p>
          <h2 className="text-2xl font-black text-slate-800 md:text-3xl">Modulos do app</h2>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-500">
        Ative apenas o que sua familia usa. Desligar um modulo esconde a secao do
        menu — nada e apagado, e voce pode ligar de novo quando quiser.
      </p>

      {error ? (
        <p className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</p>
      ) : null}
      {saved ? (
        <p className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{saved}</p>
      ) : null}

      {modules === null ? (
        <div className="mt-6 flex items-center justify-center rounded-2xl border-2 border-slate-100 bg-white p-8">
          <Loader2 className="animate-spin text-primary" size={24} />
        </div>
      ) : (
        <ul className="mt-6 grid gap-3">
          {modules.map((module) => {
            const Icon = module.enabled ? ToggleRight : ToggleLeft;
            return (
              <li
                key={module.id}
                className="flex items-center justify-between gap-4 rounded-[1.25rem] border-2 border-slate-100 bg-white p-4"
              >
                <div className="min-w-0">
                  <p className="text-lg font-black text-slate-800">{module.label}</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-500">{module.description}</p>
                  {module.locked ? (
                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                      Sempre ativo
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => void toggle(module)}
                  disabled={module.locked || savingId !== null}
                  aria-pressed={module.enabled}
                  aria-label={`${module.enabled ? 'Desativar' : 'Ativar'} ${module.label}`}
                  className={`inline-flex min-h-12 shrink-0 items-center gap-2 rounded-2xl px-4 text-sm font-black transition ${
                    module.locked
                      ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                      : module.enabled
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'border-2 border-slate-200 bg-white text-slate-600 hover:border-primary hover:text-primary'
                  }`}
                >
                  {savingId === module.id ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <Icon size={18} />
                  )}
                  {module.enabled ? 'Ativo' : 'Desligado'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
