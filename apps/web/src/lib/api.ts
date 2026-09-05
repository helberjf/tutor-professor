import {
  clearSavedApiBaseUrl,
  getApiBaseUrl,
  resolveApiBaseUrl,
  resolveApiBaseUrlAfterOfflineFailure,
} from '@/lib/api-config';
import { choosePreferredActiveChildId, clearActiveChildId, getStoredActiveChildId, saveActiveChildId } from '@/lib/active-child';

// ─────────────────────────────────────────────────────────────────────────────
// Autenticação por token (resolve o login em celular/iPhone)
//
// O front (Vercel) e o backend (tunnel) ficam em domínios diferentes. O iOS
// bloqueia o cookie de sessão nesse cenário cross-site, então o login "voltava"
// para a tela de login. Com o token enviado no header Authorization, isso deixa
// de depender de cookie e passa a funcionar em qualquer celular.
//
// REVERTER PARA O COMPORTAMENTO ANTIGO (só cookie): troque a linha abaixo para
//   const USE_TOKEN_AUTH = false;
// O backend continua setando o cookie normalmente, então nada mais precisa mudar.
const USE_TOKEN_AUTH = true;

const SESSION_TOKEN_STORAGE_KEY = 'english-kids-tutor.session-token';
let preferredChildSyncPromise: Promise<void> | null = null;
let preferredChildSyncKey: string | null = null;

function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
}

function setSessionToken(token: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
  preferredChildSyncKey = null;
  invalidateUserMeCache();
}

function clearSessionToken() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
  preferredChildSyncKey = null;
  invalidateUserMeCache();
}

// The auth gate, the navbar and useRequireAuth each ask for the profile on every
// page render, so a single navigation fired three identical /api/auth/me calls.
// Share one in-flight request and reuse the answer briefly.
const USER_ME_CACHE_MS = 30_000;
let userMeCache: { at: number; promise: Promise<UserProfile> } | null = null;

function invalidateUserMeCache() {
  userMeCache = null;
}

function shouldSyncPreferredChild(endpoint: string, options: RequestInit) {
  if (typeof window === 'undefined') return false;

  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return false;

  return (
    !endpoint.startsWith('/api/auth/') &&
    !endpoint.startsWith('/api/parent/') &&
    endpoint !== '/api/health' &&
    endpoint !== '/health'
  );
}

async function syncPreferredChild(apiBaseUrl: string) {
  const sessionToken = USE_TOKEN_AUTH ? getSessionToken() : null;
  const syncKey = `${apiBaseUrl}|${sessionToken || 'cookie'}|${getStoredActiveChildId() ?? 'none'}`;
  if (preferredChildSyncKey === syncKey) {
    return;
  }
  if (preferredChildSyncPromise) {
    await preferredChildSyncPromise;
    return;
  }

  preferredChildSyncPromise = (async () => {
    const headers = {
      'Content-Type': 'application/json',
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    };
    const [childrenResponse, progressResponse] = await Promise.all([
      fetch(`${apiBaseUrl}/api/parent/children`, {
        credentials: 'include',
        headers,
        cache: 'no-store',
      }),
      fetch(`${apiBaseUrl}/api/parent/progress`, {
        credentials: 'include',
        headers,
        cache: 'no-store',
      }),
    ]);

    if (!childrenResponse.ok || !progressResponse.ok) {
      return;
    }

    const [children, progressSummaries] = await Promise.all([
      childrenResponse.json() as Promise<ChildProfile[]>,
      progressResponse.json() as Promise<ChildProgressSummary[]>,
    ]);
    const preferredChildId = choosePreferredActiveChildId({
      storedActiveChildId: getStoredActiveChildId(),
      children,
      progressSummaries,
      fallbackChildId: children[0]?.id ?? null,
    });

    if (preferredChildId) {
      saveActiveChildId(preferredChildId);
    } else {
      clearActiveChildId();
    }
    preferredChildSyncKey = `${apiBaseUrl}|${sessionToken || 'cookie'}|${getStoredActiveChildId() ?? 'none'}`;
  })().finally(() => {
    preferredChildSyncPromise = null;
  });

  await preferredChildSyncPromise;
}

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

export interface LessonQuestion {
  id: number;
  lesson_id: number;
  target_language: string;
  question_type: string;
  front: string;
  back: string;
  supporting_example: string | null;
  created_at: string;
}

