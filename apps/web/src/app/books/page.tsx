'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Sparkles,
  Users,
  Volume2,
  X,
} from 'lucide-react';

import { StatusCard } from '@/components/status-card';
import {
  ApiError,
  api,
  type Book,
  type BookOutline,
  type BookPage,
  type BookSummary,
} from '@/lib/api';
import { playAudioWithFallback } from '@/lib/browser-speech';
import { useRequireAuth } from '@/hooks/use-require-auth';

// ── Language metadata ─────────────────────────────────────────────────────────
const LANGUAGE_META: Record<string, { flag: string; label: string; ttsCode: string }> = {
  English:  { flag: '🇺🇸', label: 'English',  ttsCode: 'en' },
  French:   { flag: '🇫🇷', label: 'Français', ttsCode: 'fr' },
  Spanish:  { flag: '🇪🇸', label: 'Español', ttsCode: 'es' },
  German:   { flag: '🇩🇪', label: 'Deutsch',  ttsCode: 'de' },
  Italian:  { flag: '🇮🇹', label: 'Italiano', ttsCode: 'it' },
  Japanese: { flag: '🇯🇵', label: '日本語',  ttsCode: 'ja' },
};

const LEVEL_CACHE_KEY = 'child_level_cache';

function getLangMeta(lang: string) {
  return LANGUAGE_META[lang] ?? { flag: '🇺🇸', label: lang, ttsCode: 'en' };
}

const LEVEL_LABELS: Record<number, string> = {
  1: 'Iniciante', 2: 'Iniciante', 3: 'Basico', 4: 'Basico',
  5: 'Intermediario', 6: 'Intermediario', 7: 'Avancado', 8: 'Avancado',
  9: 'Expert', 10: 'Expert',
};

function levelLabel(level: number) {
  return LEVEL_LABELS[level] ?? 'Iniciante';
}

function levelColor(level: number): string {
  if (level <= 2) return 'bg-emerald-100 text-emerald-700';
  if (level <= 4) return 'bg-sky-100 text-sky-700';
  if (level <= 6) return 'bg-violet-100 text-violet-700';
  if (level <= 8) return 'bg-orange-100 text-orange-700';
  return 'bg-rose-100 text-rose-700';
}

// ── Kids book SVG logo ────────────────────────────────────────────────────────
function KidsBookLogo({ size = 64 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="8" y="14" width="64" height="52" rx="6" fill="#38bdf8" />
      <rect x="8" y="14" width="12" height="52" rx="4" fill="#0284c7" />
      <rect x="22" y="22" width="42" height="36" rx="3" fill="white" opacity="0.9" />
      <rect x="28" y="30" width="28" height="3" rx="1.5" fill="#bae6fd" />
      <rect x="28" y="37" width="22" height="3" rx="1.5" fill="#bae6fd" />
      <rect x="28" y="44" width="25" height="3" rx="1.5" fill="#bae6fd" />
      <circle cx="58" cy="16" r="7" fill="#fbbf24" />
      <text x="58" y="20" textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">★</text>
      <circle cx="16" cy="62" r="5" fill="#f472b6" />
      <text x="16" y="66" textAnchor="middle" fontSize="7" fill="white" fontWeight="bold">♥</text>
    </svg>
  );
}

export default function BooksPage() {
  return (
    <Suspense
      fallback={
        <StatusCard
          tone="loading"
          title="Carregando livros"
          message="Buscando seus livros..."
          secondaryHref="/"
          secondaryLabel="Voltar ao inicio"
        />
      }
    >
      <BooksPageContent />
    </Suspense>
  );
}

// ── Generate form (multi-step) ────────────────────────────────────────────────
type FormStep =
  | 'form'
  | 'generating-outline'
  | 'outline'
  | 'starting'
  | 'generating-pages'
  | 'complete';

interface GenerateFormProps {
  onClose: () => void;
  onBookComplete: (book: Book) => void;
  targetLanguage: string;
}

