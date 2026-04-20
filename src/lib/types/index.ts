// Shared TypeScript types — mirror the Supabase schema.

export type AtlasStatus = "active" | "archived";

export interface Atlas {
  id: string;
  user_id: string;
  slug: string;
  name: string;
  thesis: string | null;
  tags: string[];
  scope_in: string[];
  scope_out: string[];
  framework: Record<string, unknown>;
  status: AtlasStatus;
  created_at: string;
  updated_at: string;
}

export type SourceStatus = "unread" | "reading" | "read" | "dismissed";
export type SourceType = "web" | "text" | "pdf" | "video" | "arxiv";
export type FetchStatus = "pending" | "fetching" | "summarizing" | "ready" | "failed";

export interface SourceSummary {
  tl_dr?: string;
  key_claims?: string[];
  quotes?: Array<{ text: string; note?: string }>;
}

export interface Source {
  id: string;
  atlas_id: string;
  user_id: string;
  url: string | null;
  title: string;
  author: string | null;
  pub_date: string | null;
  source_type: SourceType;
  raw_content: string | null;
  summary: SourceSummary;
  status: SourceStatus;
  ai_recommended: boolean;
  fetch_status: FetchStatus;
  fetch_error: string | null;
  ingested_at: string;
  updated_at: string;
}

export type JournalChannel = "web" | "voice" | "highlight";
export type JournalStatus = "raw" | "distilled" | "archived";

export interface JournalEntry {
  id: string;
  atlas_id: string | null;
  user_id: string;
  text: string;
  channel: JournalChannel;
  source_ref: string | null;
  status: JournalStatus;
  ai_annotations: Record<string, unknown>;
  created_at: string;
  processed_at: string | null;
}

export type FlashcardStage = "new" | "learning" | "review" | "mastered";
export type FlashcardOriginType = "journal" | "highlight" | "manual";
export type ReviewRating = "remembered" | "foggy" | "forgot";

export interface Flashcard {
  id: string;
  atlas_id: string;
  user_id: string;
  front: string;
  back: string;
  origin_type: FlashcardOriginType | null;
  origin_refs: string[];
  ease: number;
  interval_days: number;
  stage: FlashcardStage;
  next_review_at: string;
  review_count: number;
  success_count: number;
  maturity: number;
  last_rating: ReviewRating | null;
  created_at: string;
  updated_at: string;
}

export type DigestPeriod = "daily" | "weekly";

export interface DigestSnapshot {
  id: string;
  atlas_id: string;
  user_id: string;
  period: DigestPeriod;
  period_start: string;
  period_end: string;
  content: {
    markdown: string;
    stats: Record<string, number>;
  };
  created_at: string;
}

export type LlmProvider = "zhipu" | "minimax";

export interface UserSettings {
  user_id: string;
  timezone: string;
  default_atlas_id: string | null;
  morning_ritual_time: string;
  llm_provider: LlmProvider;
  llm_model_quality: string | null;
  llm_model_fast: string | null;
  llm_api_key: string | null;
  minimax_group_id: string | null;
  email_push_enabled: boolean;
  created_at: string;
  updated_at: string;
}
