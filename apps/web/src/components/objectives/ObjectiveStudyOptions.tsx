'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type ObjectiveStudyOptions } from '@/lib/api';
import { t } from '@/lib/i18n';

interface OptionsState {
  options: ObjectiveStudyOptions | null;
  loading: boolean;
  error: string;
  reload: () => void;
}

const Context = createContext<OptionsState>({ options: null, loading: true, error: '', reload: () => {} });

/** The board shares one options request across every objective and its dialogs. */
export function ObjectiveStudyOptionsProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ObjectiveStudyOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.getObjectiveStudyOptions().then((data) => {
      if (active) setOptions(data);
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : t('Não foi possível carregar disciplinas e tópicos.'));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);
  return <Context.Provider value={{ options, loading, error, reload: () => setRevision((n) => n + 1) }}>{children}</Context.Provider>;
}

export function useObjectiveStudyOptions(): OptionsState { return useContext(Context); }