function GenerateForm({ onClose, onBookComplete, targetLanguage }: GenerateFormProps) {
  const [level, setLevel] = useState(0);
  const [numPages, setNumPages] = useState(5);
  const [bookContext, setBookContext] = useState('');

  const [step, setStep] = useState<FormStep>('form');
  const [error, setError] = useState<string | null>(null);
  const [outline, setOutline] = useState<BookOutline | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [pages, setPages] = useState<BookPage[]>([]);
  const [isGeneratingPage, setIsGeneratingPage] = useState(false);
  const [completeBook, setCompleteBook] = useState<Book | null>(null);

  const isBusy = step === 'generating-outline' || step === 'starting' || isGeneratingPage;

  async function handleCreateOutline(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!bookContext.trim()) {
      setError('Conte o contexto do livro antes de gerar.');
      return;
    }
    setStep('generating-outline');
    try {
      const result = await api.generateBookOutline({
        level: level || 0,
        num_pages: numPages,
        theme: bookContext.trim(),
      });
      setOutline(result);
      setStep('outline');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao gerar roteiro.');
      setStep('form');
    }
  }

  async function handleStartBook() {
    if (!outline) return;
    setError(null);
    setStep('starting');
    try {
      const result = await api.startBook({
        title: outline.title,
        theme: outline.theme,
        level: outline.level,
        num_pages: outline.num_pages,
        target_language: targetLanguage,
      });
      setBook(result);
      setPages([]);
      setStep('generating-pages');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao iniciar livro.');
      setStep('outline');
    }
  }

  async function handleGeneratePage() {
    if (!book || !outline) return;
    const nextPageNum = pages.length + 1;
    setIsGeneratingPage(true);
    setError(null);
    try {
      const page = await api.generateBookPage(book.id, {
        outline,
        page_number: nextPageNum,
        context_pages: pages.map((p) => ({
          page_number: p.page_number,
          text_en: p.text_en,
          text_pt: p.text_pt,
          vocabulary: p.vocabulary,
        })),
      });
      const newPages = [...pages, page];
      setPages(newPages);
      if (newPages.length >= outline.num_pages) {
        const done: Book = { ...book, pages: newPages };
        setCompleteBook(done);
        setStep('complete');
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : `Erro ao gerar pagina ${nextPageNum}.`,
      );
    } finally {
      setIsGeneratingPage(false);
    }
  }

  function stepTitle() {
    switch (step) {
      case 'form': return 'Gerar com IA';
      case 'generating-outline': return 'Criando roteiro';
      case 'outline': return 'Roteiro do livro';
      case 'starting': return 'Preparando';
      case 'generating-pages': return 'Gerando paginas';
      case 'complete': return 'Livro pronto!';
    }
  }

  function stepSubtitle() {
    switch (step) {
      case 'form': return 'Novo livro';
      case 'generating-outline': return 'Aguarde...';
      case 'outline': return 'Revise antes de criar';
      case 'starting': return 'Aguarde...';
      case 'generating-pages':
        return outline ? `${pages.length}/${outline.num_pages} paginas` : '';
      case 'complete': return 'Parabens!';
    }
  }

  function renderContent() {
    switch (step) {
      case 'form':
        return (
          <form onSubmit={(e) => void handleCreateOutline(e)} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-black text-slate-700">
                Dificuldade
                <span className="ml-2 font-normal text-slate-400">
                  {level === 0
                    ? '— Automatica (usa seu nivel)'
                    : `— Nivel ${level}: ${levelLabel(level)}`}
                </span>
              </label>
              <input
                type="range" min={0} max={10} value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-primary"
              />
              <div className="mt-1 flex justify-between text-xs text-slate-400">
                <span>Auto</span>
                <span>Iniciante</span>
                <span>Intermediario</span>
                <span>Expert</span>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-slate-700">
                Paginas: <span className="font-normal text-slate-500">{numPages}</span>
              </label>
              <input
                type="range" min={1} max={5} value={numPages}
                onChange={(e) => setNumPages(Number(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-primary"
              />
              <div className="mt-1 flex justify-between text-xs text-slate-400">
                <span>1</span><span>5</span>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-slate-700">
                Contexto do livro
              </label>
              <textarea
                placeholder="ex: Um menino que encontra um mapa no quintal e aprende palavras sobre natureza..."
                value={bookContext}
                onChange={(e) => setBookContext(e.target.value)}
                maxLength={300}
                rows={4}
                className="w-full resize-none rounded-2xl border-2 border-slate-200 px-4 py-3 text-sm font-medium leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-primary"
              />
              <p className="mt-1 text-xs font-semibold text-slate-400">
                A IA usa esse contexto para planejar o livro e depois cria uma pagina por vez.
              </p>
            </div>

            {error && (
              <p className="rounded-xl bg-pink-50 px-4 py-3 text-sm font-medium text-kid-pink">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!bookContext.trim()}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-primary py-4 text-base font-black text-white shadow-[0_8px_24px_rgba(14,165,233,0.3)] transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles size={20} />
              Criar roteiro com IA
            </button>
          </form>
        );

      case 'generating-outline':
        return (
          <div className="flex flex-col items-center gap-5 py-10">
            <Loader2 size={44} className="animate-spin text-primary" />
            <div className="text-center">
              <p className="text-base font-black text-slate-800">Criando roteiro...</p>
              <p className="mt-1 text-sm text-slate-500">
                A IA esta planejando o titulo, personagens e cada cena
              </p>
            </div>
          </div>
        );

      case 'outline': {
        if (!outline) return null;
        return (
          <div className="space-y-5">
            <div className="rounded-2xl border-2 border-sky-100 bg-sky-50 p-5">
              <p className="mb-1 text-xs font-bold uppercase tracking-widest text-sky-500">Titulo</p>
              <p className="text-xl font-black text-slate-800">{outline.title}</p>
              {outline.synopsis && (
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{outline.synopsis}</p>
              )}
            </div>

            {outline.characters.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-slate-400">
                  <Users size={12} /> Personagens
                </p>
                <div className="flex flex-wrap gap-2">
                  {outline.characters.map((c) => (
                    <span
                      key={c}
                      className="rounded-full border-2 border-violet-100 bg-violet-50 px-3 py-1 text-xs font-black text-violet-700"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                Roteiro — {outline.num_pages} paginas
              </p>
              <ol className="space-y-2">
                {outline.page_outlines.map((p) => (
                  <li
                    key={p.page_number}
                    className="flex gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-black text-white">
                      {p.page_number}
                    </span>
                    <div>
                      <p className="text-sm leading-snug text-slate-700">{p.scene}</p>
                      {p.key_vocabulary.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {p.key_vocabulary.map((w) => (
                            <span
                              key={w}
                              className="rounded-full border border-sky-100 bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-600"
                            >
                              {w}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {error && (
              <p className="rounded-xl bg-pink-50 px-4 py-3 text-sm font-medium text-kid-pink">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setStep('form'); setError(null); }}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 py-3 text-sm font-black text-slate-600 transition hover:border-primary hover:text-primary"
              >
                Ajustar
              </button>
              <button
                type="button"
                onClick={() => void handleStartBook()}
                className="flex flex-[2] items-center justify-center gap-3 rounded-2xl bg-primary py-3 text-sm font-black text-white shadow-[0_8px_24px_rgba(14,165,233,0.3)] transition hover:bg-primary-dark"
              >
                <BookOpen size={18} />
                Criar livro
              </button>
            </div>
          </div>
        );
      }

      case 'starting':
        return (
          <div className="flex flex-col items-center gap-5 py-10">
            <Loader2 size={44} className="animate-spin text-primary" />
            <p className="text-base font-black text-slate-800">Preparando livro...</p>
          </div>
        );

      case 'generating-pages': {
        if (!outline) return null;
        const total = outline.num_pages;
        const done = pages.length;
        const progress = (done / total) * 100;
        const lastPage = pages[done - 1];
        const nextPageNum = done + 1;
        return (
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm font-black text-slate-700">
                <span className="truncate pr-2">{outline.title}</span>
                <span className="shrink-0 text-slate-400">{done}/{total}</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {lastPage && (
              <div className="rounded-2xl border-2 border-sky-100 bg-sky-50 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-black text-white">
                    {lastPage.page_number}
                  </span>
                  <p className="text-xs font-bold uppercase tracking-widest text-sky-500">
                    Pagina {lastPage.page_number}
                  </p>
                </div>
                <p className="text-sm font-medium leading-relaxed text-slate-800">
                  {lastPage.text_en}
                </p>
                <p className="mt-1.5 text-xs italic leading-relaxed text-slate-500">
                  {lastPage.text_pt}
                </p>
                {lastPage.vocabulary.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {lastPage.vocabulary.map((w) => (
                      <span
                        key={w}
                        className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[10px] font-bold text-sky-600"
                      >
                        {w}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {done < total && outline.page_outlines[done] && (
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-400">
                  Proxima cena
                </p>
                <p className="text-sm text-slate-600">{outline.page_outlines[done].scene}</p>
              </div>
            )}

            {error && (
              <p className="rounded-xl bg-pink-50 px-4 py-3 text-sm font-medium text-kid-pink">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={() => void handleGeneratePage()}
              disabled={isGeneratingPage}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-primary py-4 text-base font-black text-white shadow-[0_8px_24px_rgba(14,165,233,0.3)] transition hover:bg-primary-dark disabled:opacity-60"
            >
              {isGeneratingPage ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Gerando pagina {nextPageNum}...
                </>
              ) : (
                <>
                  <Sparkles size={20} />
                  Gerar pagina {nextPageNum} de {total}
                </>
              )}
            </button>
          </div>
        );
      }

      case 'complete':
        return (
          <div className="flex flex-col items-center gap-5 py-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <Check size={32} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-xl font-black text-slate-800">{completeBook?.title}</p>
              <p className="mt-1 text-sm text-slate-500">
                Livro completo com {completeBook?.pages.length} paginas!
              </p>
            </div>
            <button
              type="button"
              onClick={() => completeBook && onBookComplete(completeBook)}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-500 py-4 text-base font-black text-white shadow-[0_8px_24px_rgba(16,185,129,0.3)] transition hover:bg-emerald-600"
            >
              <BookOpen size={20} />
              Ler livro
            </button>
          </div>
        );
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
        onClick={!isBusy ? onClose : undefined}
      />

      <div className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col rounded-t-[2rem] bg-white shadow-[0_-20px_60px_rgba(15,23,42,0.18)] sm:rounded-[2rem]">
        <div className="flex shrink-0 items-start justify-between gap-4 p-6 pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
              {stepSubtitle()}
            </p>
            <h2 className="mt-1 text-2xl font-black text-slate-800">{stepTitle()}</h2>
          </div>
          {!isBusy && step !== 'complete' && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-slate-200 bg-white text-slate-500 hover:border-primary hover:text-primary"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="overflow-y-auto px-6 pb-8">{renderContent()}</div>
      </div>
    </div>
  );
}

// ── Book reader ───────────────────────────────────────────────────────────────
interface BookReaderProps {
  book: Book;
  onBack: () => void;
  targetLanguage?: string;
}

function BookReader({ book, onBack, targetLanguage = 'English' }: BookReaderProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [audioLoadingEn, setAudioLoadingEn] = useState(false);
  const [audioLoadingPt, setAudioLoadingPt] = useState(false);
  const [readingMode, setReadingMode] = useState(true);
  const [showTranslation, setShowTranslation] = useState(false);

  const langMeta = getLangMeta(targetLanguage);

  if (book.pages.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-lg font-black text-slate-700">Este livro nao tem paginas ainda.</p>
          <button onClick={onBack} className="mt-4 text-sm font-bold text-primary hover:text-primary-dark">
            Voltar
          </button>
        </div>
      </main>
    );
  }

  const page = book.pages[pageIndex];
  const isFirst = pageIndex === 0;
  const isLast = pageIndex === book.pages.length - 1;
  const progress = ((pageIndex + 1) / book.pages.length) * 100;

  function goNext() { setPageIndex((i) => i + 1); setShowTranslation(false); }
  function goPrev() { setPageIndex((i) => i - 1); setShowTranslation(false); }

  async function playEn() {
    setAudioLoadingEn(true);
    try {
      const data = await api.speak(page.text_en);
      await playAudioWithFallback(
        data.audio_url ? api.getAudioUrl(data.audio_url) : null,
        data.fallback_text || page.text_en,
      );
    } catch { /* silent */ } finally { setAudioLoadingEn(false); }
  }

  async function playPt() {
    setAudioLoadingPt(true);
    try {
      const data = await api.speak(page.text_pt, 'pt');
      await playAudioWithFallback(
        data.audio_url ? api.getAudioUrl(data.audio_url) : null,
        data.fallback_text || page.text_pt,
      );
    } catch { /* silent */ } finally { setAudioLoadingPt(false); }
  }

  return (
    <main className="min-h-screen pb-28 px-3 py-5 sm:px-4 sm:py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-3xl">

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm font-bold text-primary-dark hover:text-primary"
          >
            <ArrowLeft size={20} /> Meus livros
          </button>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${levelColor(book.level)}`}>
              <Sparkles size={12} />
              Nivel {book.level} — {levelLabel(book.level)}
            </span>
            <p className="kid-tag text-xs">{pageIndex + 1} / {book.pages.length}</p>
            <button
              onClick={() => setReadingMode((m) => !m)}
              title={readingMode ? 'Modo dividido' : 'Modo leitura'}
              className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-200 text-slate-500 transition hover:border-primary hover:text-primary"
            >
              {readingMode ? <Columns2 size={15} /> : <BookOpen size={15} />}
            </button>
          </div>
        </div>

        <div className="mb-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {pageIndex === 0 && (
          <div className="mb-4 flex items-center gap-3">
            <KidsBookLogo size={44} />
            <p className="kid-tag text-xs">{book.title}</p>
          </div>
        )}

        {readingMode ? (
          <div className="kid-surface overflow-hidden border-sky-200">
            <div className="p-6 md:p-8">
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-xs font-black text-sky-700">
                  {langMeta.flag} {langMeta.label}
                </span>
                <button
                  onClick={() => void playEn()}
                  disabled={audioLoadingEn}
                  title={`Ouvir em ${langMeta.label}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-[0_6px_16px_rgba(14,165,233,0.3)] transition hover:bg-primary-dark disabled:opacity-60"
                >
                  {audioLoadingEn ? <Loader2 size={18} className="animate-spin" /> : <Volume2 size={18} />}
                </button>
              </div>
              <p className="text-2xl font-black leading-relaxed text-slate-800 md:text-3xl md:leading-relaxed">
                {page.text_en}
              </p>
            </div>

            <div className="border-t-2 border-dashed border-slate-100">
              <button
                onClick={() => setShowTranslation((v) => !v)}
                className="flex w-full items-center justify-center gap-2 py-3 text-sm font-black text-slate-400 transition hover:text-emerald-600"
              >
                {showTranslation ? (
                  <><EyeOff size={16} /> Esconder tradução</>
                ) : (
                  <><Eye size={16} /> Ver tradução em português</>
                )}
              </button>
            </div>

            {showTranslation && (
              <div className="border-t-2 border-emerald-100 bg-emerald-50/60 p-6 md:p-8">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
                    🇧🇷 Português
                  </span>
                  <button
                    onClick={() => void playPt()}
                    disabled={audioLoadingPt}
                    title="Ouvir em português"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_6px_16px_rgba(16,185,129,0.3)] transition hover:bg-emerald-600 disabled:opacity-60"
                  >
                    {audioLoadingPt ? <Loader2 size={18} className="animate-spin" /> : <Volume2 size={18} />}
                  </button>
                </div>
                <p className="text-lg leading-relaxed text-slate-700 md:text-xl md:leading-relaxed">
                  {page.text_pt}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="kid-surface flex flex-col gap-4 border-sky-200 p-5 md:p-6">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-xs font-black text-sky-700">
                  {langMeta.flag} {langMeta.label}
                </span>
                <button
                  onClick={() => void playEn()}
                  disabled={audioLoadingEn}
                  title={`Ouvir em ${langMeta.label}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-[0_6px_16px_rgba(14,165,233,0.3)] transition hover:bg-primary-dark disabled:opacity-60"
                >
                  {audioLoadingEn ? <Loader2 size={18} className="animate-spin" /> : <Volume2 size={18} />}
                </button>
              </div>
              <p className="flex-1 text-lg font-black leading-relaxed text-slate-800 md:text-xl">
                {page.text_en}
              </p>
            </div>
            <div className="kid-surface flex flex-col gap-4 border-emerald-200 bg-emerald-50/60 p-5 md:p-6">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
                  🇧🇷 Português
                </span>
                <button
                  onClick={() => void playPt()}
                  disabled={audioLoadingPt}
                  title="Ouvir em português"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_6px_16px_rgba(16,185,129,0.3)] transition hover:bg-emerald-600 disabled:opacity-60"
                >
                  {audioLoadingPt ? <Loader2 size={18} className="animate-spin" /> : <Volume2 size={18} />}
                </button>
              </div>
              <p className="flex-1 text-base leading-relaxed text-slate-700 md:text-lg">
                {page.text_pt}
              </p>
            </div>
          </div>
        )}

        {page.vocabulary.length > 0 && (
          <div className="mt-5 rounded-2xl border-2 border-slate-100 bg-white px-5 py-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Palavras desta página</p>
            <div className="flex flex-wrap gap-2">
              {page.vocabulary.map((word) => (
                <span
                  key={word}
                  className="rounded-full border-2 border-sky-100 bg-sky-50 px-3 py-1 text-xs font-black text-sky-700"
                >
                  {word}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            onClick={goPrev}
            disabled={isFirst}
            className="flex items-center gap-2 rounded-2xl border-2 border-slate-200 px-5 py-3 text-sm font-black text-slate-600 transition hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft size={18} /> Anterior
          </button>

          {isLast ? (
            <button
              onClick={onBack}
              className="flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-black text-white shadow-[0_8px_20px_rgba(16,185,129,0.3)] transition hover:bg-emerald-600"
            >
              Fim do livro! <BookOpen size={18} />
            </button>
          ) : (
            <button
              onClick={goNext}
              className="flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-black text-white shadow-[0_8px_20px_rgba(14,165,233,0.3)] transition hover:bg-primary-dark"
            >
              Proxima <ChevronRight size={18} />
            </button>
          )}
        </div>

      </div>
    </main>
  );
}

// ── Main content ──────────────────────────────────────────────────────────────
function BooksPageContent() {
  const authState = useRequireAuth();
  const searchParams = useSearchParams();
  const bookIdParam = searchParams.get('bookId');

  const [books, setBooks] = useState<BookSummary[]>([]);
  const [openBook, setOpenBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ isUnconfigured?: boolean; isOffline?: boolean; message?: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState<string>(() => {
    try {
      const cached = typeof window !== 'undefined' ? localStorage.getItem(LEVEL_CACHE_KEY) : null;
      return cached
        ? (JSON.parse(cached) as { target_language?: string }).target_language ?? 'English'
        : 'English';
    } catch { return 'English'; }
  });

  async function loadBooks() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listBooks();
      setBooks(data);
      try {
        const level = await api.getChildLevel();
        if (level.target_language) setTargetLanguage(level.target_language);
      } catch { /* ignore */ }
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ isUnconfigured: err.isUnconfigured, isOffline: err.isOffline, message: err.message });
      } else {
        setError({ message: 'Nao foi possivel carregar os livros.' });
      }
    } finally {
      setLoading(false);
    }
  }

  async function openBookById(id: number) {
    try {
      const book = await api.getBook(id);
      setOpenBook(book);
    } catch { /* silent */ }
  }

  useEffect(() => { void loadBooks(); }, []);

  useEffect(() => {
    if (bookIdParam) void openBookById(parseInt(bookIdParam, 10));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookIdParam]);

  function handleBookComplete(book: Book) {
    setShowForm(false);
    setBooks((prev) => {
      const exists = prev.some((b) => b.id === book.id);
      if (exists) return prev;
      return [
        { id: book.id, title: book.title, theme: book.theme, level: book.level, num_pages: book.pages.length, created_at: book.created_at },
        ...prev,
      ];
    });
    setOpenBook(book);
  }

  if (openBook) {
    return <BookReader book={openBook} onBack={() => setOpenBook(null)} targetLanguage={targetLanguage} />;
  }

  if (authState.status === 'loading' || authState.status === 'unauthenticated') {
    return (
      <StatusCard
        tone="loading"
        title="Verificando acesso"
        message="Confirmando seu cadastro..."
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }
  if (authState.status === 'server_missing') {
    return (
      <StatusCard
        tone="offline"
        title="Servidor nao disponivel"
        message="Ative o backend para acessar os livros."
        primaryAction={
          <Link href="/connect" className="kid-button bg-primary hover:bg-primary-dark">Conectar</Link>
        }
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }

  if (loading) {
    return (
      <StatusCard
        tone="loading"
        title="Carregando livros"
        message="Buscando seus livros..."
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }

  if (error?.isUnconfigured) {
    return (
      <StatusCard
        tone="offline"
        title="Conecte o tutor primeiro"
        message="Este aparelho ainda nao tem a URL do backend. Abra a pagina de conexao e salve a URL do tunnel."
        primaryAction={
          <Link href="/connect" className="kid-button bg-primary hover:bg-primary-dark">
            Abrir conexao
          </Link>
        }
        secondaryHref="/"
        secondaryLabel="Voltar ao inicio"
      />
    );
  }

  if (error?.isOffline) {
    return (
      <StatusCard
        tone="offline"
        title="Backend offline"
        message="Inicie o backend e o tunnel no seu computador e tente novamente."
        primaryAction={
          <button onClick={() => void loadBooks()} className="kid-button bg-kid-orange hover:bg-secondary-dark">
            Tentar de novo
          </button>
        }
        secondaryHref="/connect"
        secondaryLabel="Trocar conexao"
      />
    );
  }

  return (
    <>
      <main className="min-h-screen px-3 py-5 sm:px-4 sm:py-6 md:px-8 md:py-10">
        <div className="mx-auto max-w-2xl">

          <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-primary">
                <ArrowLeft size={14} /> Inicio
              </Link>
              <div className="mt-2 flex items-center gap-3">
                <KidsBookLogo size={52} />
                <div>
                  <h1 className="text-3xl font-black text-slate-800 md:text-4xl">Livros Pequenos</h1>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Historias em ingles criadas por IA no seu nivel
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="flex shrink-0 items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black text-white shadow-[0_8px_20px_rgba(14,165,233,0.3)] transition hover:bg-primary-dark"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Novo livro</span>
            </button>
          </div>

          {books.length === 0 ? (
            <div className="kid-surface flex flex-col items-center gap-5 border-primary/30 py-14 text-center">
              <KidsBookLogo size={80} />
              <div>
                <p className="text-lg font-black text-slate-800">Nenhum livro ainda</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Gere o seu primeiro livro em ingles com a IA!
                </p>
              </div>
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-black text-white shadow-[0_8px_20px_rgba(14,165,233,0.3)] transition hover:bg-primary-dark"
              >
                <Sparkles size={18} />
                Gerar primeiro livro
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {books.map((book) => (
                <button
                  key={book.id}
                  onClick={() => void openBookById(book.id)}
                  className="kid-surface flex flex-col gap-3 border-slate-200 p-5 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-100">
                      <BookOpen size={22} className="text-primary" />
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black ${levelColor(book.level)}`}>
                      N{book.level}
                    </span>
                  </div>
                  <div>
                    <p className="font-black leading-tight text-slate-800">{book.title}</p>
                    <p className="mt-0.5 text-xs capitalize text-slate-500">{book.theme}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>{book.num_pages} paginas</span>
                    <span>·</span>
                    <span>{levelLabel(book.level)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

      {showForm && (
        <GenerateForm
          onClose={() => setShowForm(false)}
          onBookComplete={handleBookComplete}
          targetLanguage={targetLanguage}
        />
      )}
    </>
  );
}