export interface Lesson {
  id: number;
  title: string;
  theme: string;
  objective: string;
  content: LessonContent;
  items: LessonItem[];
  questions: LessonQuestion[];
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
  question_metrics: QuestionSubjectMetrics[];
}

export interface QuestionSubjectMetrics {
  subject_id: number;
  subject_name: string;
  resolved_count: number;
  correct_count: number;
  error_count: number;
  accuracy_percent: number;
}

export interface StudyDayUpdatePayload {
  plan_text?: string;
  studied_text?: string;
  distractions?: string[];
  pomodoro_count?: number;
}

export interface DailyActivity {
  id: number;
  child_id: number;
  activity_date: string;
  activity_type: string;
  activity_title: string;
  activity_id: number | null;
  result_score: number | null;
  result_details: Record<string, unknown> | null;
  duration_seconds: number | null;
  created_at: string;
}

export interface DailyActivityCreatePayload {
  activity_type: string;
  activity_title: string;
  activity_id?: number | null;
  result_score?: number | null;
  result_details?: Record<string, unknown> | null;
  duration_seconds?: number | null;
}

export interface DailyActivitySummarySchema {
  activity_date: string;
  total_activities: number;
  activities_by_type: Record<string, number>;
  activities: DailyActivity[];
  total_duration_seconds: number;
  average_score: number | null;
  first_activity_at: string | null;
  last_activity_at: string | null;
}

export type DiverseRating = 'knew' | 'partial' | 'unknown';

export interface CodingTopic {
  id: string;
  topic: string;
  done: boolean;
  answer?: string;
  code_example?: string | null;
  /** Spaced-repetition state for the "Diverso" study mode */
  last_rating?: DiverseRating | null;
  review_count?: number;
  last_reviewed?: string | null;
}

export interface DiverseLessonBlock {
  id: string;
  title: string;
  topic_ids: string[];
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
  id: string;
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

export interface VocabularyReviewCard {
  card_type: 'vocabulary';
  review_item_id: number;
  word_en: string;
  word_pt: string;
  prompt: string;
  answer: string;
  options: string[];
  difficulty_score: number;
  error_count: number;
}

export interface LessonQuestionReviewCard {
  card_type: 'lesson_question';
  lesson_question_id: number;
  lesson_id: number;
  prompt: string;
  answer: string;
  question_type: string;
  supporting_example: string | null;
  difficulty_score: number;
  error_count: number;
}

export type ReviewCard = VocabularyReviewCard | LessonQuestionReviewCard;

export interface ReviewSession<TCard extends ReviewCard = ReviewCard> {
  total_due: number;
  items: TCard[];
}

export interface ReviewSessionOptions {
  /** Restrict the response to cards supported by vocabulary-only review screens. */
  vocabularyOnly?: boolean;
}

export interface ReviewAttemptResult {
  card_type: 'vocabulary' | 'lesson_question';
  card_id: number;
  difficulty_score: number;
  next_review: string;
  error_count: number;
  correct_count: number;
}

export type ReviewAttemptPayload =
  | {
      card_type: 'vocabulary';
      review_item_id?: number;
      word_en: string;
      word_pt: string;
      correct: boolean;
    }
  | {
      card_type: 'lesson_question';
      lesson_question_id: number;
      correct: boolean;
    };

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
  theme: string;
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
  num_pages: number;  // 1-5
  theme: string;      // contexto obrigatório do livro
}

// Uma conta nova fica em "pending" ate o administrador aprovar.
export type AccountStatus = 'pending' | 'approved' | 'rejected';

export interface UserProfile {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  created_at: string;
  status: AccountStatus;
  is_admin: boolean;
  // Which optional modules this account switched on. Absent on an older backend,
  // in which case the UI falls back to showing everything it always showed.
  modules?: Record<string, boolean>;
}

export interface BillingPlan {
  code: string;
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  interval: string;
  // -1 means unlimited, in both fields.
  max_children: number;
  monthly_ai_generations: number;
  trial_days: number;
}

export interface BillingSubscription {
  plan: BillingPlan;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  children_used: number;
  generations_used: number;
  generations_remaining: number;
  month_cost_cents: number;
  provider: string;
}

export interface ModuleInfo {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  locked: boolean;
}

export interface ModuleSettings {
  modules: ModuleInfo[];
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
  context?: string;
  api_key?: string;
  provider?: string;
  generation_mode?: 'discovery' | 'topic' | 'lesson';
}

export interface GeneratedFlashcard {
  topic: string;
  answer: string;
  code_example?: string | null;
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
  use_global_key: boolean;
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
  use_global_key?: boolean;
}

