import { getApiBaseUrl } from '@/lib/api-config';
import { getStoredActiveChildId } from '@/lib/active-child';

export interface LessonItem {
  word_en: string;
  word_pt: string;
  example_sentence_en: string;
  example_sentence_pt: string;
}

export interface WordByWordPair {
  en: string;
  pt: string;
}

export interface PhraseBreakdown {
  phrase_en: string;
  phrase_pt: string;
  word_by_word: WordByWordPair[];
}

export interface LessonContent extends Record<string, unknown> {
  daily_goal?: string;
  phrase_breakdowns?: PhraseBreakdown[];
}

export interface Lesson {
  id: number;
  title: string;
  theme: string;
  objective: string;
  content: LessonContent;
  items: LessonItem[];
  is_completed: boolean;
}

export interface LessonSummary {
  id: number;
  title: string;
  theme: string;
  objective: string;
  is_completed: boolean;
  completed_at: string | null;
}

export interface Progress {
  themes_completed: number;
  streak_count: number;
  vocabulary_learned: number;
  last_activity: string | null;
  current_level: number;
  difficult_words: string[];
}

export interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correct_option: string;
  explanation: string;
}

export interface Quiz {
  id: number;
  lesson_id: number;
  questions: QuizQuestion[];
}

export interface QuizSubmitResponse {
  status: string;
  encouragement: string;
}

export interface ReviewCard {
  review_item_id: number;
  word_en: string;
  word_pt: string;
  prompt: string;
  options: string[];
  difficulty_score: number;
  error_count: number;
}

export interface ReviewSession {
  total_due: number;
  items: ReviewCard[];
}

export interface ReviewAttemptResult {
  review_item_id: number;
  difficulty_score: number;
  next_review: string;
  error_count: number;
  correct_count: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  response: string;
  audio_url: string | null;
}

export interface SpeakResponse {
  audio_url: string | null;
  fallback_text?: string | null;
}

export interface ParentSettings {
  id: number;
  name: string;
  age_group: string;
  base_language: string;
  current_level: number;
  streak_count: number;
  last_activity: string | null;
  voice_preference: string;
  auto_audio: boolean;
}

export interface ChildProfile {
  id: number;
  name: string;
  age_group: string;
  base_language: string;
  current_level: number;
  streak_count: number;
  last_activity: string | null;
  voice_preference: string;
  auto_audio: boolean;
}

export interface ParentSettingsUpdatePayload {
  child_name?: string;
  age_group?: string;
  voice_preference?: string;
  auto_audio?: boolean;
}

export interface GenerateLessonPayload {
  topic?: string;
}

export interface CreateChildPayload {
  name: string;
  age_group: string;
  voice_preference?: string;
  auto_audio?: boolean;
}

export interface GenerateLessonResponse {
  status: string;
  lesson: Lesson;
  message: string;
}

export class ApiError extends Error {
  readonly status?: number;
  readonly detail?: string;
  readonly code: 'offline' | 'http' | 'parse' | 'unconfigured';

  constructor(
    message: string,
    options: {
      status?: number;
      detail?: string;
      code?: 'offline' | 'http' | 'parse' | 'unconfigured';
    } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.detail = options.detail;
    this.code = options.code ?? 'http';
  }

  get isOffline() {
    return this.code === 'offline';
  }

  get isUnconfigured() {
    return this.code === 'unconfigured';
  }
}

async function parseError(response: Response): Promise<ApiError> {
  const contentType = response.headers.get('content-type') || '';
  let detail = response.statusText;

  if (contentType.includes('application/json')) {
    try {
      const data = (await response.json()) as { detail?: string };
      detail = data.detail || detail;
    } catch {
      detail = response.statusText;
    }
  } else {
    try {
      detail = await response.text();
    } catch {
      detail = response.statusText;
    }
  }

  return new ApiError(detail || 'Algo deu errado.', {
    status: response.status,
    detail,
  });
}

export async function fetchAPI<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    throw new ApiError('Este aparelho ainda nao esta conectado a um backend. Abra a pagina de conexao e salve a URL atual do tunnel.', {
      code: 'unconfigured',
    });
  }

  const url = `${apiBaseUrl}${endpoint}`;

  let response: Response;
  try {
    const activeChildId = getStoredActiveChildId();
    response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(activeChildId ? { 'X-Child-ID': String(activeChildId) } : {}),
        ...options.headers,
      },
      cache: 'no-store',
    });
  } catch (error) {
    console.error('API call failed:', error);
    throw new ApiError('O tutor nao conseguiu acessar o backend.', {
      code: 'offline',
    });
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    console.error('API parse failed:', error);
    throw new ApiError('O tutor respondeu, mas nao foi possivel ler a resposta.', {
      code: 'parse',
    });
  }
}

export const api = {
  request: fetchAPI,
  getTodayLesson: () => fetchAPI<Lesson>('/api/lesson/today'),
  getAllLessons: () => fetchAPI<LessonSummary[]>('/api/lessons'),
  getLessonById: (id: number) => fetchAPI<Lesson>(`/api/lesson/${id}`),
  completeLesson: (id: number) =>
    fetchAPI<{ status: string }>(`/api/lesson/complete?lesson_id=${id}`, {
      method: 'POST',
    }),
  getProgress: () => fetchAPI<Progress>('/api/progress'),
  getTodayQuiz: (lessonId?: number) =>
    fetchAPI<Quiz>(lessonId ? `/api/quiz/today?lesson_id=${lessonId}` : '/api/quiz/today'),
  submitQuiz: (payload: { lesson_id: number; score: number; total_questions: number }) =>
    fetchAPI<QuizSubmitResponse>('/api/quiz/submit', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getReviewSession: (limit = 5) => fetchAPI<ReviewSession>(`/api/review?limit=${limit}`),
  submitReviewAttempt: (payload: {
    review_item_id?: number;
    word_en: string;
    word_pt: string;
    correct: boolean;
  }) =>
    fetchAPI<ReviewAttemptResult>('/api/review/attempt', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  chat: (message: string, history: ChatMessage[]) =>
    fetchAPI<ChatResponse>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message, history }),
    }),
  speak: (text: string, voice?: string) =>
    fetchAPI<SpeakResponse>('/api/audio/speak', {
      method: 'POST',
      body: JSON.stringify({ text, voice }),
    }),
  parentLogin: (password: string) =>
    fetchAPI<{ status: string }>('/api/parent/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  parentLogout: () =>
    fetchAPI<{ status: string }>('/api/parent/logout', {
      method: 'POST',
    }),
  getParentSettings: () => fetchAPI<ParentSettings>('/api/parent/settings'),
  listParentChildren: () => fetchAPI<ChildProfile[]>('/api/parent/children'),
  createParentChild: (payload: CreateChildPayload) =>
    fetchAPI<ChildProfile>('/api/parent/children', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateParentSettings: (payload: ParentSettingsUpdatePayload) =>
    fetchAPI<ParentSettings>('/api/parent/settings', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  generateMorePhrases: (payload: GenerateLessonPayload = {}) =>
    fetchAPI<GenerateLessonResponse>('/api/parent/generate-lesson', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getAudioUrl: (url: string) => {
    if (url.startsWith('http')) {
      return url;
    }

    const apiBaseUrl = getApiBaseUrl();
    return apiBaseUrl ? `${apiBaseUrl}${url}` : url;
  },
};
