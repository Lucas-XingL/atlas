# Atlas PRD v2 — Learning Path + Source 消费闭环

> v2 relative to [v1 backed up as PRD-v1.md](./PRD-v1.md). 主题学习 = **AI 生成阶段化学习路径** + **站内可消费的阅读器** + 原有三条主线（Source 推荐 / Journal 提炼 / SR 复习）。

---

## 1. v2 解决什么 v1 没解决的问题

| 问题 | v1 设计 | v2 改进 |
|---|---|---|
| 新建 Atlas 后"不知道从哪读起" | 一次性 AI 推 8-12 条平铺文章 | AI 生成**阶段化学习路径**，每阶段分核心 / 拓展，让用户看到"从哪开始、下一步是什么" |
| 用户读完一篇无处消化 | 只能手动复制片段粘回 Journal | **Source 详情页 + 高亮转随记**，所见即所得 |
| 纸质书 / 付费文章无处安放 | 只能粘正文 | **资源分 3 类**：consumable（可抓）/ external（仅元数据）/ physical（线下书），UI 不同 |
| 学习进度无感知 | 只有 `status: unread/reading/read` | Source 有**阅读进度 %**，Path 有**阶段完成度** |
| kickstart 和 source 散乱 | kickstart 和手动 ingest 都进 Sources tab 平铺 | Path 是 Sources 的**组织轴**，Dashboard 分"学习路径" + "其他阅读" 两块 |

---

## 2. 对象模型（v2）

```
User ─┬─> Atlas[]
      └─> Settings

Atlas
 ├─ id, slug, name, thesis, tags, status
 ├─ knowledge_domain   // AI 识别，用于选学习路径模板；枚举之一
 │                     // (tech | finance | art | science | practical | humanities | other)
 ├─ LearningPath?      // 可选；一个 Atlas 最多一个 active path
 │   ├─ id, atlas_id, version, generated_at, frozen: bool
 │   ├─ overview: text                      // 3-5 句总览
 │   ├─ Stages[]
 │   │   ├─ id, order, name, intent: text   // "心法建立"/"理论武装"/"实操"
 │   │   ├─ est_duration: text              // AI 给的软 hint，"1周"/"持续"
 │   │   ├─ Resources[]                     // 路径内推荐的资源位
 │   │   │   ├─ id, tier: "core" | "extra"  // 核心必读 / 拓展
 │   │   │   ├─ resource_type: "consumable" | "external" | "physical"
 │   │   │   ├─ title, why_relevant, rationale  // LLM 解释
 │   │   │   ├─ search_hint: text           // 没有 URL 时的搜索线索
 │   │   │   ├─ source_id?: UUID            // 点 "开始读" 后创建的 Source
 │   │   │   └─ user_status: "suggested"|"accepted"|"reading"|"finished"|"skipped"
 │   │   └─ ...
 │   └─ ...
 ├─ Sources[]          // 保持不变，多加两个字段
 │   ├─ ...
 │   ├─ resource_type: "consumable"|"external"|"physical"  (默认 consumable)
 │   ├─ path_resource_id?: UUID  // 指向 LearningPath.Stages.Resources
 │   ├─ reading_progress: int 0-100  // 用户标注或自动推断
 │   └─ Highlights[]              // 新增
 │       ├─ id, source_id, text, note?: text
 │       ├─ anchor: { start_char, end_char }  // 定位在 raw_content 中
 │       ├─ journal_entry_id?: UUID           // 如果"转随记"就关联
 │       └─ created_at
 ├─ JournalEntries[]   // 不变
 ├─ Flashcards[]       // 不变
 └─ DigestSnapshots[]  // 不变
```

### 2.1 资源类型（决定 UI 交互）

| type | 例子 | Source.url | Source.raw_content | 站内可读？ | 用户操作 |
|---|---|---|---|---|---|
| **consumable** | 博客文章 / PDF 上传 / 用户粘文本 | 有/无 | 有 | ✅ Source 详情页阅读 + 高亮 | AI 抓 → summary |
| **external** | YouTube / 播客 / 付费文章 / 知识星球 | 有 | 无 | ❌ 只看元数据 + 用户外部消化 | 用户外部读完后**粘要点**（要点 = 伪 raw_content，可触发 summarize） |
| **physical** | 实体书 / 线下课 | 无 | 无 | ❌ | 存元数据（title/author/ISBN）；读完后粘章节要点 |