export interface AICredits {
  credits: number;
  used: number;
  total_used: number;
  daily_limit: number;
  unlimited: boolean;
  /** False for the admin and for anyone on their own key: nothing to meter. */
  metered: boolean;
}

export interface AdminUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  auth_provider: string;
  created_at: string;
  status: AccountStatus;
  is_admin: boolean;
  reviewed_at: string | null;
  review_note: string | null;
  ai_settings: UserAISettings;
  ai_credits: AICredits;
}

export type AdminNotificationType =
  | 'account_approval_requested'
  | 'account_approved'
  | 'account_rejected';

export interface AdminNotification {
  id: string;
  type: AdminNotificationType;
  user_id: number;
  user_name: string;
  user_email: string;
  status: AccountStatus;
  occurred_at: string;
}

export interface AdminOverview {
  total_users: number;
  pending_users: number;
  approved_users: number;
  rejected_users: number;
  signups_last_7_days: number;
  children: number;
  ai_authorized_users: number;
  out_of_credit_users: number;
  ai_credits_spent: number;
  recent_notifications: AdminNotification[];
}

// ── Coding Curriculum ──────────────────────────────────────────────────────

export interface ProgrammingSubject {
  id: number;
  child_id: number;
  name: string;
  description: string | null;
  context: string | null;
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
  has_summary?: boolean;
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

export interface ProgrammingQuestion {
  id: number;
  topic_id: number;
  subject_id: number;
  question: string;
  options: string[];
  correct_option: string;
  explanation: string;
  attempt_count: number;
  correct_count: number;
  error_count: number;
  last_selected_option: string | null;
  last_answered_at: string | null;
  created_at: string;
}

export interface GenerateProgrammingQuestionsPayload {
  context?: string;
}

export interface ProgrammingQuestionAttemptResult {
  question_id: number;
  correct: boolean;
  attempt_count: number;
  correct_count: number;
  error_count: number;
  last_selected_option: string;
  last_answered_at: string;
}

// ── Exam simulado ─────────────────────────────────────────────────────────────

export interface ExamDomain {
  name: string;
  weight: number;
}

export interface Exam {
  id: number;
  code: string;
  name: string;
  subject_id: number | null;
  question_count: number;
  duration_minutes: number;
  passing_percent: number;
  /** Empty for a general simulado: no per-domain blueprint, just the pool. */
  domains: ExamDomain[];
  created_at: string;
}

export interface ExamPoolDomain extends ExamDomain {
  available: number;
  target: number;
}

export interface ExamOverview {
  exam: Exam;
  pool_size: number;
  pool_by_domain: ExamPoolDomain[];
  best_score_percent: number | null;
  attempts_count: number;
  /** Set while a sitting is open, so the list offers to continue it. */
  active_attempt_id: number | null;
  active_seconds_remaining: number | null;
}

/** What the client may see while a sitting is open: no answer key, no explanation. */
export interface ExamAttemptQuestion {
  id: number;
  order_index: number;
  domain: string;
  question: string;
  options: string[];
  response_type: 'single' | 'multiple';
}

export interface ExamAttempt {
  id: number;
  exam_id: number;
  status: 'in_progress' | 'finished' | 'expired';
  started_at: string;
  finished_at: string | null;
  duration_seconds: number | null;
  question_count: number;
  correct_count: number;
  score_percent: number | null;
  passed: boolean | null;
  domain_breakdown: Record<string, { total: number; correct: number }>;
}

export interface ExamAttemptAnswerState {
  exam_question_id: number;
  selected_options: string[];
}

export interface ExamAttemptStart {
  attempt: ExamAttempt;
  exam: Exam;
  questions: ExamAttemptQuestion[];
  /** What was already marked, so a resumed sitting comes back filled in. */
  answers: ExamAttemptAnswerState[];
  /** Counted from when the attempt started, not from when the screen opened. */
  seconds_remaining: number;
  resumed: boolean;
}

export interface ExamQuestionFull {
  id: number;
  exam_id: number;
  domain: string;
  question: string;
  options: string[];
  correct_options: string[];
  response_type: 'single' | 'multiple';
  explanation: string;
  reference_url: string | null;
  difficulty: string;
  created_at: string;
}

export interface ExamAttemptReviewItem {
  question: ExamQuestionFull;
  selected_options: string[];
  correct: boolean;
}

export interface ExamAttemptResult {
  attempt: ExamAttempt;
  exam: Exam;
  review: ExamAttemptReviewItem[];
}

/** Study areas outside the programming curriculum that support the simulado. */
export type StudyQuestionArea = 'diverse' | 'english';

export interface StudyQuestion {
  id: number;
  area: StudyQuestionArea;
  subject_name: string;
  topic_key: string;
  topic_title: string;
  question: string;
  options: string[];
  correct_option: string;
  explanation: string;
  attempt_count: number;
  correct_count: number;
  error_count: number;
  last_selected_option: string | null;
  last_answered_at: string | null;
  created_at: string;
}

export interface StudyQuestionTarget {
  area: StudyQuestionArea;
  subject_name: string;
  topic_key: string;
  topic_title: string;
}

export interface StudyQuestionAttemptResult {
  question_id: number;
  correct: boolean;
  attempt_count: number;
  correct_count: number;
  error_count: number;
  last_selected_option: string;
  last_answered_at: string;
}

export interface DeepenCodingReadingPayload {
  step_type: 'section' | 'quiz';
  title?: string;
  body?: string;
  code_example?: string | null;
  question?: string;
  options?: string[];
  correct_option?: string;
  explanation?: string;
  user_question?: string;
}

export interface DeepenCodingReadingResponse {
  content: string;
}

export interface TopicSummary {
  topic_id: number;
  title: string;
  content: string;
}

export interface PendingSummaryTopic {
  topic_id: number;
  title: string;
}

export interface CodingSubjectSummary {
  content: string;
  topic_count: number;
  summarized_count: number;
  pending: PendingSummaryTopic[];
  estimated_credits: number;
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

export type ReviewRating = 'knew' | 'partial' | 'unknown';

// ── Flashcard deck (Anki-style) ────────────────────────────────────────────
export type DeckRating = 'again' | 'hard' | 'good' | 'easy';
export type DeckCardStateName = 'new' | 'learning' | 'review' | 'relearning';

export interface DeckConfig {
  new_per_day: number;
  max_reviews_per_day: number;
  learning_steps: string;
  relearning_steps: string;
  graduating_interval: number;
  easy_interval: number;
  desired_retention: number;
  maximum_interval: number;
  insertion_order: 'sequential' | 'random';
  new_cards_ignore_review_limit: boolean;
  leech_threshold: number;
  leech_action: 'tag' | 'suspend';
  fsrs_parameters: string;
}

export interface DeckStats {
  total: number;
  new: number;
  learning: number;
  review_due: number;
  new_left_today: number;
  reviews_left_today: number;
}

export interface DeckCard {
  review_item_id: number;
  flashcard_id: number;
  topic_id: number;
  topic_title: string;
  front: string;
  back: string;
  code_example: string | null;
  state: DeckCardStateName;
  due: string;
  interval_label: string;
  reps: number;
  lapses: number;
  suspended: boolean;
  is_leech: boolean;
}

export interface DeckOverview {
  subject_id: number;
  subject_name: string;
  config: DeckConfig;
  stats: DeckStats;
  cards: DeckCard[];
}

export interface DeckStudyCard {
  review_item_id: number;
  flashcard_id: number;
  topic_title: string;
  front: string;
  back: string;
  code_example: string | null;
  state: DeckCardStateName;
  previews: Record<DeckRating, string>;
}

export interface DeckStudySession {
  stats: DeckStats;
  items: DeckStudyCard[];
}

export interface DeckAttemptResult {
  review_item_id: number;
  state: DeckCardStateName;
  next_review: string;
  interval_label: string;
  stats: DeckStats;
}

export interface LeetCodeMethod {
  id: number;
  name: string;
  category: string | null;
  language: string;
  explanation: string;
  code_example: string;
  example_output: string;
  complexity_time: string | null;
  complexity_space: string | null;
  order_index: number;
  created_at: string;
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

function isSafeRetryRequest(options: RequestInit) {
  const method = (options.method || 'GET').toUpperCase();
  return method === 'GET' || method === 'HEAD';
}

async function performApiFetch(url: string, options: RequestInit) {
  const activeChildId = getStoredActiveChildId();
  const sessionToken = USE_TOKEN_AUTH ? getSessionToken() : null;

  return fetch(url, {
    ...options,
    // Mantem o cookie para o fluxo same-site (desktop); o token cobre o celular.
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(activeChildId ? { 'X-Child-ID': String(activeChildId) } : {}),
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...options.headers,
    },
    cache: 'no-store',
  });
}

export async function fetchAPI<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const apiBaseUrl = await resolveApiBaseUrl();
  if (!apiBaseUrl) {
    throw new ApiError('Este aparelho ainda nao esta conectado a um backend. Rode o launcher com o tunnel ativo ou abra a pagina de conexao e salve a URL atual do tunnel.', {
      code: 'unconfigured',
    });
  }
  if (shouldSyncPreferredChild(endpoint, options)) {
    await syncPreferredChild(apiBaseUrl);
  }

