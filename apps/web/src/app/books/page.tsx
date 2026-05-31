'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';

import { StatusCard } from '@/components/status-card';
import {
  ApiError,
  api,
  type Book,
  type BookSummary,
  type GenerateBookPayload,
} from '@/lib/api';
import { playAudioWithFallback } from '@/lib/browser-speech';

// ── Level labels ────────────────────────────────────────────────────────────
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

// ── Kids book SVG logo ──────────────────────────────────────────────────────
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
      {/* Book body */}
      <rect x="8" y="14" width="64" height="52" rx="6" fill="#38bdf8" />
      {/* Spine */}
      <rect x="8" y="14" width="12" height="52" rx="4" fill="#0284c7" />
      {/* Pages */}
      <rect x="22" y="22" width="42" height="36" rx="3" fill="white" opacity="0.9" />
      {/* Lines on page */}
      <rect x="28" y="30" width="28" height="3" rx="1.5" fill="#bae6fd" />
      <rect x="28" y="37" width="22" height="3" rx="1.5" fill="#bae6fd" />
      <rect x="28" y="44" width="25" height="3" rx="1.5" fill="#bae6fd" />
      {/* Star decoration */}
      <circle cx="58" cy="16" r="7" fill="#fbbf24" />
      <text x="58" y="20" textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">★</text>
      {/* Heart decoration */}
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

// ── Generate form modal ──────────────────────────────────────────────────────
interface GenerateFormProps {
  onClose: () => void;
  onGenerate: (payload: GenerateBookPayload) => void;
  generating: boolean;
}

