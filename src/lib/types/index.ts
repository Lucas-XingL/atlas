// Shared TypeScript types — mirror the Supabase schema.

export type AtlasStatus = "active" | "archived";

export type KnowledgeDomain =
  | "tech"
  | "finance"
  | "art"
  | "science"
  | "practical"
  | "humanities"
  | "other";

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
  knowledge_domain: KnowledgeDomain | null;
  status: AtlasStatus;
  created_at: string;
  updated_at: string;
}

export type SourceStatus = "unread" | "reading" | "read" | "dismissed";
export type SourceType = "web" | "text" | "pdf" | "video" | "arxiv";
export type ResourceType = "consumable" | "external" | "physical";
export type FetchStatus = "pending" | "fetching" | "summarizing" | "ready" | "failed";
export type SourceOrigin = "path" | "subscription" | "manual";

export interface SourceSummary {
  tl_dr?: string;
  key_claims?: string[];
  quotes?: Array<{ text: string; note?: string }>;
  why_relevant?: string;
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
  resource_type: ResourceType;
  path_resource_id: string | null;
  reading_progress: number;
  origin: SourceOrigin;
  origin_ref: string | null;
  raw_content: string | null;
  pdf_storage_path: string | null;
  summary: SourceSummary;
  status: SourceStatus;
  ai_recommended: boolean;
  fetch_status: FetchStatus;
  fetch_error: string | null;
  wiki_ingested_at: string | null;
  wiki_page_id: string | null;
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

export type PathResourceTier = "core" | "extra";
export type PathResourceUserStatus =
  | "suggested"
  | "accepted"
  | "reading"
  | "finished"
  | "skipped";

export interface PathResource {
  id: string;
  stage_id: string;
  res_order: number;
  tier: PathResourceTier;
  resource_type: ResourceType;
  title: string;
  url: string | null;
  author: string | null;
  why_relevant: string | null;
  search_hint: string | null;
  source_id: string | null;
  user_status: PathResourceUserStatus;
  created_at: string;
  updated_at: string;
}

export interface PathStage {
  id: string;
  path_id: string;
  stage_order: number;
  name: string;
  intent: string | null;
  est_duration: string | null;
  created_at: string;
  resources: PathResource[];
}

export interface LearningPath {
  id: string;
  atlas_id: string;
  user_id: string;
  version: number;
  overview: string | null;
  knowledge_domain: KnowledgeDomain | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  stages: PathStage[];
}

export interface Highlight {
  id: string;
  source_id: string;
  user_id: string;
  text: string;
  note: string | null;
  start_offset: number;
  end_offset: number;
  journal_entry_id: string | null;
  created_at: string;
}

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

// --- v3: source pipelines ---

export type SubscriptionSchedule = "hourly" | "daily";

export interface Subscription {
  id: string;
  atlas_id: string;
  user_id: string;
  feed_url: string;
  title: string;
  site_url: string | null;
  fetch_schedule: SubscriptionSchedule;
  is_active: boolean;
  last_fetched_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export type SubscriptionItemStatus = "new" | "in_pool" | "skipped";

export interface SubscriptionItem {
  id: string;
  subscription_id: string;
  user_id: string;
  external_id: string;
  title: string;
  url: string | null;
  author: string | null;
  published_at: string | null;
  summary_preview: string | null;
  user_status: SubscriptionItemStatus;
  source_id: string | null;
  fetched_at: string;
}

export interface ManualCandidate {
  id: string;
  atlas_id: string;
  user_id: string;
  url: string | null;
  text_snippet: string | null;
  title: string;
  note: string | null;
  created_at: string;
}

// --- v4: knowledge wiki ---

export type WikiPageKind = "source" | "concept" | "index" | "log" | "synthesis";

export interface WikiPage {
  id: string;
  atlas_id: string;
  user_id: string;
  slug: string;
  title: string;
  kind: WikiPageKind;
  body_md: string;
  frontmatter: Record<string, unknown>;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface WikiLink {
  id: string;
  atlas_id: string;
  from_page: string;
  to_slug: string;
  to_page: string | null;
  created_at: string;
}

export type WikiLogKind = "ingest" | "lint" | "manual";

export interface WikiLogEntry {
  id: string;
  atlas_id: string;
  user_id: string;
  kind: WikiLogKind;
  source_id: string | null;
  summary: string;
  pages_touched: Array<{
    slug: string;
    title: string;
    action: "created" | "updated" | "unchanged";
  }>;
  created_at: string;
}
