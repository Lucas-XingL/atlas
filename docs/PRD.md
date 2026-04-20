# Atlas — Product Requirements Document (v1)

> 个人化 AI 学习副驾驶。每个知识库（Atlas）有明确主题，AI 主动推源、提炼你的灵感、
> 跟踪学习轨迹，让你逐步建立有框架、有观点的深度理解。

---

## 1. Product Vision

### 1.1 Elevator Pitch

Obsidian / Roam 让你存笔记，Readwise 让你回顾高亮，Anki 让你背卡。
**Atlas 把三者合一，并加一个关键升级：AI 帮你挑料、帮你提炼、帮你记住。**

你每天做的只有三件事：
1. 看一眼 AI 推的新源（1 分钟，点赞 or 忽略）
2. 把随时想到的一句话发给 bot（5 秒）
3. 回 3 张 flashcard（1 分钟）

其他所有事：找源、写 summary、识别 concept、生成 synthesis、调度复习、生成周报 —— 全由 AI 做。

### 1.2 North Star Metric

**Weekly Active Insight Generation Rate**：每周产出 ≥1 张被用户认可的 flashcard。

这是最能说明"在真学习"的单一指标。如果用户每周产不出 1 条观点，说明产品没价值。

### 1.3 用户画像（明确为你本人）

- **身份**：软件工程师 + 技术 manager
- **设备**：MacBook + iPhone，频繁切换
- **现状**：习惯飞书 bot、用 Obsidian、有 Claude Code 付费
- **痛点**：
  1. 只 ingest 自己找的东西 → 信息偏食
  2. 随记没回溯 → 灵感被遗忘
  3. Obsidian 静态 → 缺少学习节奏推动

### 1.4 定位边界

| Atlas 是 | Atlas 不是 |
|---|---|
| 学习过程管理器 | Google Docs 代替 |
| 主题化 AI 副驾驶 | 通用笔记 app |
| 可导出的 Markdown | 私有格式 |
| 云端托管 | 离线优先 |

---

## 2. 核心概念

### 2.1 Atlas 是什么

> 一个 **Atlas = 一个主题 + 一组源 + 一股灵感流 + 一份深度沉淀 + 一个学习节奏**

每个 Atlas 自包含：独立的源/journal/flashcards/wiki，通过 `thesis` 字段声明主题意图。

### 2.2 对象模型

```
User ─┬─> Atlas[]
      ├─> Scratch (全局闪念池，跨 Atlas)
      └─> Settings (API key / 时区 / 推送偏好)

Atlas
 ├─ id, name, thesis, tags, scope_in, scope_out
 ├─ framework: JSONB  // AI 推导的学习树
 ├─ Sources[]         // 来源条目
 │   ├─ url | text_body
 │   ├─ title, author, pub_date, ingested_at
 │   ├─ ai_recommended: bool    // AI 推的 vs 用户主动的
 │   ├─ status: unread | reading | read | dismissed
 │   ├─ raw_content: text       // fetch 回来的原文
 │   └─ summary: { tl_dr, key_claims[], quotes[] }  // LLM 提炼
 ├─ JournalEntries[]  // 你的随记
 │   ├─ text, created_at, source: "feishu" | "web" | "voice"
 │   ├─ status: raw | distilled | archived
 │   └─ ai_annotations: { linked_concepts[], linked_sources[] }
 ├─ Flashcards[]      // 观点卡
 │   ├─ front, back
 │   ├─ origin: { type: "journal" | "highlight", ref_id }
 │   ├─ sr: { ease, interval, stage, next_review_at }
 │   ├─ maturity: 0-10  // 回忆次数 + 正确率
 │   └─ promoted_to_synthesis_id: nullable
 ├─ WikiPages[]       // 深度页面 (concept/entity/synthesis/question)
 │   ├─ type, title, slug, content (markdown)
 │   ├─ links_out[]   // 指向其它 WikiPage
 │   └─ backlinks[]   // 自动维护
 └─ DigestSnapshots[] // 周报/日报 archive
```

### 2.3 三条主线再 recap

| 主线 | 对象 | AI 职责 | 人的职责 |
|---|---|---|---|
| Source Discovery | `Sources[]` | 推荐、分类、提炼 | 审核、接受/忽略、打高亮 |
| Insight Flow | `JournalEntries[]` → `Flashcards[]` | 提炼、归类、调度复习 | 说/写/回应 |
| Depth Crystallization | `WikiPages[]` | 起草、维护 backlinks | 修改、拔高观点 |

