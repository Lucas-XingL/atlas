# Atlas PRD v3 — 三管道 × 阅读池

> v3 relative to [v2](./PRD-v2.md). 把"来源"和"消费"解耦成两层：三条平行的**来源管道**生产候选项（学习计划 / 订阅 / 手写），一个统一的**阅读池**承载"我实际要读/在读/读完"的内容 + 阅读器 / 高亮 / 随记联动。

---

## 1. v3 解决的核心问题

**v2 的问题**：
- 原 Sources tab 语义混乱。它既是"来源管道"（添加链接），又是"阅读池"（读的东西），又是"候选列表"（AI 推但未接受的）。一个 tab 承担了 3 种身份
- 内容推荐进阅读池没有"二次确认"，导致阅读池里混入大量 AI 推但用户其实不想读的候选
- 兜底手动输入埋在 Sources 里展开的折叠按钮，不显眼
- 缺少"每日订阅"这条主动吸纳增量内容的管道

**v3 做法**：
- **生产端拆三条管道** — 每条有独立的推荐节奏、独立的 UI 入口
- **消费端统一一个池** — 不关心从哪来，只关心读到哪
- **全局候选 → 入池两步** — 每个来源都先进"内容推荐"作为候选，用户一键入池

---

## 2. 全新 IA

```
/app/atlases/[slug]/
├─ page.tsx                  = 概览 (Dashboard)
├─ recommendations/          = 【新】内容推荐 (候选池)
│    ├─ 📚 学习计划 section  (LearningPath 的未入池资源)
│    ├─ 📡 每日订阅 section  (RSS 订阅抓到的新 item)
│    └─ 📝 可能会看 section  (用户手贴的链接/文本 → 候选)
├─ reading/                  = 【新】阅读清单 (入池 = 用户真要读/在读/读完)
│    ├─ page.tsx             列表 + 分组 (按 stage / 按 origin / 按状态切换)
│    └─ [id]/                阅读器页 (v2 已做, 迁移到这里)
├─ path/                     = 学习计划详情 (v2 已做)
├─ journal/                  = 随记
└─ flashcards/               = 卡片
```

Sidebar 也更新：顶部 `今日复习` + 每个 Atlas 下面展开显示 `内容推荐 (N)` 小数字徽章（候选数）。

---

## 3. 对象模型（v3）

```
Atlas
 ├─ LearningPath (不变)          ← 核心路径生产者
 │   └─ PathResource             ← 候选 (已存在, v2)
 │
 ├─ Subscription[]                ← 【新】辅助路径生产者
 │   ├─ id, atlas_id, feed_url, title, last_fetched_at
 │   ├─ fetch_schedule: "hourly" | "daily"
 │   ├─ is_active
 │   └─ SubscriptionItem[]       ← 候选
 │       ├─ id, subscription_id
 │       ├─ external_id (guid / url 去重)
 │       ├─ title, url, published_at, summary_preview
 │       └─ user_status: "new" | "in_pool" | "skipped"
 │
 ├─ ManualCandidate[]             ← 【新】兜底路径生产者
 │   ├─ id, atlas_id, url?, text?, title, note?
 │   ├─ 用户贴了但还没点"入池"的草稿态
 │   └─ (入池后删除该行, 转 Source)
 │
 └─ Source[]                      ← 【变】阅读池（只存入池的）
     ├─ origin: "path" | "subscription" | "manual"
     ├─ origin_ref: UUID           (指向 path_resource_id / subscription_item_id / null)
     ├─ (其它 v2 字段不变: reading_progress / highlights / journal 关联)
     └─ Highlights[]
```

**改动要点**：
- `path_resources.source_id` 和 `sources.path_resource_id` 关系保留（双向，但只有入池后才挂上）
- `subscription_items` 入池时 INSERT 到 `sources`，`origin='subscription'` + `origin_ref = item.id`，同时该 `item.user_status = 'in_pool'`
- `manual_candidates` 入池时 INSERT 到 `sources`，`origin='manual'`，同时 DELETE 自己（manual 没保留候选意义）
- `sources` 表不改名，但 UI 展示时不再叫"来源"，改叫"阅读清单"

---

## 4. 用户旅程（v3）

### 4.1 首次使用

```
建 Atlas → path/new → AI 生成 LearningPath
                         ↓
                   所有 path_resource 以"候选"身份
                   出现在 /recommendations 的"学习计划" section
                         ↓
用户浏览候选 → 一键入池 or 跳过 → 进入 /reading
                                    ↓
                              在阅读清单里继续消化
```

### 4.2 日常

**早晨**（不变）：
1. 邮件推送 3-5 张待复习卡片
2. 打开 /flashcards/due 过一遍