  let response: Response;
  try {
    response = await performApiFetch(`${apiBaseUrl}${endpoint}`, options);
  } catch (error) {
    console.error('API call failed:', error);
    if (isSafeRetryRequest(options)) {
      const fallbackBaseUrl = await resolveApiBaseUrlAfterOfflineFailure(apiBaseUrl);
      if (fallbackBaseUrl) {
        try {
          if (shouldSyncPreferredChild(endpoint, options)) {
            await syncPreferredChild(fallbackBaseUrl);
          }
          response = await performApiFetch(`${fallbackBaseUrl}${endpoint}`, options);
          clearSavedApiBaseUrl();
        } catch (fallbackError) {
          console.error('API fallback call failed:', fallbackError);
          throw new ApiError('O tutor nao conseguiu acessar o backend.', {
            code: 'offline',
          });
        }
      } else {
        throw new ApiError('O tutor nao conseguiu acessar o backend.', {
          code: 'offline',
        });
      }
    } else {
      throw new ApiError('O tutor nao conseguiu acessar o backend.', {
        code: 'offline',
      });
    }
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
function getReviewSession(
  limit: number,
  options: { vocabularyOnly: true },
): Promise<ReviewSession<VocabularyReviewCard>>;
function getReviewSession(limit?: number, options?: ReviewSessionOptions): Promise<ReviewSession>;
function getReviewSession(
  limit = 5,
  { vocabularyOnly = false }: ReviewSessionOptions = {},
): Promise<ReviewSession> {
  return fetchAPI<ReviewSession>(
    `/api/review?limit=${limit}${vocabularyOnly ? '&vocabulary_only=true' : ''}`,
  );
}

export const api = {
  request: fetchAPI,
  getNextLesson: () => fetchAPI<Lesson>('/api/lesson/next'),
  getTodayLesson: () => fetchAPI<Lesson>('/api/lesson/today'),
  getAllLessons: () => fetchAPI<LessonSummary[]>('/api/lessons'),
  getLessonById: (id: number) => fetchAPI<Lesson>(`/api/lesson/${id}`),
  generateLessonQuestions: (lessonId: number, context?: string) =>
    fetchAPI<LessonQuestion[]>(`/api/lessons/${lessonId}/questions/generate`, {
      method: 'POST',
      body: JSON.stringify({ context: context?.trim() || null }),
    }),
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
  generateDiverseQuestions: (payload: {
    study_date: string;
    subject_index: number;
    lesson_id: string;
    context?: string;
  }) => fetchAPI<CodingTopic[]>('/api/study/diverse/questions/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  getTodayQuiz: (lessonId?: number) =>
    fetchAPI<Quiz>(lessonId ? `/api/quiz/today?lesson_id=${lessonId}` : '/api/quiz/today'),
  submitQuiz: (payload: {
    lesson_id: number;
    score: number;
    total_questions: number;
    answers?: Array<{
      question_number: number;
      question: string;
      selected_option: string;
      correct: boolean;
    }>;
  }) =>
    fetchAPI<QuizSubmitResponse>('/api/quiz/submit', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getReviewSession,
  submitReviewAttempt: (payload: ReviewAttemptPayload) =>
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
  userLogin: async (email: string, password: string) => {
    const result = await fetchAPI<{
      status: string;
      name: string;
      token?: string;
      account_status: AccountStatus;
    }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
    );
    if (USE_TOKEN_AUTH && result.token) {
      setSessionToken(result.token);
      clearActiveChildId();
      const apiBaseUrl = await resolveApiBaseUrl();
      if (apiBaseUrl) {
        await syncPreferredChild(apiBaseUrl);
      }
    }
    return result;
  },
  getUserMe: () => {
    const now = Date.now();
    if (userMeCache && now - userMeCache.at < USER_ME_CACHE_MS) return userMeCache.promise;
    const promise = fetchAPI<UserProfile>('/api/auth/me');
    userMeCache = { at: now, promise };
    // A rejected profile must not be cached, or a transient blip locks the user out
    // for the whole TTL.
    promise.catch(() => { if (userMeCache?.promise === promise) invalidateUserMeCache(); });
    return promise;
  },
  // Skips the short /api/auth/me cache: used by the "aguardando aprovacao"
  // screen, where the whole point is to see a status that just changed.
  refreshUserMe: () => {
    invalidateUserMeCache();
    const promise = fetchAPI<UserProfile>('/api/auth/me');
    userMeCache = { at: Date.now(), promise };
    promise.catch(() => { if (userMeCache?.promise === promise) invalidateUserMeCache(); });
    return promise;
  },
  forgotPassword: (email: string) =>
    fetchAPI<{ detail: string }>('/api/auth/password/forgot', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    fetchAPI<void>('/api/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),
  verifyEmail: (token: string) =>
    fetchAPI<UserProfile>('/api/auth/email/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  resendVerificationEmail: (email: string) =>
    fetchAPI<{ detail: string }>('/api/auth/email/resend', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  changeOwnPassword: (currentPassword: string, newPassword: string) =>
    fetchAPI<void>('/api/account/password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),
  revokeOwnSessions: () =>
    fetchAPI<void>('/api/account/sessions/revoke', { method: 'POST' }),
  exportOwnAccount: () => fetchAPI<Record<string, unknown>>('/api/account/export'),
  deleteOwnAccount: (password: string) =>
    fetchAPI<{ status: string; removed: Record<string, number> }>('/api/account/delete', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  listBillingPlans: () => fetchAPI<BillingPlan[]>('/api/billing/plans'),
  getMySubscription: () => fetchAPI<BillingSubscription>('/api/billing/subscription'),
  startCheckout: (planCode: string) =>
    fetchAPI<{ checkout_url: string | null; detail: string }>('/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan_code: planCode }),
    }),
  getAccountModules: () => fetchAPI<ModuleSettings>('/api/account/modules'),
  updateAccountModules: async (modules: Record<string, boolean>) => {
    const result = await fetchAPI<ModuleSettings>('/api/account/modules', {
      method: 'PUT',
      body: JSON.stringify({ modules }),
    });
    // The navigation reads the switches from /api/auth/me, so the cached copy
    // would keep hiding a module the user just switched on.
    invalidateUserMeCache();
    return result;
  },
  userLogout: async () => {
    try {
      return await fetchAPI<{ status: string }>('/api/auth/logout', {
        method: 'POST',
      });
    } finally {
      clearSessionToken();
    }
  },
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
  adminSystemHealth: () =>
    fetchAPI<{ status: string; database: string; timestamp: string }>('/api/admin/health'),
  adminListUsers: (status?: AccountStatus) =>
    fetchAPI<AdminUser[]>(status ? `/api/admin/users?status=${status}` : '/api/admin/users'),
  adminOverview: () => fetchAPI<AdminOverview>('/api/admin/overview'),
  adminApproveUser: (userId: number, note?: string) =>
    fetchAPI<AdminUser>(`/api/admin/users/${userId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ note: note ?? null }),
    }),
  adminRejectUser: (userId: number, note?: string) =>
    fetchAPI<AdminUser>(`/api/admin/users/${userId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ note: note ?? null }),
    }),
  adminDeleteUser: (userId: number) =>
    fetchAPI<{ status: string; removed: Record<string, number> }>(`/api/admin/users/${userId}`, {
      method: 'DELETE',
    }),
  adminSaveUserAISettings: (userId: number, payload: UserAISettingsPayload) =>
    fetchAPI<UserAISettings>(`/api/admin/users/${userId}/ai-settings`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  getMyAICredits: () => fetchAPI<AICredits>('/api/ai/credits'),
  adminSetUserAICredits: (
    userId: number,
    payload: { credits?: number; add?: number; daily_limit?: number; unlimited?: boolean },
  ) =>
    fetchAPI<AdminUser>(`/api/admin/users/${userId}/ai-credits`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  adminRevokeUserAI: (userId: number) =>
    fetchAPI<UserAISettings>(`/api/admin/users/${userId}/ai-settings`, { method: 'DELETE' }),
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
  createCodingSubject: (payload: { name: string; description?: string; context?: string; icon_emoji?: string }) =>
    fetchAPI<ProgrammingSubject>('/api/coding/subjects', { method: 'POST', body: JSON.stringify(payload) }),
  updateCodingSubject: (id: number, payload: { name?: string; description?: string; context?: string; icon_emoji?: string }) =>
    fetchAPI<ProgrammingSubject>(`/api/coding/subjects/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteCodingSubject: (id: number) =>
    fetchAPI<void>(`/api/coding/subjects/${id}`, { method: 'DELETE' }),
  getCodingTopics: (subjectId: number) =>
    fetchAPI<ProgrammingTopic[]>(`/api/coding/subjects/${subjectId}/topics`),
  createCodingTopic: (subjectId: number, payload: { title: string; order_index?: number; generate_ai?: boolean; context?: string }) =>
    fetchAPI<ProgrammingTopic>(`/api/coding/subjects/${subjectId}/topics`, { method: 'POST', body: JSON.stringify(payload) }),
  generateCodingTopic: (subjectId: number) =>
    fetchAPI<ProgrammingTopic>(`/api/coding/subjects/${subjectId}/topics/generate`, { method: 'POST' }),
  updateCodingTopic: (id: number, payload: { title?: string; order_index?: number; status?: string; notes?: string; ai_content?: object }) =>
    fetchAPI<ProgrammingTopic>(`/api/coding/topics/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteCodingTopic: (id: number) =>
    fetchAPI<void>(`/api/coding/topics/${id}`, { method: 'DELETE' }),
  generateCodingTopicContent: (id: number, payload?: { context?: string }) => {
    const contextText = payload?.context?.trim();
    return fetchAPI<ProgrammingTopic>(`/api/coding/topics/${id}/generate`, {
      method: 'POST',
      ...(contextText ? { body: JSON.stringify({ context: contextText }) } : {}),
    });
  },
  deepenCodingReadingStep: (topicId: number, payload: DeepenCodingReadingPayload) =>
    fetchAPI<DeepenCodingReadingResponse>(`/api/coding/topics/${topicId}/reading/deepen`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getTopicFlashcards: (topicId: number) =>
    fetchAPI<ProgrammingFlashcard[]>(`/api/coding/topics/${topicId}/flashcards`),
  generateAdditionalCodingFlashcards: (topicId: number, context?: string) =>
    fetchAPI<ProgrammingFlashcard[]>(`/api/coding/topics/${topicId}/flashcards/generate`, {
      method: 'POST',
      body: JSON.stringify({ context: context?.trim() || null }),
    }),
  getTopicQuestions: (topicId: number) =>
    fetchAPI<ProgrammingQuestion[]>(`/api/coding/topics/${topicId}/questions`),
  /** The exam-focused sheet of one topic. Reuses the stored one unless regenerating. */
  generateTopicSummary: (topicId: number, regenerate = false) =>
    fetchAPI<TopicSummary>(`/api/coding/topics/${topicId}/summary?regenerate=${regenerate}`, {
      method: 'POST',
    }),
  saveTopicSummary: (topicId: number, content: string) =>
    fetchAPI<TopicSummary>(`/api/coding/topics/${topicId}/summary`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
  /** The topic sheets joined in study order, plus the topics still missing one. */
  getSubjectSummary: (subjectId: number) =>
    fetchAPI<CodingSubjectSummary>(`/api/coding/subjects/${subjectId}/summary`),
  getExams: () => fetchAPI<ExamOverview[]>('/api/exams'),
  createExam: (payload: {
    name: string;
    code?: string;
    subject_id?: number | null;
    question_count?: number;
    passing_percent?: number;
    domains?: ExamDomain[];
  }) =>
    fetchAPI<Exam>('/api/exams', { method: 'POST', body: JSON.stringify(payload) }),
  startExamAttempt: (examId: number) =>
    fetchAPI<ExamAttemptStart>(`/api/exams/${examId}/attempts`, { method: 'POST' }),
  recordExamAnswer: (attemptId: number, payload: { exam_question_id: number; selected_options: string[] }) =>
    fetchAPI<void>(`/api/exams/attempts/${attemptId}/answers`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  finishExamAttempt: (attemptId: number) =>
    fetchAPI<ExamAttemptResult>(`/api/exams/attempts/${attemptId}/finish`, { method: 'POST' }),
  getExamAttempts: (examId: number) => fetchAPI<ExamAttempt[]>(`/api/exams/${examId}/attempts`),
  generateCodingTopicQuestions: (topicId: number, payload: GenerateProgrammingQuestionsPayload = {}) =>
    fetchAPI<ProgrammingQuestion[]>(`/api/coding/topics/${topicId}/questions/generate`, {
      method: 'POST',
      body: JSON.stringify({ context: payload.context?.trim() || null }),
    }),
  submitCodingTopicQuestionAttempt: (questionId: number, payload: { selected_option: string }) =>
    fetchAPI<ProgrammingQuestionAttemptResult>(`/api/coding/questions/${questionId}/attempt`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getStudyQuestions: (target: StudyQuestionTarget) =>
    fetchAPI<StudyQuestion[]>(
      `/api/study/questions?area=${encodeURIComponent(target.area)}` +
        `&subject_name=${encodeURIComponent(target.subject_name)}` +
        `&topic_key=${encodeURIComponent(target.topic_key)}`,
    ),
  generateStudyQuestions: (target: StudyQuestionTarget, context?: string) =>
    fetchAPI<StudyQuestion[]>('/api/study/questions/generate', {
      method: 'POST',
      body: JSON.stringify({ ...target, context: context?.trim() || null }),
    }),
  submitStudyQuestionAttempt: (questionId: number, payload: { selected_option: string }) =>
    fetchAPI<StudyQuestionAttemptResult>(`/api/study/questions/${questionId}/attempt`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createTopicFlashcard: (topicId: number, payload: { front: string; back: string; code_example?: string }) =>
    fetchAPI<ProgrammingFlashcard>(`/api/coding/topics/${topicId}/flashcards`, { method: 'POST', body: JSON.stringify(payload) }),
  updateCodingFlashcard: (id: number, payload: { front?: string; back?: string; code_example?: string }) =>
    fetchAPI<ProgrammingFlashcard>(`/api/coding/flashcards/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteCodingFlashcard: (id: number) =>
    fetchAPI<void>(`/api/coding/flashcards/${id}`, { method: 'DELETE' }),
  getCodingReview: (subjectId?: number, limit = 20) =>
    fetchAPI<CodingReviewSession>(`/api/coding/review?limit=${limit}${subjectId ? `&subject_id=${subjectId}` : ''}`),
  submitCodingReviewAttempt: (payload: { review_item_id: number; rating: ReviewRating }) =>
    fetchAPI<CodingReviewAttemptResult>('/api/coding/review/attempt', { method: 'POST', body: JSON.stringify(payload) }),
  // Flashcard deck (Anki-style FSRS)
  getDeckOverview: (subjectId: number) =>
    fetchAPI<DeckOverview>(`/api/coding/subjects/${subjectId}/deck`),
  updateDeckConfig: (subjectId: number, payload: Partial<DeckConfig>) =>
    fetchAPI<DeckConfig>(`/api/coding/subjects/${subjectId}/deck/config`, { method: 'PUT', body: JSON.stringify(payload) }),
  getDeckStudy: (subjectId: number, limit = 50) =>
    fetchAPI<DeckStudySession>(`/api/coding/subjects/${subjectId}/deck/study?limit=${limit}`),
  submitDeckAttempt: (payload: { review_item_id: number; rating: DeckRating }) =>
    fetchAPI<DeckAttemptResult>('/api/coding/deck/attempt', { method: 'POST', body: JSON.stringify(payload) }),
  createDeckCard: (subjectId: number, payload: { front: string; back: string; code_example?: string; topic_id?: number }) =>
    fetchAPI<ProgrammingFlashcard>(`/api/coding/subjects/${subjectId}/deck/cards`, { method: 'POST', body: JSON.stringify(payload) }),
  // LeetCode trainer
  getLeetCodeMethods: () =>
    fetchAPI<LeetCodeMethod[]>('/api/coding/leetcode'),
  generateLeetCodeMethod: (payload: { hint?: string; language?: string }) =>
    fetchAPI<LeetCodeMethod>('/api/coding/leetcode/generate', { method: 'POST', body: JSON.stringify(payload) }),
  deleteLeetCodeMethod: (id: number) =>
    fetchAPI<void>(`/api/coding/leetcode/${id}`, { method: 'DELETE' }),
  // Daily Activity Tracking
  logActivity: (payload: DailyActivityCreatePayload) =>
    fetchAPI<DailyActivity>('/api/activity/log', { method: 'POST', body: JSON.stringify(payload) }),
  getTodayActivities: () =>
    fetchAPI<DailyActivitySummarySchema>('/api/activity/today'),
  getDayActivities: (date: string) =>
    fetchAPI<DailyActivitySummarySchema>(`/api/activity/day/${date}`),
  getWeekActivities: () =>
    fetchAPI<DailyActivitySummarySchema[]>('/api/activity/week'),
  getActivityMonth: () =>
    fetchAPI<DailyActivitySummarySchema[]>('/api/activity/month'),
};