抓取管道：只有 consumable 且有 url 才走 `fetchWebArticle`；其它 type 直接进 "awaiting-user-input" 状态。

### 2.2 Learning Path 结构

**线性 + 分核心/拓展**（决策 1 = A+C）：

```
Stage 1 · 心法建立 · "建立资产和负债的认知"（est: 1 周）
  ├─ core:  《富爸爸穷爸爸》(physical)  — why: 建立理财心态基线
  ├─ core:  李笑来《财富自由之路》第 1-3 章 (physical 或 external)
  └─ extra: 《小狗钱钱》(physical) — why: 更轻的入口，可选

Stage 2 · 工具理论 · "理解基金/股票/债券原理"（est: 2-3 周）
  ├─ core:  银行螺丝钉《指数基金投资指南》(physical) — why: 中文入门首选
  ├─ core:  https://www.ssrn.com/xxx (consumable web) — why: 学术验证
  └─ extra: Ray Dalio 全天候组合科普视频 (external)

Stage 3 · 小额实操 · "用极小金额体验市场"（est: 持续）
  └─ core:  Atlas 内设置投资日志模板（外部账户截图 + 感受）
```

- 每 `Stage` 有时间 hint（不硬性约束）
- 每 `Resource` 有 tier（`core` 必须读 / `extra` 选读）
- Resource 不一定有 URL：search_hint 字段给**可查但需用户外部获取**的引导
- 用户可增删 Stage、增删 Resource、整体重生成 path

### 2.3 Highlight → Journal 转换

在 Source 详情页阅读原文时：
1. 用户选中一段文字 → 弹"💡 高亮" / "→ 转随记" 两个按钮
2. 点 "高亮"：创建 `Highlights` 记录，在原文里加底色背景
3. 点 "转随记"：创建 Journal Entry，同时高亮加 `journal_entry_id` 回指

Journal Entry 由高亮触发时 `channel='highlight'`、`source_ref=source_id`，这点 v1 schema 已经支持。

### 2.4 进度跟踪

**Source 级别**：
- `reading_progress: 0-100`
- 用户在详情页底部可拖滑块或"标记已读完"按钮；默认从 `unread → reading → read` 时自动变 `0 → 50 → 100`
- UI 里 progress bar 显示在 Source 卡上

**Stage 级别**：
- `stage.progress = sum(core resources finished) / count(core resources)`
- `extra` 资源不计入 stage progress

**Path 级别**：
- `path.progress = sum(stage.progress) / count(stages)`

---

## 3. 用户旅程（v2）

### 3.1 首次使用

```
登录 → 建 Atlas（name + thesis）
  │
  ▼
AI 识别 knowledge_domain（~3s）
  │
  ▼
AI 生成 Learning Path（~30-60s）
  - 3-6 个 Stage
  - 每 Stage 3-6 个 Resource
  - 每个 Resource 有 tier + rationale
  │
  ▼
用户 review + 编辑 Path
  - 删掉不想要的 Stage
  - 在 Stage 里 + 资源（粘链接 / 手输书名）
  - 接受 AI 推荐：点 "开始读" → 对应 Resource
      - consumable+url: 立刻 fetch + summarize → 跳 Source 详情页
      - external: 创建 placeholder Source，提示"读完后回来粘要点"
      - physical: 同上
  │
  ▼
进入 Atlas Dashboard
  ├─ 学习路径（Path 可视化 + stage 进度）
  └─ 其他阅读（非 Path 内的 Source）
```

### 3.2 日常循环

跟 v1 相同（Journal / Distill / Morning Ritual / Weekly Digest），外加：
- 在 Dashboard 看到"当前 Stage"卡片 → 点开直接进 Source 详情页
- 边读边用高亮转随记 → 当晚 distill 成 flashcard

---

## 4. IA / 信息架构更新

```
/app/atlases/[slug]/
├─ page.tsx           = Dashboard（v2 多一块"学习路径"）
├─ path/              = 【新】Path 详情页（可视化 + 编辑）
│   └─ page.tsx
├─ sources/
│   ├─ page.tsx       = Sources 列表（默认按 Path stage 分组，可切"全部平铺"）
│   └─ [id]/          = 【新】Source 详情页（Markdown + 高亮 + 进度）
│       └─ page.tsx
├─ journal/
├─ flashcards/
└─ kickstart/         = 【删】替换为 /path/new 首次生成流程
```

