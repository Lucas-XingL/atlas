import type { Flashcard, FlashcardStage, ReviewRating } from "@/lib/types";

interface SrState {
  ease: number;
  interval_days: number;
  stage: FlashcardStage;
  next_review_at: string;
  review_count: number;
  success_count: number;
  maturity: number;
  last_rating: ReviewRating;
}

const RATING_Q: Record<ReviewRating, number> = {
  remembered: 5,
  foggy: 3,
  forgot: 1,
};

/**
 * SM-2 update. Given the current card and a user rating, compute next state.
 */
export function applySm2(card: Flashcard, rating: ReviewRating): SrState {
  const q = RATING_Q[rating];
  let ease = card.ease;
  let interval_days = card.interval_days;
  const review_count = card.review_count + 1;
  let success_count = card.success_count;
  let stage: FlashcardStage = card.stage;

  if (q < 3) {
    interval_days = 1;
    stage = "learning";
  } else {
    success_count += 1;
    if (card.review_count === 0) {
      interval_days = 1;
    } else if (card.review_count === 1) {
      interval_days = 6;
    } else {
      interval_days = Math.max(1, Math.round(card.interval_days * ease));
    }

    ease = Math.max(1.3, ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    stage = interval_days > 21 ? "mastered" : "review";
  }

  const next = new Date(Date.now() + interval_days * 86_400_000).toISOString();
  // Maturity reflects long-term retention: a card you've held for 21 days is more
  // mature than one you just answered correctly for the first time.
  // interval 1d → 1, 3d → ~3, 21d → ~5, 100d → ~7, 300d → ~9, 1y → 10
  const maturity =
    interval_days <= 0 ? 0 : Math.min(10, Math.round(Math.log10(interval_days + 1) * 4));

  return {
    ease: round2(ease),
    interval_days,
    stage,
    next_review_at: next,
    review_count,
    success_count,
    maturity,
    last_rating: rating,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