---

## 3. MVP 范围（Phase 1 · 严格版）

### 3.1 Must-have 功能清单

| # | Feature | 用户故事 |
|---|---|---|
| 1 | **Auth** | 作为用户，我用邮箱 magic link 登录 |
| 2 | **Atlas CRUD** | 作为用户，我能创建一个叫 "LLM Harness" 的 Atlas，写 thesis，后续能编辑/删除 |
| 3 | **Source ingest**（URL + text） | 作为用户，我粘贴一个 URL 或 paste 一段文字，系统 30 秒内完成 fetch + LLM summary |
| 4 | **Journal 捕获** | 作为用户，我在 Web 上文本框一敲、或飞书发 `/j <text>`，我的 journal 立刻有条目 |
| 5 | **AI Distill（每晚跑）** | 作为用户，第二天早上我看到 AI 从我昨日 journal 提炼的 N 张 flashcard |
| 6 | **Spaced Repetition + Morning Ritual** | 作为用户，每天 8am 飞书/邮件推 3-5 张卡，我点"记得/模糊/忘了"，SR 曲线自动调 |

### 3.2 明确 Out of Scope（留给 Phase 2+）

- AI source 推荐（主动找源）
- Framework 自演化（AI 从 Atlas 内容生成知识树）
- Flashcard → Synthesis 晋升
- Scratch 跨 Atlas
- 协作 / 分享链接
- 移动端 PWA（先只跑桌面 Web）
- 付款 / 订阅
- Obsidian 双向同步（只留单向导出）

### 3.3 验收标准（Definition of Done for MVP）

- 能完整跑完**一周闭环**：建 Atlas → ingest 5 source → 写 20 journal → 收到 10 张 distilled flashcard → 每天 morning ritual 回应 → 一周后看周报
- 飞书 webhook 能正常发送 journal 到后端
- 后端 cron 每晚 3am 跑 distill 任务成功率 > 95%
- Web UI 响应 < 1s（非 LLM 调用）
- 所有数据可一键导出为 Markdown zip

---

## 4. 用户旅程

### 4.1 首次使用

```
1. 访问 atlas.yourdomain.com
2. 输入邮箱 → 收 magic link → 登录
3. Onboarding 3 步：
   a. 介绍 Atlas 概念（30 秒动画）
   b. 让你填第一个 Atlas 的主题
   c. 让你连接 Anthropic API key（你自己的）+ 飞书 webhook（可选）
4. 进入 Atlas 详情页（空态，引导首个 ingest）
```

### 4.2 日常循环

```
早 8am  📨 收推送："今日 3 张卡 + 昨日 AI 提炼了 2 张新卡"
早 8:05 点开 → 回应卡片（1 分钟）→ 扫一眼新卡
       → 顺手看"今日建议：昨天你发了 3 条关于 harness 的随记，要 promote 成 concept 吗？"
日间随时  💬 飞书 "/j harness 其实就是给 agent 加 rails" → 立刻入 journal
晚 23pm  🌙 Atlas cron 自动跑 distill（你不感知）
```

### 4.3 周六 session（30 分钟）

```
打开 Atlas dashboard
  → 本周摘要：读了 4 篇，写了 12 条，AI 提炼 5 张
  → 审核周报文案
  → 点 "view weekly sources" → 扫 AI 推的（Phase 2 才有）
  → 选 3 张成熟的 flashcard → 起草 synthesis
  → 手动编辑后 publish
```

---

## 5. UI / UX（wireframe 级别）

### 5.1 IA（Information Architecture）