---

## 5. 数据库 Schema 追加（v2）

```sql
-- 新表：学习路径
CREATE TABLE learning_paths (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    atlas_id        UUID NOT NULL REFERENCES atlases(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    version         INT NOT NULL DEFAULT 1,
    overview        TEXT,
    knowledge_domain TEXT CHECK (knowledge_domain IN ('tech','finance','art','science','practical','humanities','other')),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON learning_paths (atlas_id) WHERE is_active;

CREATE TABLE path_stages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    path_id         UUID NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
    stage_order     INT NOT NULL,
    name            TEXT NOT NULL,
    intent          TEXT,
    est_duration    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON path_stages (path_id, stage_order);

CREATE TABLE path_resources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_id        UUID NOT NULL REFERENCES path_stages(id) ON DELETE CASCADE,
    res_order       INT NOT NULL,
    tier            TEXT NOT NULL DEFAULT 'core' CHECK (tier IN ('core','extra')),
    resource_type   TEXT NOT NULL DEFAULT 'consumable' CHECK (resource_type IN ('consumable','external','physical')),
    title           TEXT NOT NULL,
    url             TEXT,             -- may be null for physical / external-needs-search
    author          TEXT,
    why_relevant    TEXT,
    search_hint     TEXT,             -- hint for user to locate when url missing
    source_id       UUID REFERENCES sources(id) ON DELETE SET NULL,
    user_status     TEXT NOT NULL DEFAULT 'suggested'
                    CHECK (user_status IN ('suggested','accepted','reading','finished','skipped')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON path_resources (stage_id, res_order);
CREATE INDEX ON path_resources (source_id);

-- sources 加字段
ALTER TABLE sources
  ADD COLUMN resource_type TEXT NOT NULL DEFAULT 'consumable'
    CHECK (resource_type IN ('consumable','external','physical')),
  ADD COLUMN path_resource_id UUID REFERENCES path_resources(id) ON DELETE SET NULL,
  ADD COLUMN reading_progress INT NOT NULL DEFAULT 0 CHECK (reading_progress BETWEEN 0 AND 100);

-- 高亮表
CREATE TABLE highlights (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id           UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    text                TEXT NOT NULL,
    note                TEXT,
    start_offset        INT NOT NULL,
    end_offset          INT NOT NULL,
    journal_entry_id    UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON highlights (source_id);
CREATE INDEX ON highlights (user_id, created_at DESC);

-- atlases 加 knowledge_domain
ALTER TABLE atlases
  ADD COLUMN knowledge_domain TEXT
    CHECK (knowledge_domain IN ('tech','finance','art','science','practical','humanities','other'));

-- RLS
ALTER TABLE learning_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE path_stages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE path_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY paths_owner ON learning_paths
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- path_stages / path_resources 用 path_id 间接判：
CREATE POLICY stages_owner ON path_stages FOR ALL
  USING (EXISTS (SELECT 1 FROM learning_paths p WHERE p.id = path_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM learning_paths p WHERE p.id = path_id AND p.user_id = auth.uid()));
CREATE POLICY resources_owner ON path_resources FOR ALL
  USING (EXISTS (SELECT 1 FROM path_stages s JOIN learning_paths p ON p.id = s.path_id
                 WHERE s.id = stage_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM path_stages s JOIN learning_paths p ON p.id = s.path_id
                      WHERE s.id = stage_id AND p.user_id = auth.uid()));

CREATE POLICY highlights_owner ON highlights
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

---

## 6. API 追加

```
POST   /api/atlases/[slug]/path/generate     # AI 生成 path（替换 kickstart）
GET    /api/atlases/[slug]/path              # 获取当前 active path
PATCH  /api/path-stages/[id]                 # 改阶段名 / 顺序 / intent
DELETE /api/path-stages/[id]
POST   /api/path-stages/[id]/resources       # 添加资源
PATCH  /api/path-resources/[id]              # 改 tier / status / 关联 source_id
DELETE /api/path-resources/[id]
POST   /api/path-resources/[id]/accept       # 点"开始读" → 创建 Source

