export type ReviewConfidenceValue = 0 | 1 | 2 | 3;

export interface MixedReviewTransitionState {
  currentIndex: number;
  total: number;
  flipped: boolean;
  chosenConfidence: ReviewConfidenceValue | null;
  lessonAnswerRevealed: boolean;
  submissionLocked: boolean;
  advancementLocked: boolean;
  completed: boolean;
}

export function createMixedReviewState(total: number): MixedReviewTransitionState {
  return {
    currentIndex: 0,
    total,
    flipped: false,
    chosenConfidence: null,
    lessonAnswerRevealed: false,
    submissionLocked: false,
    advancementLocked: false,
    completed: false,
  };
}

export function beginMixedReviewSubmission(state: MixedReviewTransitionState): {
  state: MixedReviewTransitionState;
  accepted: boolean;
} {
  if (
    state.submissionLocked
    || state.advancementLocked
    || state.chosenConfidence !== null
    || state.completed
  ) {
    return { state, accepted: false };
  }
  return { state: { ...state, submissionLocked: true }, accepted: true };
}

export function beginMixedReviewAdvancement(state: MixedReviewTransitionState): {
  state: MixedReviewTransitionState;
  accepted: boolean;
} {
  if (state.advancementLocked || state.completed) {
    return { state, accepted: false };
  }
  return { state: { ...state, advancementLocked: true }, accepted: true };
}

export function revealMixedReviewLessonAnswer(state: MixedReviewTransitionState): {
  state: MixedReviewTransitionState;
  accepted: boolean;
} {
  if (state.submissionLocked || state.advancementLocked || state.completed) {
    return { state, accepted: false };
  }
  return { state: { ...state, lessonAnswerRevealed: true }, accepted: true };
}

export function advanceMixedReview(state: MixedReviewTransitionState): MixedReviewTransitionState {
  if (state.completed || state.total <= 0) return state;
  if (state.currentIndex >= state.total - 1) {
    return { ...state, submissionLocked: true, advancementLocked: true, completed: true };
  }
  return {
    ...state,
    currentIndex: state.currentIndex + 1,
    flipped: false,
    chosenConfidence: null,
    lessonAnswerRevealed: false,
    submissionLocked: false,
    advancementLocked: false,
  };
}

type VocabularyAttemptCard = {
  card_type: 'vocabulary';
  review_item_id: number;
  word_en: string;
  word_pt: string;
};

type LessonQuestionAttemptCard = {
  card_type: 'lesson_question';
  lesson_question_id: number;
};

type ReviewAttemptCard = VocabularyAttemptCard | LessonQuestionAttemptCard;

export interface CapturedReviewAttempt {
  sessionEpoch: number;
  cardType: ReviewAttemptCard['card_type'];
  cardId: number;
}

function reviewAttemptCardId(card: ReviewAttemptCard): number {
  return card.card_type === 'vocabulary' ? card.review_item_id : card.lesson_question_id;
}

export function captureReviewAttempt(
  sessionEpoch: number,
  card: ReviewAttemptCard,
): CapturedReviewAttempt {
  return {
    sessionEpoch,
    cardType: card.card_type,
    cardId: reviewAttemptCardId(card),
  };
}

export function isReviewAttemptCompletionCurrent(
  captured: CapturedReviewAttempt,
  currentSessionEpoch: number,
  currentCard: ReviewAttemptCard | null,
): boolean {
  return currentCard !== null
    && captured.sessionEpoch === currentSessionEpoch
    && captured.cardType === currentCard.card_type
    && captured.cardId === reviewAttemptCardId(currentCard);
}

export function buildReviewAttemptPayload(
  card: ReviewAttemptCard,
  correct: boolean,
) {
  if (card.card_type === 'lesson_question') {
    return {
      card_type: 'lesson_question' as const,
      lesson_question_id: card.lesson_question_id,
      correct,
    };
  }
  return {
    card_type: 'vocabulary' as const,
    review_item_id: card.review_item_id,
    word_en: card.word_en,
    word_pt: card.word_pt,
    correct,
  };
}

export type LessonQuestionGenerationOutcome =
  | { kind: 'confirmed'; count: number; reloaded: boolean }
  | { kind: 'uncertain'; reloaded: boolean }
  | { kind: 'definite_failure'; error: unknown }
  | { kind: 'stale' };

export async function runLessonQuestionGeneration<TQuestion>(options: {
  lessonId: number;
  generate: () => Promise<readonly TQuestion[]>;
  validate: (questions: readonly TQuestion[], lessonId: number) => readonly TQuestion[];
  reload: () => Promise<boolean>;
  isCurrent: () => boolean;
  isUncertainError: (error: unknown) => boolean;
}): Promise<LessonQuestionGenerationOutcome> {
  let confirmedQuestions: readonly TQuestion[];
  try {
    const response = await options.generate();
    confirmedQuestions = options.validate(response, options.lessonId);
  } catch (error) {
    if (!options.isCurrent()) return { kind: 'stale' };
    if (!options.isUncertainError(error)) return { kind: 'definite_failure', error };

    let reloaded = false;
    try {
      reloaded = await options.reload();
    } catch {
      reloaded = false;
    }
    if (!options.isCurrent()) return { kind: 'stale' };
    return { kind: 'uncertain', reloaded };
  }

  if (!options.isCurrent()) return { kind: 'stale' };
  let reloaded = false;
  try {
    reloaded = await options.reload();
  } catch {
    reloaded = false;
  }
  if (!options.isCurrent()) return { kind: 'stale' };
  return { kind: 'confirmed', count: confirmedQuestions.length, reloaded };
}