```
顶栏: [Atlas ▾] [+ Journal] [Flashcards (3)] [Sources] [Wiki] [Dashboard]   [⚙]

Atlas 切换器: 左侧栏 or 顶栏下拉

Dashboard (Atlas Home)
├─ Atlas 名 + thesis 横幅
├─ 今日卡片区 (3-5 张，可直接回应)
├─ 本周数字 (journal N 条 / distill M 张 / source K 篇)
├─ AI 周报 (markdown 展示)
└─ 快捷链接到 Journal / Sources / Wiki

Journal
├─ 左: 快速输入框 (Cmd+Enter 提交)
├─ 右: 时间线 (今天 / 昨天 / 本周 / 更早)
├─ 每条可看 AI 是否 distill 过、链接到哪张 flashcard

Flashcards
├─ Tabs: Due Today (需复习) / All / Archived
├─ 卡片视图: front (翻) back，操作 [记得] [模糊] [忘了]
├─ 每张卡显示：来源 journal / 所属 concept / maturity bar

Sources
├─ Tabs: To Read / Reading / Read
├─ 列表: title / author / AI summary 前几行
├─ 点击: 全文 markdown 阅读，可在右侧做高亮（highlight → 自动变 journal entry）

Wiki
├─ 和 Obsidian 风类似的 tree + backlinks
├─ Markdown 编辑 + 预览
```

### 5.2 关键页面 wireframe（ASCII）

#### Dashboard

```
┌──────────────────────────────────────────────┐
│ [Atlas: LLM Harness ▾] 🧠 Atlas               │
├──────────────────────────────────────────────┤
│ 🎯 未来 18 个月的关键竞争点是 harness + context│
│                                              │
│ ┌─ Today's Cards (3) ────────────────────┐  │
│ │ 📇 "Harness 就是给 agent 加 rails"      │  │
│ │   [记得] [模糊] [忘了] [深挖]          │  │
│ │ → 1/3                                  │  │
│ └────────────────────────────────────────┘  │
│                                              │
│ 📊 This Week                                 │
│   Journal: 12  · Flashcards: 5 new           │
│   Sources: 4 read · Wiki: 2 new concepts    │
│                                              │
│ 📝 AI Weekly Digest                          │
│ ┌────────────────────────────────────────┐  │
│ │ 本周你多次提到 harness 和 SDLC maturity │  │
│ │ 的对应。这个观点已经成熟（5 次回忆仍活），│  │
│ │ 建议写 synthesis《Harness Levels vs    │  │
│ │ SDLC》。                                │  │
│ └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

#### Journal 快速输入

```
┌──────────────────────────────────────────────┐
│ Atlas: LLM Harness · Journal                 │
├──────────────────────────────────────────────┤
│ ┌─ What's on your mind? ─────────────────┐  │
│ │                                        │  │
│ │ [文本框，3 行，Cmd+Enter 提交]          │  │
│ │                                        │  │
│ └────────────────────────────────────────┘  │
│   💡 tip: AI will auto-distill tonight      │
│                                              │
│ ─── Today ────────────────────────────────  │
│ 14:32  "context 管理才是瓶颈，不是模型"      │
│        · ✨ distilled → flashcard #12        │
│ 10:15  "anthropic 的 tool use 设计很优雅"    │
│        · ⏳ pending distill                  │
│                                              │
│ ─── Yesterday ────────────────────────────  │
│ ...                                          │
└──────────────────────────────────────────────┘
```

#### Flashcard review

```
┌──────────────────────────────────────────────┐
│ Review: 2 / 5                                │
├──────────────────────────────────────────────┤
│                                              │
│   📇                                         │
│   Harness engineering 和 context engineering│
│   的关系是什么？                              │
│                                              │
│                                              │
│   [Show answer]                              │
│                                              │
│   Source: journal 2026-04-15                 │
│   Concept: [[harness-engineering]]           │
│                                              │
└──────────────────────────────────────────────┘

(点击 Show answer 后)
┌──────────────────────────────────────────────┐
│   📇 Back                                    │
│                                              │
│   Context engineering 是 harness 的子集。    │
│   Harness 管整个 agent 执行环境和约束；      │
│   context engineering 只管喂给 agent 的信息。│
│                                              │
│   [ 记得 (+3d) ] [ 模糊 (+1d) ] [ 忘了 (<1d)]│
│   [ 有新想法 → open journal ]                │
└──────────────────────────────────────────────┘
```

---

## 6. 技术架构

### 6.1 Stack

```
Frontend:       Next.js 14 (App Router, RSC)
UI:             shadcn/ui + Tailwind
State:          TanStack Query (server state) + Zustand (client state)
Forms:          react-hook-form + zod
Markdown:       react-markdown + remark-gfm
Backend:        Next.js Route Handlers (serverless)
Database:       Supabase Postgres + Row Level Security
Auth:           Supabase Auth (email magic link)
Cron:           Supabase pg_cron (内置) 或 Vercel Cron
AI:             Anthropic API (Claude Sonnet 4) + Haiku（便宜的 summary）
Search:         (Phase 2) Tavily API
Fetch:          Mozilla Readability (via @mozilla/readability) + puppeteer fallback
Deploy:         Vercel
Monitoring:     Axiom 或 Sentry
Cost:           ~$0-15/月（个人使用，Supabase 免费层 + Vercel 免费层 + Claude API）
```

### 6.2 数据库 Schema（Postgres）

```sql
-- Users 用 Supabase Auth 自动管理