**随时**：
1. 看到新订阅有更新 → 去 /recommendations 的"每日订阅" section 扫一眼 → 感兴趣的一键入池
2. 在微信/Twitter 看到一条好内容 → 去 /recommendations 的"可能会看" section 贴进去 → 有时间了入池
3. 进 /reading 挑一条在读的 → 打开阅读器 → 高亮 + 转随记 → 进度自动更新

**每晚 03:00**（不变）：journal → distill → flashcard

**每周日 08:00**（不变）：weekly digest

### 4.3 订阅管理

- 用户在 `/recommendations` 顶部点"管理订阅" → 进 `/atlases/[slug]/subscriptions`
- 添加新订阅：粘 RSS feed URL → 后端拉一次校验 → 落库
- 订阅的 fetch 由一个新的 cron（每 2 小时）驱动，把 feed item 写入 `subscription_items`，前端轮询即可

---

## 5. DB 迁移（005）

```sql
-- Source 加入口来源 + 候选/入池状态
-- 既有数据全部回填 origin='manual'（保守默认，因为旧的 UI 没有明确区分）
ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'manual'
    CHECK (origin IN ('path', 'subscription', 'manual')),
  ADD COLUMN IF NOT EXISTS origin_ref UUID;

-- 回填已有的 path 关联
UPDATE sources
   SET origin = 'path', origin_ref = path_resource_id
 WHERE path_resource_id IS NOT NULL;

-- 【新】订阅
CREATE TABLE subscriptions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atlas_id         UUID NOT NULL REFERENCES atlases(id) ON DELETE CASCADE,
    user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    feed_url         TEXT NOT NULL,
    title            TEXT NOT NULL,
    site_url         TEXT,
    fetch_schedule   TEXT NOT NULL DEFAULT 'daily' CHECK (fetch_schedule IN ('hourly','daily')),
    is_active        BOOLEAN NOT NULL DEFAULT true,
    last_fetched_at  TIMESTAMPTZ,
    last_error       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (atlas_id, feed_url)
);
CREATE INDEX ON subscriptions (user_id);

CREATE TABLE subscription_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id   UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    external_id       TEXT NOT NULL,   -- feed guid
    title             TEXT NOT NULL,
    url               TEXT,
    author            TEXT,
    published_at      TIMESTAMPTZ,
    summary_preview   TEXT,            -- feed 自带摘要的前 300 字
    user_status       TEXT NOT NULL DEFAULT 'new'
                      CHECK (user_status IN ('new','in_pool','skipped')),
    source_id         UUID REFERENCES sources(id) ON DELETE SET NULL,
    fetched_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (subscription_id, external_id)
);
CREATE INDEX ON subscription_items (user_id, user_status);
CREATE INDEX ON subscription_items (subscription_id, fetched_at DESC);

-- 【新】手动候选
CREATE TABLE manual_candidates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atlas_id      UUID NOT NULL REFERENCES atlases(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    url           TEXT,
    text_snippet  TEXT,
    title         TEXT NOT NULL,
    note          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON manual_candidates (atlas_id, created_at DESC);

-- RLS
ALTER TABLE subscriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_candidates  ENABLE ROW LEVEL SECURITY;

CREATE POLICY subs_owner ON subscriptions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY sub_items_owner ON subscription_items
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY manual_cand_owner ON manual_candidates
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

---

## 6. API 追加

```
# Subscriptions
POST   /api/atlases/[slug]/subscriptions          # 添加订阅 (粘 feed URL)
GET    /api/atlases/[slug]/subscriptions          # 列表
PATCH  /api/subscriptions/[id]                    # 改 title / schedule / is_active
DELETE /api/subscriptions/[id]                    # 删订阅 (级联删 items)
POST   /api/subscriptions/[id]/refresh            # 手动触发抓一次
POST   /api/cron/subscription-fetch               # 每 2 小时 pg_cron

# Subscription items (候选)
GET    /api/atlases/[slug]/subscription-items?status=new  # 候选列表
POST   /api/subscription-items/[id]/accept        # 入池 → 创建 Source
POST   /api/subscription-items/[id]/skip

# Manual candidates (兜底候选)
POST   /api/atlases/[slug]/manual-candidates      # 粘链接/文本 → 建候选
GET    /api/atlases/[slug]/manual-candidates
DELETE /api/manual-candidates/[id]
POST   /api/manual-candidates/[id]/accept         # 入池

# Recommendations 聚合 (一个页面拉三条管道的候选)
GET    /api/atlases/[slug]/recommendations
  → { path: [...path_resources with user_status='suggested'],
      subscription: [...items with user_status='new'],
      manual: [...manual_candidates] }

# 内容推荐页的统一"一键入池"
POST   /api/recommendations/accept
  body: { origin: 'path'|'subscription'|'manual', ref_id: UUID }
  → 统一路由分发到 path-resources/accept, subscription-items/accept, manual-candidates/accept

