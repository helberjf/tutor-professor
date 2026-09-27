'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  FileCheck2,
  FileText,
  GraduationCap,
  Loader2,
  NotebookPen,
  Pencil,
  RefreshCw,
  Sparkles,
  StickyNote,
  Trash2,
} from 'lucide-react';

import {
  STUDY_LOG_LIMITS,
  type StudyLogEntry,
  type StudyLogEntryItem,
  type StudyLogOptions,
  type UpdateStudyLogPayload,
} from '@/lib/api';
import { t, tf } from '@/lib/i18n';

import { formatMinutes, nameKey } from './study-log-helpers';

// The sheet renderer brings the syntax highlighter along. It is only needed once
// an entry is opened, so it stays out of the page's first download.
const DeepeningMarkdown = dynamic(
  () => import('@/components/coding/DeepeningMarkdown').then((module) => module.DeepeningMarkdown),
  {
    ssr: false,
    loading: () => <Loader2 className="animate-spin text-slate-400" size={18} />,
  },
);

export type EntryBusy = 'summary' | 'saving' | 'deleting';

const inputClass =
  'min-h-11 w-full min-w-0 rounded-2xl border-2 border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-primary';
const actionClass =
  'inline-flex min-h-11 items-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-50';

function formatDay(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}

function SourceChip({ item }: { item: StudyLogEntryItem }) {
  if (item.source === 'file') {
    return (
      <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-sky-700">
        <FileText size={12} />
        <span className="truncate">{item.source_filename || t("Arquivo")}</span>
      </span>
    );
  }
  if (item.source === 'topic') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-violet-700">
        <GraduationCap size={12} /> {t("Tópico estudado")}
      </span>
    );
  }
  if (item.source === 'lesson') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">
        <BookOpen size={12} /> {t("Lição concluída")}
      </span>
    );
  }
  if (item.source === 'day_note') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">
        <StickyNote size={12} /> {t("Anotação antiga")}
      </span>
    );
  }
  return null;
}