CREATE TABLE atlases (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    slug        TEXT NOT NULL,
    name        TEXT NOT NULL,
    thesis      TEXT,
    tags        TEXT[] DEFAULT '{}',
    scope_in    TEXT[] DEFAULT '{}',
    scope_out   TEXT[] DEFAULT '{}',
    framework   JSONB DEFAULT '{}'::jsonb,
    status      TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, slug)
);

CREATE TABLE sources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atlas_id        UUID NOT NULL REFERENCES atlases(id) ON DELETE CASCADE,
    url             TEXT,
    title           TEXT NOT NULL,
    author          TEXT,
    pub_date        DATE,
    source_type     TEXT NOT NULL CHECK(source_type IN ('web','text','pdf','video','arxiv','feishu')),
    raw_content     TEXT,                -- full markdown
    summary         JSONB DEFAULT '{}',  -- {tl_dr, key_claims, quotes}
    status          TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread','reading','read','dismissed')),
    ai_recommended  BOOLEAN NOT NULL DEFAULT false,
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON sources(atlas_id);
CREATE INDEX ON sources(atlas_id, status);

CREATE TABLE journal_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atlas_id        UUID REFERENCES atlases(id) ON DELETE CASCADE,  -- NULL = scratch
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    text            TEXT NOT NULL,
    channel         TEXT NOT NULL CHECK(channel IN ('web','feishu','voice','highlight')),
    source_ref      UUID REFERENCES sources(id) ON DELETE SET NULL,  -- if highlight
    status          TEXT NOT NULL DEFAULT 'raw' CHECK(status IN ('raw','distilled','archived')),
    ai_annotations  JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at    TIMESTAMPTZ
);
CREATE INDEX ON journal_entries(atlas_id, created_at DESC);
CREATE INDEX ON journal_entries(user_id, status);  -- for distill cron

CREATE TABLE flashcards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atlas_id        UUID REFERENCES atlases(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    front           TEXT NOT NULL,
    back            TEXT NOT NULL,
    origin_type     TEXT CHECK(origin_type IN ('journal','highlight','manual')),
    origin_ref      UUID,
    -- SR fields (SM-2)
    ease            REAL NOT NULL DEFAULT 2.5,
    interval_days   INTEGER NOT NULL DEFAULT 0,
    stage           TEXT NOT NULL DEFAULT 'new' CHECK(stage IN ('new','learning','review','mastered')),
    next_review_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    review_count    INTEGER NOT NULL DEFAULT 0,
    success_count   INTEGER NOT NULL DEFAULT 0,
    maturity        INTEGER NOT NULL DEFAULT 0,    -- 0-10 approximate
    promoted_to     UUID REFERENCES wiki_pages(id),  -- forward ref
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON flashcards(user_id, next_review_at);  -- for morning ritual query
CREATE INDEX ON flashcards(atlas_id);

CREATE TABLE wiki_pages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atlas_id        UUID NOT NULL REFERENCES atlases(id) ON DELETE CASCADE,
    type            TEXT NOT NULL CHECK(type IN ('concept','entity','synthesis','question','topic','moc')),
    slug            TEXT NOT NULL,
    title           TEXT NOT NULL,
    content         TEXT NOT NULL DEFAULT '',  -- markdown
    tags            TEXT[] DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(atlas_id, slug)
);

CREATE TABLE wiki_links (
    -- 双向链接关系表
    from_page_id    UUID NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
    to_slug         TEXT NOT NULL,  -- slug, 可能未 resolved
    to_page_id      UUID REFERENCES wiki_pages(id) ON DELETE SET NULL,
    PRIMARY KEY (from_page_id, to_slug)
);