function GenerateForm({ onClose, onGenerate, generating }: GenerateFormProps) {
  const [level, setLevel] = useState(0);       // 0 = auto
  const [numPages, setNumPages] = useState(5);
  const [theme, setTheme] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onGenerate({ level, num_pages: numPages, theme });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
        onClick={onClose}
        disabled={generating}
      />

      <div className="relative z-10 w-full max-w-md rounded-t-[2rem] bg-white p-6 shadow-[0_-20px_60px_rgba(15,23,42,0.18)] sm:rounded-[2rem] sm:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Novo livro</p>
            <h2 className="mt-1 text-2xl font-black text-slate-800">Gerar com IA</h2>
          </div>
          {!generating && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-slate-200 bg-white text-slate-500 hover:border-primary hover:text-primary"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Difficulty */}
          <div>
            <label className="mb-2 block text-sm font-black text-slate-700">
              Dificuldade
              <span className="ml-2 font-normal text-slate-400">
                {level === 0 ? '— Automatica (usa seu nivel)' : `— Nivel ${level}: ${levelLabel(level)}`}
              </span>
            </label>
            <input
              type="range"
              min={0}
              max={10}
              value={level}
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

          {/* Pages */}
          <div>
            <label className="mb-2 block text-sm font-black text-slate-700">
              Paginas: <span className="font-normal text-slate-500">{numPages}</span>
            </label>
            <input
              type="range"
              min={3}
              max={10}
              value={numPages}
              onChange={(e) => setNumPages(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-primary"
            />
            <div className="mt-1 flex justify-between text-xs text-slate-400">
              <span>3</span>
              <span>10</span>
            </div>
          </div>

          {/* Theme */}
          <div>
            <label className="mb-2 block text-sm font-black text-slate-700">
              Tema <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input
              type="text"
              placeholder="ex: space adventure, animals, friendship..."
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              maxLength={80}
              className="w-full rounded-2xl border-2 border-slate-200 px-4 py-3 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-primary"
            />
          </div>

          <button
            type="submit"
            disabled={generating}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-primary py-4 text-base font-black text-white shadow-[0_8px_24px_rgba(14,165,233,0.3)] transition hover:bg-primary-dark disabled:opacity-60"
          >
            {generating ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Gerando livro com IA...
              </>
            ) : (
              <>
                <Sparkles size={20} />
                Gerar livro
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Book reader ──────────────────────────────────────────────────────────────
interface BookReaderProps {
  book: Book;
  onBack: () => void;
}

function BookReader({ book, onBack }: BookReaderProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [audioLoadingEn, setAudioLoadingEn] = useState(false);
  const [audioLoadingPt, setAudioLoadingPt] = useState(false);
  // readingMode = true → imersivo (EN + toggle tradução)
  // readingMode = false → split lado a lado
  const [readingMode, setReadingMode] = useState(true);
  const [showTranslation, setShowTranslation] = useState(false);

  const page = book.pages[pageIndex];
  const isFirst = pageIndex === 0;
  const isLast = pageIndex === book.pages.length - 1;
  const progress = ((pageIndex + 1) / book.pages.length) * 100;

  function goNext() {
    setPageIndex((i) => i + 1);
    setShowTranslation(false);
  }
  function goPrev() {
    setPageIndex((i) => i - 1);
    setShowTranslation(false);
  }

  async function playEn() {
    setAudioLoadingEn(true);
    try {
      const data = await api.speak(page.text_en);
      await playAudioWithFallback(
        data.audio_url ? api.getAudioUrl(data.audio_url) : null,
        data.fallback_text || page.text_en,
      );
    } catch { /* silent */ } finally {
      setAudioLoadingEn(false);
    }
  }

  async function playPt() {
    setAudioLoadingPt(true);
    try {
      const data = await api.speak(page.text_pt, 'pt');
      await playAudioWithFallback(
        data.audio_url ? api.getAudioUrl(data.audio_url) : null,
        data.fallback_text || page.text_pt,
      );
    } catch { /* silent */ } finally {
      setAudioLoadingPt(false);
    }
  }

  return (
    <main className="min-h-screen pb-28 px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-3xl">

        {/* Nav */}
        <div className="mb-5 flex items-center justify-between gap-3">
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
            <p className="kid-tag text-xs">
              {pageIndex + 1} / {book.pages.length}
            </p>
            {/* Mode toggle */}
            <button
              onClick={() => setReadingMode((m) => !m)}
              title={readingMode ? 'Modo dividido' : 'Modo leitura'}
              className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-200 text-slate-500 transition hover:border-primary hover:text-primary"
            >
              {readingMode ? <Columns2 size={15} /> : <BookOpen size={15} />}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Book title on page 1 */}
        {pageIndex === 0 && (
          <div className="mb-4 flex items-center gap-3">
            <KidsBookLogo size={44} />
            <p className="kid-tag text-xs">{book.title}</p>
          </div>
        )}

        {/* ── READING MODE (imersivo) ──────────────────────────────── */}
        {readingMode ? (
          <div className="kid-surface overflow-hidden border-sky-200">
            {/* English block */}
            <div className="p-6 md:p-8">
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-xs font-black text-sky-700">
                  🇺🇸 English
                </span>
                <button
                  onClick={() => void playEn()}
                  disabled={audioLoadingEn}
                  title="Ouvir em inglês"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-[0_6px_16px_rgba(14,165,233,0.3)] transition hover:bg-primary-dark disabled:opacity-60"
                >
                  {audioLoadingEn ? <Loader2 size={18} className="animate-spin" /> : <Volume2 size={18} />}
                </button>
              </div>
              <p className="text-2xl font-black leading-relaxed text-slate-800 md:text-3xl md:leading-relaxed">
                {page.text_en}
              </p>
            </div>

            {/* Translation toggle divider */}
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

            {/* Portuguese block — revealed */}
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
          /* ── SPLIT MODE (lado a lado) ──────────────────────────────── */
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* English side */}
            <div className="kid-surface flex flex-col gap-4 border-sky-200 p-5 md:p-6">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-xs font-black text-sky-700">
                  🇺🇸 English
                </span>
                <button
                  onClick={() => void playEn()}
                  disabled={audioLoadingEn}
                  title="Ouvir em inglês"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-[0_6px_16px_rgba(14,165,233,0.3)] transition hover:bg-primary-dark disabled:opacity-60"
                >
                  {audioLoadingEn ? <Loader2 size={18} className="animate-spin" /> : <Volume2 size={18} />}
                </button>
              </div>
              <p className="flex-1 text-lg font-black leading-relaxed text-slate-800 md:text-xl">
                {page.text_en}
              </p>
            </div>
            {/* Portuguese side */}
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

        {/* Vocabulary */}
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

        {/* Navigation */}
        <div className="mt-5 flex items-center justify-between gap-3">
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

// ── Main content ─────────────────────────────────────────────────────────────
function BooksPageContent() {
  const searchParams = useSearchParams();
  const bookIdParam = searchParams.get('bookId');

  const [books, setBooks] = useState<BookSummary[]>([]);
  const [openBook, setOpenBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  async function loadBooks() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listBooks();
      setBooks(data);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('Nao foi possivel carregar os livros.'));
    } finally {
      setLoading(false);
    }
  }

  async function openBookById(id: number) {
    try {
      const book = await api.getBook(id);
      setOpenBook(book);
    } catch {
      // silent — will just not open
    }
  }

  useEffect(() => {
    void loadBooks();
  }, []);

  useEffect(() => {
    if (bookIdParam) {
      void openBookById(parseInt(bookIdParam, 10));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookIdParam]);

  async function handleGenerate(payload: GenerateBookPayload) {
    setGenerating(true);
    setGenerateError(null);
    try {
      const book = await api.generateBook(payload);
      setShowForm(false);
      setBooks((prev) => [
        {
          id: book.id,
          title: book.title,
          theme: book.theme,
          level: book.level,
          num_pages: book.num_pages,
          created_at: book.created_at,
        },
        ...prev,
      ]);
      setOpenBook(book);
    } catch (err) {
      if (err instanceof ApiError) {
        setGenerateError(err.message);
      } else {
        setGenerateError('Erro ao gerar o livro. Tente novamente.');
      }
    } finally {
      setGenerating(false);
    }
  }

  // ── Reader mode ────────────────────────────────────────────────────────────
  if (openBook) {
    return <BookReader book={openBook} onBack={() => setOpenBook(null)} />;
  }

  // ── Loading ────────────────────────────────────────────────────────────────
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

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <>
      <main className="min-h-screen px-4 py-6 md:px-8 md:py-10">
        <div className="mx-auto max-w-2xl">

          {/* Header */}
          <div className="mb-7 flex items-start justify-between gap-4">
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
              onClick={() => { setShowForm(true); setGenerateError(null); }}
              className="flex shrink-0 items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black text-white shadow-[0_8px_20px_rgba(14,165,233,0.3)] transition hover:bg-primary-dark"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Novo livro</span>
            </button>
          </div>

          {/* Generate error */}
          {generateError && (
            <div className="mb-5 rounded-2xl border-2 border-kid-pink bg-pink-50 px-5 py-4 text-sm text-slate-700">
              <span className="font-black text-kid-pink">Erro: </span>{generateError}
            </div>
          )}

          {/* Empty state */}
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
                    <p className="font-black text-slate-800 leading-tight">{book.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500 capitalize">{book.theme}</p>
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

      {/* Generate form */}
      {showForm && (
        <GenerateForm
          onClose={() => !generating && setShowForm(false)}
          onGenerate={(p) => void handleGenerate(p)}
          generating={generating}
        />
      )}
    </>
  );
}