# 现有的 sources 不动 (阅读池读写)
```

---

## 7. UI 要点

### 7.1 内容推荐页 `/recommendations`

```
┌─────────────────────────────────────────┐
│  内容推荐                   [管理订阅 →] │
│  共 N 条候选 · 点"入池"开始阅读          │
├─────────────────────────────────────────┤
│                                         │
│  📚 学习计划 (N)                        │
│  ┌──────────────────────────────────┐  │
│  │ Stage 2: 工具理论                │  │
│  │   ○ 《指数基金投资指南》        │  │
│  │     [physical · 必读]   [入池]   │  │
│  │   ○ SSRN "xxx" 论文              │  │
│  │     [consumable · 必读] [入池]   │  │
│  └──────────────────────────────────┘  │
│                                         │
│  📡 每日订阅 (N)                        │
│  ┌──────────────────────────────────┐  │
│  │ 银行螺丝钉 (订阅)                │  │
│  │   ◎ "最新一期指数估值表"         │  │
│  │      2h 前 · 来自 RSS   [入池]   │  │
│  └──────────────────────────────────┘  │
│                                         │
│  📝 可能会看 (N)                        │
│  ┌──────────────────────────────────┐  │
│  │ [+ 粘贴 URL 或文本]              │  │
│  │   · 你贴的 xxx 链接   [入池]     │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

每个候选都只有 3 个动作：**入池** / **跳过** / **删除**。

### 7.2 阅读清单 `/reading`

保留 v2 Sources tab 的能力（badge / 粘要点 / 失败重试 / 阅读进度），外加：
- 顶部筛选：`全部 / 在读 / 已读 / 未开始` + `按来源: 🔵学习计划 🟢订阅 🟡手动`
- 按 origin 聚合展示
- 点标题进 `/reading/[id]` 阅读器（复用 v2 的）

### 7.3 订阅管理 `/subscriptions`

```
[+ 添加订阅] 粘 RSS feed URL  →  系统校验 → 存
──────────────────────────────────────────
已添加 (N)
  · 银行螺丝钉 · 每日抓 · 最后抓 2h 前    [刷新] [停用] [删除]
  · Paul Graham · 每日抓 · 最后抓 6h 前   [刷新] [停用] [删除]
```

---

## 8. 实施顺序（Step A / B / C）

### Step A — 改造现有候选路径（~3 天）
- [ ] migration 005_source_origin.sql (sources + origin/origin_ref + 回填)
- [ ] migration 005 同时建 subscriptions / subscription_items / manual_candidates 空表
- [ ] 路由改名：`/sources/*` → `/reading/*`（URL + 文件）
- [ ] 新增 `/recommendations` 页，学习计划 section 先通（其它 section 占位）
- [ ] Path 里的"开始读"改成"入池推荐" → 跳 /recommendations，不再直接入池
- [ ] Sources tab 改名 "阅读清单"，URL 变 `/reading`

### Step B — 辅助路径：订阅（~3 天）
- [ ] lib/feed/rss.ts — fetch + parse feed (用 `fast-xml-parser`)
- [ ] Subscription CRUD API + UI 页
- [ ] SubscriptionItem accept/skip
- [ ] cron: /api/cron/subscription-fetch + pg_cron 每 2h
- [ ] /recommendations 页 "每日订阅" section 接通

### Step C — 兜底路径 & 打磨（~1.5 天）
- [ ] ManualCandidate CRUD
- [ ] /recommendations 页 "可能会看" section + 粘贴入口
- [ ] Dashboard 加"内容推荐 (N)"徽章
- [ ] Sidebar 每个 Atlas 后面的候选数徽章
- [ ] 老 sources 页面彻底下线 (v2 UI 删)

**总工期约 7-8 天。** Step A 是最影响现有流程的，跑通 A 之后产品就能用 v3 逻辑。

---

## 9. 已确认的决策

- DB 层 3 种来源用一张 sources + origin 字段（不拆多表）
- 订阅只支持标准 RSS feed URL（公众号走 rsshub 这类第三方，由用户自己准备 feed URL）
- Sources 表名保留但 UI/路由叫"阅读清单"
- 所有候选统一走"候选 → 入池"两步
- 订阅抓取 cron 每 2 小时一次，用户可手动 refresh

---

## 10. Phase 4+ 暂不做

- 微信公众号原生抓取（依赖第三方转 RSS，不稳）
- OPML 批量导入订阅
- 订阅里的 item 自动按 LearningPath stage 归类（AI 做这事可以，但先看用户是否手动归类）
- 订阅 item 里自带的 summary 交给 AI 复核（浪费 token，feed 自带已够用）
- 阅读清单的文件夹 / 标签