CREATE TABLE digest_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atlas_id        UUID NOT NULL REFERENCES atlases(id) ON DELETE CASCADE,
    period          TEXT NOT NULL CHECK(period IN ('daily','weekly')),
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    content         JSONB NOT NULL,  -- AI-generated summary + stats
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User settings
CREATE TABLE user_settings (
    user_id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    timezone            TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    anthropic_api_key   TEXT,            -- encrypted via pgsodium
    feishu_webhook      TEXT,
    morning_ritual_time TIME NOT NULL DEFAULT '08:00:00',
    sr_algorithm        TEXT NOT NULL DEFAULT 'sm2' CHECK(sr_algorithm IN ('sm2','fsrs')),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Row Level Security
ALTER TABLE atlases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own their atlases" ON atlases
    USING (user_id = auth.uid());

-- 同样为其它表加 RLS（省略重复）
```

### 6.3 API 切面（Next.js Route Handlers）

```
POST   /api/atlases                     创建 Atlas
GET    /api/atlases                     列出我的 Atlas
GET    /api/atlases/[slug]              详情
PATCH  /api/atlases/[slug]              更新
DELETE /api/atlases/[slug]              归档

POST   /api/atlases/[slug]/sources      ingest source (URL or text)
GET    /api/atlases/[slug]/sources      列表
PATCH  /api/atlases/[slug]/sources/[id] 更新 status
DELETE /api/atlases/[slug]/sources/[id] 删除

POST   /api/atlases/[slug]/journal      写 journal entry
GET    /api/atlases/[slug]/journal      列表（分页）

GET    /api/atlases/[slug]/flashcards   全部
GET    /api/flashcards/due              今日要复习的（跨 Atlas）
POST   /api/flashcards/[id]/review      提交复习结果 { rating: 'remembered'|'foggy'|'forgot' }

GET    /api/atlases/[slug]/wiki         Wiki pages
POST   /api/atlases/[slug]/wiki         创建 page
PATCH  /api/wiki-pages/[id]             编辑

GET    /api/atlases/[slug]/digest/weekly 本周摘要

POST   /api/webhooks/feishu             飞书 webhook 收消息

POST   /api/export                      导出整个 user 的数据为 markdown zip

# Cron triggers (called by Supabase pg_cron)
POST   /api/cron/distill                每晚 3am 跑 distill
POST   /api/cron/morning-push           每天 8am 推送
POST   /api/cron/weekly-digest          周日 8am 生成周报
```

### 6.4 关键算法

#### 6.4.1 SM-2 Spaced Repetition

```typescript
// 3 种评级：remembered (q=5) / foggy (q=3) / forgot (q=1)
function sm2(card: Flashcard, q: number): Partial<Flashcard> {
  let { ease, interval_days, review_count, success_count } = card;

  if (q < 3) {
    interval_days = 1;  // 重来
    stage = 'learning';
  } else {
    if (review_count === 0) interval_days = 1;
    else if (review_count === 1) interval_days = 6;
    else interval_days = Math.round(interval_days * ease);

    ease = Math.max(1.3, ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    success_count += 1;
    stage = interval_days > 21 ? 'mastered' : 'review';
  }

  return {
    ease,
    interval_days,
    next_review_at: addDays(new Date(), interval_days),
    review_count: review_count + 1,
    success_count,
    stage,
    maturity: Math.min(10, Math.floor(success_count * 0.5)),
  };
}
```

#### 6.4.2 Distill Prompt

```
你是 Atlas 的 distill agent。输入一批 journal entries（同一 user 同一 atlas），
输出：
  - 0-N 张 flashcard（front: 问题/主题，back: 观点/论据）
  - 每张标出 origin journal_id 列表

要求：
  - 至少 2 条 journal 能支持一张 flashcard 才生成（单条不做 card）
  - front 问题形式，back 观点形式
  - 如果 journal 偏情绪/零散 → 不生成
  - 输出 strict JSON

Journal entries (JSON array):
{entries}

已有 flashcards (避免重复):
{existing_cards}
```

#### 6.4.3 Weekly Digest Prompt

```
你是 Atlas 的周报作者。输入本周该 Atlas 的：
- N 条 new journal
- M 张 new flashcard
- K 篇 read source
- Y 次 flashcard review

写 200-300 字周报，要求：
- 用"你"口吻
- 识别本周的"主题线索"（反复出现的关键词）
- 指出 1-2 个可 promote 成 synthesis 的 flashcard
- 指出 1-2 个 knowledge gap
输出 markdown。
```

### 6.5 飞书集成（MVP 最小）

```
用户在飞书发 /j <text>
→ 飞书 bot webhook 打到 POST /api/webhooks/feishu
→ Atlas 后端：
   - 按 user 的飞书 open_id 匹配到账户
   - 默认 atlas 是 user_settings.default_atlas_id（如无配置，提示用户先在 Web 里选）
   - 插入 journal_entries
→ bot 回复 "📝 已记（#N）· 今晚 distill"
```

注：MVP 不做 `/ip` `/q` `/process` 这些 —— 只保留最核心的 `/j`。

### 6.6 Source Fetch Pipeline

```
POST /api/atlases/[slug]/sources { url }
  ↓
1. URL 类型识别（web / arxiv / youtube / pdf / feishu）
2. 对应 fetcher:
   - web: @mozilla/readability 解析后 turndown 转 md
   - arxiv: fetch abstract + 下 PDF (Phase 2 再 OCR)
   - youtube: yt-dlp on a serverless-friendly way? 这个 MVP 不做，只做 web
   - pdf: 直接存，summary 留空
3. 下 raw content 到 sources.raw_content
4. 调 Claude Haiku 生成 summary { tl_dr, key_claims, quotes }
5. 返回 source_id
```

MVP **只支持 web + text 两种**。其它 source type 走 Phase 2。

---

## 7. 成本估算

| 项 | 免费额度 | 个人用 1 年成本 |
|---|---|---|
| Vercel Hosting | 100GB bandwidth | $0（基本够） |
| Supabase | 500MB DB + 2GB storage + 50k MAU | $0 |
| Anthropic API | - | ~$60-120/年（distill 每晚一次 + 100 次/月 source summary） |
| Domain | - | $12/年 |
| Total | | **~$80-140/年** |

如果以后要开放给别人用，Supabase 升级到 Pro 25$/月。

---

## 8. 风险与 mitigation

| 风险 | 可能性 | 影响 | mitigation |
|---|---|---|---|
| Claude API 过期 / 被封 | 低 | 高 | 用户自己绑 API key，而非我们代付 |
| Supabase 挂 | 低 | 高 | 一键导出 markdown，随时迁移 |
| Distill 质量差 | 中 | 中 | 用户可手动编辑 flashcard，提供反馈闭环 |
| 我写不动 | 中 | 低 | MVP 严格到 6 个功能，3 周 fork |
| Supabase pg_cron 不稳 | 中 | 中 | 备用 Vercel Cron |
| 飞书 webhook 不好设置 | 中 | 低 | MVP 先只做 Web 快速输入，webhook 后补 |

---

## 9. 时间线（一个人 part-time）

| Week | 任务 | 交付 |
|---|---|---|
| **W1** | Supabase schema + Auth + Next.js scaffold + Atlas CRUD | 能登录、建 Atlas |
| **W2** | Source ingest + Journal 捕获 + Web UI polish | 能存东西 |
| **W3** | Distill cron + Flashcard SR + Morning Ritual + 周报 | 完整闭环 |
| **W4（缓冲）** | 打磨 + 真用 | 发现的 bug 修掉 |

---

## 10. 未来（Phase 2+）

按优先级：

1. **AI Source 推荐**（主线 1 完整版）
2. **Framework 自演化** —— AI 从你的 sources 聚类，画出「这个 Atlas 目前的知识树」
3. **Flashcard → Synthesis 晋升**
4. **Scratch 跨 Atlas**
5. **Obsidian 双向同步**（vault 作为可选 backend）
6. **移动 PWA**（已是 Next.js 应该不难）
7. **协作** / 分享链接
8. **公开 Atlas** / 社区

---

## 11. 开放问题（等你决定）

- [ ] 域名用什么？（atlas.yourdomain.com / 新买）
- [ ] Logo / 配色？
- [ ] 飞书 bot MVP 里要不要？（可能 Phase 1.5）
- [ ] Anthropic API key 是用户绑 or 我们代付（后者贵）
- [ ] 是否一开始就留「导入 Obsidian vault」入口（MVP 不做，但 Phase 2 要）