POST   /api/sources/[id]/highlights          # 新增高亮
PATCH  /api/highlights/[id]                  # 改 note
DELETE /api/highlights/[id]
POST   /api/highlights/[id]/to-journal       # 高亮转随记

PATCH  /api/sources/[id]                     # 加字段 reading_progress

# kickstart 删除：
# DELETE /api/atlases/[slug]/kickstart/queries
# DELETE /api/atlases/[slug]/kickstart
# DELETE /api/atlases/[slug]/kickstart/accept
```

---

## 7. AI Path 生成 Prompt（面向百万用户）

```
system:
你是一个学习路径规划师。用户要建立一个主题知识库，给了 name 和 thesis。
你的任务分 3 步：

1. 判定 knowledge_domain（必填，枚举之一）：
   - tech / finance / art / science / practical / humanities / other

2. 按该域的经典学习模型生成 3-6 个 Stage：
   - 参考领域共识，不同领域顺序不同：
     · tech: 基础概念 → 官方文档 → 小项目 → 架构/源码 → 进阶专题
     · finance: 心法 → 工具理论 → 小额实操 → 组合策略 → 深度研究
     · art: 审美积累 → 技法模仿 → 独立创作 → 风格形成
     · science: 教科书 → 综述 → 前沿论文 → 自己复现
     · practical: 核心操作 → 常见坑 → 进阶技巧 → 精通
     · humanities: 原典 → 注疏 → 当代研究 → 横向对话
     · other: 按用户 thesis 自行设计
   - 每 Stage 给：name, intent (一句话目标), est_duration
   - 顺序是"建议"，不硬性约束

3. 每 Stage 给 3-6 个 Resource：
   - tier: "core" (3-4 条必读) + "extra" (0-2 条拓展)
   - resource_type: consumable (能抓的博客/论文/公开课页面)
                  | external (YouTube / 播客 / 付费文章)
                  | physical (实体书 / 线下课)
   - title: 具体的书名 / 文章名 / 视频名（不要泛指）
   - url: 如果你知道公开 URL 就给；不确定就留空
   - why_relevant: 解释为什么在这个 Stage 读它（≤80 字）
   - search_hint: 如果 url 空，给用户的搜索提示（书的 ISBN / 作者名 / 关键词）
   - author: 作者 / 创作者（若已知）

规则：
- 每个 Stage 的 core 都是该 Stage 的"最小闭环"，读完 core 就能进下一 Stage
- 不要推荐过时的 / 已被取代的资源
- 对中文主题优先推中文资源，但学术类优先英文
- 主题小众时不强凑 6 个 Stage，3 个也可以
- 严格输出 JSON，不要 markdown 围栏

输出 schema:
{
  "knowledge_domain": "finance",
  "overview": "3-5 句总览，说明这条路径为什么这样设计",
  "stages": [
    {
      "name": "心法建立",
      "intent": "建立资产/负债的基本认知",
      "est_duration": "1 周",
      "resources": [
        {
          "tier": "core",
          "resource_type": "physical",
          "title": "《富爸爸穷爸爸》",
          "author": "罗伯特·清崎",
          "url": null,
          "why_relevant": "建立理财心态的标杆入门书",
          "search_hint": "出版社：世界图书出版公司，ISBN 978-7-5062-8940-7"
        }
      ]
    }
  ]
}
```

---

## 8. UI 页面设计要点

### 8.1 Path 首次生成页（`/atlases/[slug]/path/new`）

替换原 kickstart：
1. 全屏卡片"AI 帮你规划 {atlas.name} 的学习路径" + 开始按钮
2. 转圈显示阶段：识别领域 → 起草 stages → 起草 resources → 完成
3. 渲染生成结果：每个 Stage 一个卡片，展开后看 resources
4. 用户可：整体接受 / 删掉某个 stage / 在 stage 里加自己想读的 / 点 "重生成"
5. 点"确认并开始" → 写入 DB，跳 Dashboard

### 8.2 Path 详情页（`/atlases/[slug]/path`）

```
[Overview 文字，AI 写的 3-5 句]

Stage 1 · 心法建立  · ████░░  65%
─────────────────────────────────
  ▪ 核心（3）
    ● 已读 · 《富爸爸穷爸爸》[physical]          [查看]
    ◎ 读中 · 《财富自由之路》前 3 章 [physical]   [粘要点]
    ○ 待读 · https://paulgraham.com/xxx [consumable] [开始读]
  ▪ 拓展（1）
    ○ 待读 · 《小狗钱钱》[physical]              [跳过]