function EntryEditor({
  detail,
  options,
  today,
  saving,
  onCancel,
  onSave,
}: {
  detail: StudyLogEntry;
  options: StudyLogOptions | null;
  today: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (payload: UpdateStudyLogPayload) => void;
}) {
  const fieldId = useId();
  const [title, setTitle] = useState(detail.title_is_auto ? '' : detail.title);
  const [discipline, setDiscipline] = useState(detail.discipline);
  const [subject, setSubject] = useState(detail.subject ?? '');
  const [minutes, setMinutes] = useState(detail.duration_minutes ? String(detail.duration_minutes) : '');
  const [studiedOn, setStudiedOn] = useState(detail.studied_on);
  const [content, setContent] = useState(detail.content ?? '');
  const [error, setError] = useState('');
  const disciplineOptions = useMemo(() => options?.disciplines ?? [], [options]);
  const subjectOptions = useMemo(() => {
    const key = nameKey(discipline);
    return disciplineOptions.find((option) => nameKey(option.name) === key)?.subjects ?? [];
  }, [discipline, disciplineOptions]);

  function submit() {
    setError('');
    if (!discipline.trim()) {
      setError(t("Escolha a disciplina do que você estudou."));
      return;
    }
    const duration = minutes.trim() ? Number(minutes) : 0;
    if (minutes.trim() && (!Number.isInteger(duration) || duration < 1 || duration > STUDY_LOG_LIMITS.minutes)) {
      setError(tf("Informe o tempo em minutos, de 1 a {max}.", { max: STUDY_LOG_LIMITS.minutes }));
      return;
    }
    // Only what changed goes out: an untouched blank title must not replace the
    // one the AI wrote, and an untouched subject stays the AI's to change.
    const payload: UpdateStudyLogPayload = {};
    if (title.trim() !== (detail.title_is_auto ? '' : detail.title)) payload.title = title.trim();
    if (discipline.trim() !== detail.discipline) payload.discipline = discipline.trim();
    if (subject.trim() !== (detail.subject ?? '')) payload.subject = subject.trim();
    if (duration !== (detail.duration_minutes ?? 0)) payload.duration_minutes = duration;
    if (studiedOn !== detail.studied_on) payload.studied_on = studiedOn;
    if (content !== (detail.content ?? '')) payload.content = content;
    if (Object.keys(payload).length === 0) {
      onCancel();
      return;
    }
    onSave(payload);
  }

  return (
    <div className="mt-4 rounded-2xl border-2 border-slate-100 bg-slate-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block min-w-0 sm:col-span-2">
          <span className="text-xs font-black text-slate-600">{t("Título")}</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={STUDY_LOG_LIMITS.title}
            placeholder={detail.title_is_auto ? detail.title : t("Opcional")}
            className={`mt-1.5 ${inputClass}`}
          />
        </label>
        <label className="block min-w-0">
          <span className="text-xs font-black text-slate-600">{t("Disciplina")} *</span>
          <input
            value={discipline}
            onChange={(event) => setDiscipline(event.target.value)}
            list={`${fieldId}-disciplines`}
            maxLength={STUDY_LOG_LIMITS.discipline}
            className={`mt-1.5 ${inputClass}`}
            autoComplete="off"
          />
          <datalist id={`${fieldId}-disciplines`}>
            {disciplineOptions.map((option) => (
              <option key={option.name} value={option.name} />
            ))}
          </datalist>
        </label>
        <label className="block min-w-0">
          <span className="text-xs font-black text-slate-600">{t("Matéria")}</span>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            list={`${fieldId}-subjects`}
            maxLength={STUDY_LOG_LIMITS.subject}
            placeholder={t("Em branco: a IA escolhe")}
            className={`mt-1.5 ${inputClass}`}
            autoComplete="off"
          />
          <datalist id={`${fieldId}-subjects`}>
            {subjectOptions.map((option) => (
              <option key={option.name} value={option.name} />
            ))}
          </datalist>
        </label>
        <label className="block min-w-0">
          <span className="text-xs font-black text-slate-600">{t("Tempo (minutos)")}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={STUDY_LOG_LIMITS.minutes}
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            className={`mt-1.5 ${inputClass}`}
          />
        </label>
        <label className="block min-w-0">
          <span className="text-xs font-black text-slate-600">{t("Data do estudo")}</span>
          <input
            type="date"
            value={studiedOn}
            max={today}
            onChange={(event) => setStudiedOn(event.target.value)}
            className={`mt-1.5 ${inputClass}`}
          />
        </label>
        <label className="block min-w-0 sm:col-span-2">
          <span className="text-xs font-black text-slate-600">{t("Texto do que estudou")}</span>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={6}
            maxLength={STUDY_LOG_LIMITS.content}
            className="mt-1.5 w-full resize-y rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 outline-none transition focus:border-primary"
          />
        </label>
      </div>
      {error ? <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-primary-dark px-4 text-sm font-black text-white transition hover:bg-primary"
        >
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
          {t("Salvar alterações")}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className={actionClass}>
          {t("Cancelar")}
        </button>
      </div>
    </div>
  );
}

function SheetEditor({
  initial,
  saving,
  onCancel,
  onSave,
}: {
  initial: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div>
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={14}
        maxLength={STUDY_LOG_LIMITS.summary}
        aria-label={t("Editar ficha")}
        className="w-full resize-y rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 font-mono text-sm leading-6 text-slate-700 outline-none transition focus:border-primary"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSave(value)}
          disabled={saving || !value.trim()}
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-primary-dark px-4 text-sm font-black text-white transition hover:bg-primary"
        >
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
          {t("Salvar ficha")}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className={actionClass}>
          {t("Cancelar")}
        </button>
      </div>
    </div>
  );
}

