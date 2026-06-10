import { getApiBaseUrl, resolveApiBaseUrl } from '@/lib/api-config';
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

export interface StudyDay {
  id: number | null;
  study_date: string;
  plan_text: string;
  studied_text: string;
  distractions: string[];
  is_study_day: boolean;
  pomodoro_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface StudyDashboard {
  today: StudyDay;
  recent_days: StudyDay[];
  study_streak_count: number;
  last_study_date: string | null;
}

export interface StudyDayUpdatePayload {
  plan_text?: string;
  studied_text?: string;
  distractions?: string[];
  pomodoro_count?: number;
}

export type DiverseRating = 'knew' | 'partial' | 'unknown';

export interface CodingTopic {
  topic: string;
  done: boolean;
  answer?: string;
  /** Spaced-repetition state for the "Diverso" study mode */
  last_rating?: DiverseRating | null;
  review_count?: number;
  last_reviewed?: string | null;
}

export interface DiverseLessonBlock {
  id: string;
  title: string;
  topics: CodingTopic[];
  created_at?: string | null;
}

export interface CatalogSubject {
  name: string;
  topics: CodingTopic[];
}

export interface CodingDay {
  id: number | null;
  study_date: string;
  subjects: Record<string, CodingTopic[]>;
  created_at: string | null;
  updated_at: string | null;
}

export interface CodingDayUpdatePayload {
  subjects: Record<string, CodingTopic[]>;
}

export interface DiverseSubject {
  name: string;
  topics: CodingTopic[];
  lessons?: DiverseLessonBlock[];
}

export interface DiverseDay {
  id: number | null;
  study_date: string;
  custom_subjects: DiverseSubject[];
  created_at: string | null;
  updated_at: string | null;
}

export interface DiverseDayUpdatePayload {
  custom_subjects: DiverseSubject[];
}

export interface ChildProgressSummary {
  child: ChildProfile;
  progress: Progress;
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
  target_language: string;
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
  target_language: string;
}

export interface ParentSettingsUpdatePayload {
  child_name?: string;
  age_group?: string;
  voice_preference?: string;
  auto_audio?: boolean;
  target_language?: string;
}

export interface GenerateLessonPayload {
  topic?: string;
  quantity?: number;
}

export interface CreateChildPayload {
  name: string;
  age_group: string;
  voice_preference?: string;
  auto_audio?: boolean;
  target_language?: string;
}

export interface GenerateLessonResponse {
  status: string;
  lesson: Lesson;
  lessons: Lesson[];
  message: string;
}

export interface LevelAnalysis {
  level: number;
  label: string;
  vocabulary_learned: number;
  quiz_accuracy: number;
  avg_review_difficulty: number;
  next_level_at: number;
  target_language: string;
}

export interface BookPage {
  id: number;
  page_number: number;
  text_en: string;
  text_pt: string;
  vocabulary: string[];
}

export interface Book {
  id: number;
  title: string;
  theme: string;
  level: number;
  num_pages: number;
  created_at: string;
  pages: BookPage[];
}

export interface BookSummary {
  id: number;
  title: string;
  theme: string;
  level: number;
  num_pages: number;
  created_at: string;
}

export interface BookOutlinePage {
  page_number: number;
  scene: string;
  key_vocabulary: string[];
}

export interface BookOutline {
  title: string;
  theme: string;
  synopsis: string;
  characters: string[];
  page_outlines: BookOutlinePage[];
  level: number;
  num_pages: number;
  target_language: string;
}

export interface GenerateBookOutlinePayload {
  level?: number;
  num_pages: number;
  theme?: string;
}

export interface StartBookPayload {
  title: string;
  theme: string;
  level: number;
  num_pages: number;
  target_language?: string;
}

export interface GeneratePagePayload {
  outline: BookOutline;
  page_number: number;
  context_pages: Array<{ page_number: number; text_en: string; text_pt: string; vocabulary: string[] }>;
}

export interface GenerateBookPayload {
  level: number;      // 0 = usa nível atual da criança
  num_pages: number;  // 3-10
  theme: string;      // vazio = IA escolhe
}

export interface UserProfile {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  created_at: string;
}

export interface UserRegisterPayload {
  first_name: string;
  last_name: string;
  email: string;
  cpf: string;
  password: string;
  child_name?: string;
  target_language?: string;
  ai_provider?: string;
  ai_api_key?: string;
  ai_model?: string;
  ai_base_url?: string;
}

// Admin Learn types
export interface AdminModule {
  slug: string;
  title: string;
  category: string;
  description: string;
  total_sections: number;
  total_quiz: number;
}

export interface AdminModuleSection {
  title: string;
  body: string;
  code_example?: string;
}

export interface AdminModuleQuizQuestion {
  id: number;
  question: string;
  options: string[];
  correct_option: string;
  explanation: string;
}

export interface AdminModulePracticeCase {
  input: string;
  expected: string;
}

export interface AdminModulePractice {
  id: number;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard' | string;
  prompt: string;
  starter_code: string;
  solution: string;
  explanation: string;
  test_cases: AdminModulePracticeCase[];
}

export interface AdminModuleDetail {
  slug: string;
  title: string;
  category: string;
  description: string;
  sections: AdminModuleSection[];
  practice?: AdminModulePractice[];
  quiz: AdminModuleQuizQuestion[];
}

export interface AdminFlashcard {
  id: number;
  front: string;
  back: string;
  category: string;
  code_example: string | null;
  created_at: string;
}

export interface AdminFlashcardPayload {
  front: string;
  back: string;
  category: string;
  code_example?: string;
}

export interface GenerateFlashcardsPayload {
  subject?: string;
  count?: number;
  suggest_subject?: boolean;
  avoid_topics?: string[];
  api_key?: string;
  provider?: string;
}

export interface GeneratedFlashcard {
  topic: string;
  answer: string;
}

export interface GenerateFlashcardsResponse {
  subject: string;
  flashcards: GeneratedFlashcard[];
}

export interface UserAISettings {
  provider: string;
  model: string;
  base_url: string | null;
  has_api_key: boolean;
  api_key_preview: string | null;
}

export interface AIProvider {
  id: string;
  label: string;
  default_model: string;
  requires_base_url: boolean;
  is_default: boolean;
}

export interface UserAISettingsPayload {
  provider: string;
  api_key?: string;
  model?: string;
  base_url?: string;
}

// ── Coding Curriculum ──────────────────────────────────────────────────────

export interface ProgrammingSubject {
  id: number;
  child_id: number;
  name: string;
  description: string | null;
  icon_emoji: string | null;
  created_at: string;
  topic_count: number;
  studied_count: number;
  due_review_count: number;
}

export interface AISectionContent {
  title: string;
  body: string;
  code_example?: string | null;
}

export interface AIQuizQuestion {
  id: number;
  question: string;
  options: string[];
  correct_option: string;
  explanation: string;
}

export interface TopicAIContent {
  sections: AISectionContent[];
  quiz: AIQuizQuestion[];
  flashcards: { front: string; back: string; code_example?: string | null }[];
}

export interface ProgrammingTopic {
  id: number;
  subject_id: number;
  title: string;
  order_index: number;
  status: 'not_started' | 'studied' | 'mastered';
  ai_content: TopicAIContent | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  flashcard_count: number;
}

export interface ProgrammingFlashcard {
  id: number;
  topic_id: number;
  subject_id: number;
  front: string;
  back: string;
  code_example: string | null;
  created_at: string;
}

export interface CodingReviewCard {
  review_item_id: number;
  flashcard_id: number;
  subject_id: number;
  front: string;
  back: string;
  code_example: string | null;
  difficulty_score: number;
  error_count: number;
}

export interface CodingReviewSession {
  total_due: number;
  items: CodingReviewCard[];
}

export interface CodingReviewAttemptResult {
  review_item_id: number;
  difficulty_score: number;
  next_review: string;
  error_count: number;
  correct_count: number;
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
  const apiBaseUrl = await resolveApiBaseUrl();
  if (!apiBaseUrl) {
    throw new ApiError('Este aparelho ainda nao esta conectado a um backend. Rode o launcher com o tunnel ativo ou abra a pagina de conexao e salve a URL atual do tunnel.', {
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
  getNextLesson: () => fetchAPI<Lesson>('/api/lesson/next'),
  getTodayLesson: () => fetchAPI<Lesson>('/api/lesson/today'),
  getAllLessons: () => fetchAPI<LessonSummary[]>('/api/lessons'),
  getLessonById: (id: number) => fetchAPI<Lesson>(`/api/lesson/${id}`),
  completeLesson: (id: number) =>
    fetchAPI<{ status: string }>(`/api/lesson/complete?lesson_id=${id}`, {
      method: 'POST',
    }),
  getProgress: () => fetchAPI<Progress>('/api/progress'),
  getChildLevel: () => fetchAPI<LevelAnalysis>('/api/child/level'),
  getStudyDashboard: () => fetchAPI<StudyDashboard>('/api/study/dashboard'),
  getStudyDay: (studyDate: string) => fetchAPI<StudyDay>(`/api/study/day/${studyDate}`),
  saveStudyDay: (studyDate: string, payload: StudyDayUpdatePayload) =>
    fetchAPI<StudyDay>(`/api/study/day/${studyDate}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  getCodingDay: (studyDate: string) => fetchAPI<CodingDay>(`/api/study/coding/${studyDate}`),
  saveCodingDay: (studyDate: string, payload: CodingDayUpdatePayload) =>
    fetchAPI<CodingDay>(`/api/study/coding/${studyDate}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  getDiverseCatalog: () => fetchAPI<CatalogSubject[]>('/api/study/diverse/catalog'),
  getDiverseDay: (studyDate: string) => fetchAPI<DiverseDay>(`/api/study/diverse/${studyDate}`),
  saveDiverseDay: (studyDate: string, payload: DiverseDayUpdatePayload) =>
    fetchAPI<DiverseDay>(`/api/study/diverse/${studyDate}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
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
  userRegister: (payload: UserRegisterPayload) =>
    fetchAPI<UserProfile>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  userLogin: (email: string, password: string) =>
    fetchAPI<{ status: string; name: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  getUserMe: () => fetchAPI<UserProfile>('/api/auth/me'),
  userLogout: () =>
    fetchAPI<{ status: string }>('/api/auth/logout', {
      method: 'POST',
    }),
  getGoogleLoginUrl: async (next = '/parents') => {
    const apiBaseUrl = await resolveApiBaseUrl();
    if (!apiBaseUrl) {
      throw new ApiError('Este aparelho ainda nao esta conectado a um backend.', {
        code: 'unconfigured',
      });
    }
    return `${apiBaseUrl}/api/auth/google/start?next=${encodeURIComponent(next)}`;
  },
  getParentSettings: () => fetchAPI<ParentSettings>('/api/parent/settings'),
  listParentChildren: () => fetchAPI<ChildProfile[]>('/api/parent/children'),
  getParentProgress: () => fetchAPI<ChildProgressSummary[]>('/api/parent/progress'),
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
  // Books
  listBooks: () => fetchAPI<BookSummary[]>('/api/books'),
  getBook: (bookId: number) => fetchAPI<Book>(`/api/books/${bookId}`),
  generateBook: (payload: GenerateBookPayload) =>
    fetchAPI<Book>('/api/books/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  generateBookOutline: (payload: GenerateBookOutlinePayload) =>
    fetchAPI<BookOutline>('/api/books/outline', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  startBook: (payload: StartBookPayload) =>
    fetchAPI<Book>('/api/books/start', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  generateBookPage: (bookId: number, payload: GeneratePagePayload) =>
    fetchAPI<BookPage>(`/api/books/${bookId}/pages`, {
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
  // Admin Learn
  adminCheck: () => fetchAPI<{ is_admin: boolean; email: string }>('/api/admin/check'),
  adminListModules: () => fetchAPI<AdminModule[]>('/api/admin/learn/modules'),
  adminGetModule: (slug: string) => fetchAPI<AdminModuleDetail>(`/api/admin/learn/modules/${slug}`),
  adminListFlashcards: () => fetchAPI<AdminFlashcard[]>('/api/admin/learn/flashcards'),
  adminCreateFlashcard: (payload: AdminFlashcardPayload) =>
    fetchAPI<AdminFlashcard>('/api/admin/learn/flashcards', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  adminDeleteFlashcard: (id: number) =>
    fetchAPI<void>(`/api/admin/learn/flashcards/${id}`, { method: 'DELETE' }),
  generateStudyFlashcards: (payload: GenerateFlashcardsPayload) =>
    fetchAPI<GenerateFlashcardsResponse>('/api/study/diverse/generate-flashcards', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getAIProviders: () => fetchAPI<AIProvider[]>('/api/ai/providers'),
  getUserAISettings: () => fetchAPI<UserAISettings>('/api/ai/settings'),
  saveUserAISettings: (payload: UserAISettingsPayload) =>
    fetchAPI<UserAISettings>('/api/ai/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  // Coding Curriculum
  getCodingSubjects: () =>
    fetchAPI<ProgrammingSubject[]>('/api/coding/subjects'),
  createCodingSubject: (payload: { name: string; description?: string; icon_emoji?: string }) =>
    fetchAPI<ProgrammingSubject>('/api/coding/subjects', { method: 'POST', body: JSON.stringify(payload) }),
  updateCodingSubject: (id: number, payload: { name?: string; description?: string; icon_emoji?: string }) =>
    fetchAPI<ProgrammingSubject>(`/api/coding/subjects/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteCodingSubject: (id: number) =>
    fetchAPI<void>(`/api/coding/subjects/${id}`, { method: 'DELETE' }),
  getCodingTopics: (subjectId: number) =>
    fetchAPI<ProgrammingTopic[]>(`/api/coding/subjects/${subjectId}/topics`),
  createCodingTopic: (subjectId: number, payload: { title: string; order_index?: number; generate_ai?: boolean }) =>
    fetchAPI<ProgrammingTopic>(`/api/coding/subjects/${subjectId}/topics`, { method: 'POST', body: JSON.stringify(payload) }),
  generateCodingTopic: (subjectId: number) =>
    fetchAPI<ProgrammingTopic>(`/api/coding/subjects/${subjectId}/topics/generate`, { method: 'POST' }),
  updateCodingTopic: (id: number, payload: { title?: string; order_index?: number; status?: string; notes?: string; ai_content?: object }) =>
    fetchAPI<ProgrammingTopic>(`/api/coding/topics/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteCodingTopic: (id: number) =>
    fetchAPI<void>(`/api/coding/topics/${id}`, { method: 'DELETE' }),
  generateCodingTopicContent: (id: number) =>
    fetchAPI<ProgrammingTopic>(`/api/coding/topics/${id}/generate`, { method: 'POST' }),
  getTopicFlashcards: (topicId: number) =>
    fetchAPI<ProgrammingFlashcard[]>(`/api/coding/topics/${topicId}/flashcards`),
  createTopicFlashcard: (topicId: number, payload: { front: string; back: string; code_example?: string }) =>
    fetchAPI<ProgrammingFlashcard>(`/api/coding/topics/${topicId}/flashcards`, { method: 'POST', body: JSON.stringify(payload) }),
  updateCodingFlashcard: (id: number, payload: { front?: string; back?: string; code_example?: string }) =>
    fetchAPI<ProgrammingFlashcard>(`/api/coding/flashcards/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteCodingFlashcard: (id: number) =>
    fetchAPI<void>(`/api/coding/flashcards/${id}`, { method: 'DELETE' }),
  getCodingReview: (subjectId?: number, limit = 20) =>
    fetchAPI<CodingReviewSession>(`/api/coding/review?limit=${limit}${subjectId ? `&subject_id=${subjectId}` : ''}`),
  submitCodingReviewAttempt: (payload: { review_item_id: number; correct: boolean }) =>
    fetchAPI<CodingReviewAttemptResult>('/api/coding/review/attempt', { method: 'POST', body: JSON.stringify(payload) }),
};