[+ 在此阶段添加]                                  [重排序]

Stage 2 · 工具理论 · ░░░░░░  0%
  ...

[重生成整个 Path]
```

### 8.3 Source 详情页（`/atlases/[slug]/sources/[id]`）

```
┌──────────────────────────────────────────────┐
│ ← 返回                      [删除] [标记已读] │
│                                              │
│ 《xxx》by yyy                                │
│ 原文 link · 读进度: ██░░░░ 30%               │
│ AI 摘要（tl_dr + key_claims）                 │
├────────────────┬─────────────────────────────┤
│                │  高亮 / 随记                │
│   Markdown     │  ○ "..." → [随记已生成]    │
│   正文         │  ○ "..." → [转随记]        │
│   (可滚)       │                              │
│   (选中文字    │  添加随记:                  │
│    浮出按钮    │  [_____________________]    │
│    高亮/随记)  │  [发送]                     │
│                │                              │
└────────────────┴─────────────────────────────┘
```

高亮技术实现：
- 选中触发 `window.getSelection()` → 计算 start/end char offset 相对 raw_content
- POST `/api/sources/[id]/highlights`
- 前端在 markdown 渲染后 overlay 彩色 span
- "转随记"按钮直接 POST `/api/highlights/[id]/to-journal`

### 8.4 Dashboard 更新

原"今日卡片 + 本周统计 + 周报"三块之上再加一块：

```
📍 当前学习 · Stage 2 · 工具理论   20%
─────────────────────────────────
  读到 《指数基金投资指南》第 3 章（30%）     [继续读]
  后面还有: 2 篇核心 + 1 篇拓展             [查看路径]
```

---

## 9. Phase 2+ 不做（明确砍掉）

- Path 的 DAG 依赖
- AI 依据你的进度自动重排 path（像 Duolingo）
- Source PDF 在线渲染（MVP 只做 markdown；PDF 上传后先 text extraction 再 markdown）
- Highlight 跨端同步 / 移动 app 选区
- Path 分享 / 社区
- 多语言（目前全中文，UI 英文只保留 atlas 品牌词）

---

## 10. 实施顺序（3 大步，每步独立可验收）

### Step 1 — DB schema + Path 生成（1.5 周）
- [ ] migration 004_learning_path.sql
- [ ] lib/ai/path-generator.ts（含 knowledge_domain 判定）
- [ ] API: POST /path/generate, GET /path, PATCH/DELETE stages/resources
- [ ] UI: /path/new 生成页（替换 kickstart redirect）
- [ ] UI: /path 详情页（读 + 编辑）
- [ ] 新建 Atlas 后跳 /path/new 而不是 /kickstart
- [ ] 数据迁移：既有 6 张 kickstart-created sources 保留但 path_resource_id = null

### Step 2 — Source 详情页 + 高亮 + 进度（1 周）
- [ ] API: POST/DELETE highlights, POST to-journal
- [ ] API: PATCH sources 加 reading_progress
- [ ] UI: /sources/[id] 详情页
- [ ] UI: 选区高亮 + 转随记
- [ ] UI: 进度条 + 手动标记已读

### Step 3 — Dashboard 整合 + 体验打磨（0.5 周）
- [ ] Dashboard 加"当前学习"卡片
- [ ] Sources 列表按 stage 分组
- [ ] external / physical 类型的"粘要点"入口
- [ ] kickstart 代码删除（保留 Git 历史）

**里程碑**：Step 1 单独验收（生成 path + 能编辑就行）；Step 2 跟 Step 1 串起来验收（能读 + 能高亮 + 能转随记）；Step 3 收口打磨。

---

## 11. 已确认的最终决定

- **Path 生成模型**：`glm-4.7`（2M tokens 赠送额度，已验证 ~780ms 延迟）
- **重生 Path**：旧 path `is_active=false` soft-delete 保留历史，便于之后做 diff 或回滚
- **physical 书元数据**：MVP 让用户手动填 `title / author / ISBN`；外部 API（豆瓣/亚马逊）不做
- **高亮颜色**：1 种（紫色，与 accent 一致）