export function StudyLogEntryCard({
  item,
  detail,
  options,
  today,
  showDate,
  open,
  busy,
  error,
  onToggle,
  onGenerateSheet,
  onSave,
  onDelete,
}: {
  item: StudyLogEntryItem;
  detail: StudyLogEntry | undefined;
  options: StudyLogOptions | null;
  today: string;
  showDate: boolean;
  open: boolean;
  busy: EntryBusy | undefined;
  error: string | undefined;
  onToggle: (open: boolean) => void;
  onGenerateSheet: (regenerate: boolean) => void;
  onSave: (payload: UpdateStudyLogPayload) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editingSheet, setEditingSheet] = useState(false);
  const [copied, setCopied] = useState(false);
  // Optimistic while the options are unknown: the request itself says if a key is missing.
  const aiAvailable = options ? options.ai_available : true;

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copySheet() {
    if (!detail?.summary) return;
    try {
      await navigator.clipboard.writeText(`# ${detail.title}\n\n${detail.summary}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function saveEntry(payload: UpdateStudyLogPayload) {
    if (await onSave(payload)) setEditing(false);
  }

  async function saveSheet(value: string) {
    if (await onSave({ summary: value })) setEditingSheet(false);
  }

  const generating = busy === 'summary';

  return (
    <details
      open={open}
      onToggle={(event) => onToggle(event.currentTarget.open)}
      className="group rounded-[1.25rem] border-2 border-slate-100 bg-white transition open:border-primary/40"
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <ChevronRight size={18} className="mt-1 shrink-0 text-slate-400 transition group-open:rotate-90" />
        <span className="min-w-0 flex-1">
          <span className="block break-words font-black leading-snug text-slate-800">{item.title}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs font-bold">
            <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
              <span className="truncate">
                {item.discipline}
                {item.subject ? ` › ${item.subject}` : ''}
              </span>
              {item.subject && item.subject_is_auto ? (
                <Sparkles size={12} className="shrink-0 text-violet-600" aria-label={t("matéria escolhida pela IA")} />
              ) : null}
            </span>
            {item.duration_minutes ? (
              <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">{formatMinutes(item.duration_minutes)}</span>
            ) : null}
            <SourceChip item={item} />
            {showDate ? <span className="px-1 text-slate-400">{formatDay(item.studied_on)}</span> : null}
          </span>
        </span>
        {generating ? (
          <Loader2 size={18} className="mt-1 shrink-0 animate-spin text-violet-600" aria-label={t("Escrevendo a ficha…")} />
        ) : item.has_summary ? (
          <FileCheck2 size={18} className="mt-1 shrink-0 text-emerald-600" aria-label={t("Ficha pronta")} />
        ) : null}
      </summary>

      <div className="border-t-2 border-slate-100 px-4 pb-4 pt-3">
        {error ? <p className="mb-3 rounded-2xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p> : null}
        {!detail ? (
          <p className="flex items-center gap-2 py-3 text-sm font-bold text-slate-500">
            <Loader2 className="animate-spin" size={16} /> {t("Abrindo registro…")}
          </p>
        ) : (
          <>
            <section className="rounded-2xl bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                  <NotebookPen size={14} /> {t("Ficha")}
                </p>
                {detail.summary && !editingSheet && !generating ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void copySheet()} className={actionClass}>
                      {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? t("Copiado") : t("Copiar")}
                    </button>
                    <button type="button" onClick={() => setEditingSheet(true)} className={actionClass}>
                      <Pencil size={14} /> {t("Editar ficha")}
                    </button>
                    <button
                      type="button"
                      onClick={() => onGenerateSheet(true)}
                      disabled={!aiAvailable || !detail.can_summarize}
                      className={actionClass}
                    >
                      <RefreshCw size={14} /> {t("Refazer ficha")}
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="mt-3">
                {generating ? (
                  <p className="flex items-center gap-2 text-sm font-bold text-violet-700">
                    <Loader2 className="animate-spin" size={16} /> {t("Escrevendo a ficha…")}
                  </p>
                ) : detail.summary ? (
                  editingSheet ? (
                    <SheetEditor
                      initial={detail.summary}
                      saving={busy === 'saving'}
                      onCancel={() => setEditingSheet(false)}
                      onSave={(value) => void saveSheet(value)}
                    />
                  ) : (
                    <div className="text-[0.95rem]">
                      <DeepeningMarkdown content={detail.summary} />
                    </div>
                  )
                ) : detail.can_summarize ? (
                  aiAvailable ? (
                    <button
                      type="button"
                      onClick={() => onGenerateSheet(false)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-black text-white transition hover:bg-violet-700"
                    >
                      <Sparkles size={16} /> {t("Gerar ficha com IA")}
                    </button>
                  ) : (
                    <p className="text-sm font-semibold text-slate-500">
                      {t("Configure uma chave de IA na Área da conta para gerar a ficha.")}
                    </p>
                  )
                ) : (
                  <p className="text-sm font-semibold text-slate-500">
                    {t("Ainda não há texto para gerar a ficha. Edite o registro e cole o que estudou.")}
                  </p>
                )}
              </div>
            </section>

            {detail.content ? (
              <details className="mt-3 rounded-2xl border-2 border-slate-100">
                <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 text-sm font-black text-slate-700">
                  <FileText size={15} /> {t("Texto original")}
                </summary>
                <p className="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t-2 border-slate-100 px-4 py-3 text-sm leading-6 text-slate-600">
                  {detail.content}
                </p>
              </details>
            ) : null}

            {editing ? (
              <EntryEditor
                detail={detail}
                options={options}
                today={today}
                saving={busy === 'saving'}
                onCancel={() => setEditing(false)}
                onSave={(payload) => void saveEntry(payload)}
              />
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {detail.open_href ? (
                  <Link href={detail.open_href} className={actionClass}>
                    <ExternalLink size={14} /> {detail.source === 'lesson' ? t("Abrir lição") : t("Abrir aula")}
                  </Link>
                ) : null}
                <button type="button" onClick={() => setEditing(true)} className={actionClass}>
                  <Pencil size={14} /> {t("Editar registro")}
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={busy === 'deleting'}
                  className={`${actionClass} hover:border-rose-300 hover:text-rose-700`}
                >
                  {busy === 'deleting' ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                  {t("Excluir")}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}
