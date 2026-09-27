'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { FileText, Loader2, Paperclip, Save, Timer, X } from 'lucide-react';

import { ApiError, api, STUDY_LOG_LIMITS, type StudyLogEntry, type StudyLogOptions } from '@/lib/api';
import { t, tf } from '@/lib/i18n';
import { FOCUS_SECONDS, getTodaysPomodoroCount, parseStoredPomodoroState, POMODORO_STORAGE_KEY } from '@/lib/pomodoro';
import { readStudyFile, STUDY_FILE_ACCEPT, StudyFileError } from '@/lib/study-log-import';

import { nameKey } from './study-log-helpers';

const LAST_DISCIPLINE_KEY = 'english-kids-tutor:study-log:last-discipline';

function readLastDiscipline(): string {
  try {
    return window.localStorage.getItem(LAST_DISCIPLINE_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberDiscipline(value: string) {
  try {
    window.localStorage.setItem(LAST_DISCIPLINE_KEY, value);
  } catch {
    // A private window without storage just starts blank next time.
  }
}

function todaysPomodoroMinutes(): number {
  try {
    const state = parseStoredPomodoroState(window.localStorage.getItem(POMODORO_STORAGE_KEY));
    return getTodaysPomodoroCount(state) * Math.round(FOCUS_SECONDS / 60);
  } catch {
    return 0;
  }
}

const inputClass =
  'min-h-12 w-full min-w-0 rounded-2xl border-2 border-slate-200 bg-white px-4 text-base text-slate-700 outline-none transition focus:border-primary';

export function StudyLogComposer({
  options,
  today,
  defaultDate,
  onCreated,
}: {
  options: StudyLogOptions | null;
  today: string;
  defaultDate: string;
  onCreated: (entry: StudyLogEntry) => void;
}) {
  const fieldId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [discipline, setDiscipline] = useState('');
  const [subject, setSubject] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [filename, setFilename] = useState('');
  const [minutes, setMinutes] = useState('');
  const [studiedOn, setStudiedOn] = useState(defaultDate);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pomodoroMinutes, setPomodoroMinutes] = useState(0);

  useEffect(() => {
    setDiscipline((current) => current || readLastDiscipline());
    setPomodoroMinutes(todaysPomodoroMinutes());
  }, []);

  useEffect(() => {
    setStudiedOn(defaultDate);
  }, [defaultDate]);

  // Unknown until the options arrive: nothing is claimed about the AI before that.
  const aiKnown = options !== null;
  const aiAvailable = options?.ai_available ?? false;
  const disciplineOptions = useMemo(() => options?.disciplines ?? [], [options]);
  const subjectOptions = useMemo(() => {
    const key = nameKey(discipline);
    if (!key) return [];
    return disciplineOptions.find((option) => nameKey(option.name) === key)?.subjects ?? [];
  }, [discipline, disciplineOptions]);

  async function attachFile(file: File | undefined) {
    if (!file) return;
    setReading(true);
    setError('');
    setNotice('');
    try {
      const read = await readStudyFile(file);
      setContent((current) => (current.trim() ? `${current.trimEnd()}\n\n${read.text}` : read.text).slice(0, STUDY_LOG_LIMITS.content));
      setFilename(read.filename);
      if (read.truncated) setNotice(t("O arquivo era maior do que um registro comporta; ficou só o começo."));
    } catch (err) {
      setError(err instanceof StudyFileError ? t(err.message) : t("Não consegui ler o arquivo. Cole o texto na caixa."));
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function save() {
    setError('');
    setNotice('');
    const chosenDiscipline = discipline.trim();
    const text = content.trim();
    const duration = minutes.trim() ? Number(minutes) : 0;
    if (!chosenDiscipline) {
      setError(t("Escolha a disciplina do que você estudou."));
      return;
    }
    if (minutes.trim() && (!Number.isInteger(duration) || duration < 1 || duration > STUDY_LOG_LIMITS.minutes)) {
      setError(tf("Informe o tempo em minutos, de 1 a {max}.", { max: STUDY_LOG_LIMITS.minutes }));
      return;
    }
    if (!text && !duration) {
      setError(t("Cole o que estudou ou informe quanto tempo estudou."));
      return;
    }
    setSaving(true);
    try {
      const entry = await api.createStudyLogEntry({
        discipline: chosenDiscipline,
        subject: subject.trim() || null,
        title: title.trim() || null,
        content: text || null,
        source_filename: text && filename ? filename : null,
        duration_minutes: duration || null,
        studied_on: studiedOn || null,
      });
      rememberDiscipline(entry.discipline);
      setDiscipline(entry.discipline);
      setSubject('');
      setTitle('');
      setContent('');
      setFilename('');
      setMinutes('');
      onCreated(entry);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Não foi possível salvar o registro."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="app-surface border-sky-100 p-5 md:p-7" aria-labelledby={`${fieldId}-heading`}>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{t("Novo registro")}</p>
      <h2 id={`${fieldId}-heading`} className="mt-1.5 text-2xl font-black text-slate-800">{t("O que você estudou?")}</h2>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="text-sm font-black text-slate-700">{t("Disciplina")} *</span>
          <input
            value={discipline}
            onChange={(event) => setDiscipline(event.target.value)}
            list={`${fieldId}-disciplines`}
            maxLength={STUDY_LOG_LIMITS.discipline}
            placeholder={t("Ex.: Direito, Programação")}
            className={`mt-2 ${inputClass}`}
            autoComplete="off"
          />
          <datalist id={`${fieldId}-disciplines`}>
            {disciplineOptions.map((option) => (
              <option key={option.name} value={option.name} />
            ))}
          </datalist>
        </label>
        <label className="block min-w-0">
          <span className="text-sm font-black text-slate-700">{t("Matéria")}</span>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            list={`${fieldId}-subjects`}
            maxLength={STUDY_LOG_LIMITS.subject}
            disabled={!discipline.trim()}
            placeholder={aiAvailable ? t("Em branco: a IA escolhe") : t("Opcional")}
            className={`mt-2 ${inputClass} disabled:bg-slate-50 disabled:text-slate-400`}
            autoComplete="off"
          />
          <datalist id={`${fieldId}-subjects`}>
            {subjectOptions.map((option) => (
              <option key={option.name} value={option.name} />
            ))}
          </datalist>
        </label>
      </div>

      <label className="mt-4 block">
        <span className="text-sm font-black text-slate-700">{t("Título")}</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={STUDY_LOG_LIMITS.title}
          placeholder={aiAvailable ? t("Em branco: a IA sugere um título") : t("Opcional")}
          className={`mt-2 ${inputClass}`}
        />
      </label>

      <div className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={`${fieldId}-content`} className="text-sm font-black text-slate-700">
            {t("Texto do que estudou")}
          </label>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={reading}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-primary disabled:opacity-60"
          >
            {reading ? <Loader2 className="animate-spin" size={16} /> : <Paperclip size={16} />}
            {t("Anexar .md, .txt ou .docx")}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={STUDY_FILE_ACCEPT}
            className="hidden"
            onChange={(event) => void attachFile(event.target.files?.[0])}
          />
        </div>
        <textarea
          id={`${fieldId}-content`}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={7}
          maxLength={STUDY_LOG_LIMITS.content}
          placeholder={t("Cole aqui o que você leu ou anotou — ou deixe em branco e informe só o tempo.")}
          className="mt-2 w-full resize-y rounded-[1.25rem] border-2 border-slate-200 bg-white px-4 py-3 text-base leading-7 text-slate-700 outline-none transition focus:border-primary"
        />
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-400">
          {filename ? (
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-sky-700">
              <FileText size={13} />
              <span className="truncate">{filename}</span>
              <button
                type="button"
                onClick={() => setFilename('')}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-white/70"
                aria-label={t("Esquecer o nome do arquivo")}
              >
                <X size={12} />
              </button>
            </span>
          ) : (
            <span />
          )}
          <span className="tabular-nums">
            {content.length.toLocaleString('pt-BR')} / {STUDY_LOG_LIMITS.content.toLocaleString('pt-BR')}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="text-sm font-black text-slate-700">{t("Tempo (minutos)")}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={STUDY_LOG_LIMITS.minutes}
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            placeholder="40"
            className={`mt-2 ${inputClass}`}
          />
          {pomodoroMinutes > 0 && studiedOn === today ? (
            <button
              type="button"
              onClick={() => setMinutes(String(pomodoroMinutes))}
              className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-rose-50 px-3 text-xs font-black text-rose-700 transition hover:bg-rose-100"
            >
              <Timer size={14} />
              {tf("Usar os pomodoros de hoje ({minutes} min)", { minutes: pomodoroMinutes })}
            </button>
          ) : null}
        </label>
        <label className="block min-w-0">
          <span className="text-sm font-black text-slate-700">{t("Data do estudo")}</span>
          <input
            type="date"
            value={studiedOn}
            max={today}
            onChange={(event) => setStudiedOn(event.target.value)}
            className={`mt-2 ${inputClass}`}
          />
        </label>
      </div>

      {notice ? <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">{notice}</p> : null}
      {error ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p> : null}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || reading}
        className="app-button mt-5 w-full gap-2 bg-primary-dark hover:bg-primary-dark"
      >
        {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
        {t("Salvar registro")}
      </button>
      <p className="mt-3 text-center text-xs font-semibold leading-5 text-slate-500">
        {!aiKnown ? null : aiAvailable ? (
          t("Ao salvar, a IA escreve a ficha para você revisar e conseguir ensinar a alguém.")
        ) : (
          <>
            {t("Sem uma chave de IA, o registro é salvo sem ficha.")}{' '}
            <Link href="/account" className="font-black text-primary-dark underline-offset-2 hover:underline">
              {t("Configurar a IA")}
            </Link>
          </>
        )}
      </p>
    </section>
  );
}
