# Atlas Wireframes v1

> ASCII wireframe for MVP. 之后可以转 Figma。

---

## Layout 基础

整站左侧 sidebar 切 Atlas，顶栏做通用操作，主区域按 tab 切换。

```
┌────────────────────────────────────────────────────────────────┐
│  🧠 Atlas                          [+ New Atlas]   [Settings]  │
├────┬───────────────────────────────────────────────────────────┤
│    │                                                            │
│ ll │   [当前 Atlas 的内容]                                      │
│ wk │                                                            │
│ +  │                                                            │
│    │                                                            │
│ ── │                                                            │
│ 📇 │                                                            │
│ Due│                                                            │
│  3 │                                                            │
│    │                                                            │
└────┴───────────────────────────────────────────────────────────┘
     ↑ 左栏：Atlas 列表 + 快捷「今日待复习」数字
```

---

## 页面 1: Dashboard（Atlas Home）

```
┌──────────────────────────────────────────────────────────────┐
│ 🧠 LLM Harness Engineering                    [Export] [⚙]   │
│ 💡 未来 18 个月的关键竞争点是 harness engineering + context   │
│    management。                                              │
│ tags: #llm #agent  ·  12 sources · 85 journal · 24 cards    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌─────────── 📇 今日复习 (3 / 5) ───────────────────────┐   │
│ │  1. Harness 和 context engineering 的关系？            │   │
│ │     [记得 ✓] [模糊] [忘了] [深挖→]                     │   │
│ │  ─────                                                 │   │
│ │  2. Anthropic 的 tool use 设计为什么优雅？            │   │
│ │     [记得] [模糊] [忘了] [深挖]                        │   │
│ │  ─────                                                 │   │
│ │  3. harness 的 L0-L4 如何判定？                        │   │
│ │     [显示答案]                                         │   │
│ └────────────────────────────────────────────────────────┘   │
│                                                              │
│ ┌─────────── 📊 This Week ──────────────────────────────┐   │
│ │  Journal      12                                       │   │
│ │  Flashcards   +5 new                                   │   │
│ │  Sources      4 read / 3 unread                        │   │
│ │  Wiki         2 new concepts                           │   │
│ │  Streak       🔥 12 days                                │   │
│ └────────────────────────────────────────────────────────┘   │
│                                                              │
│ ┌─────────── 📝 AI Weekly Digest (Apr 14-20) ───────────┐   │
│ │  你本周多次提到 harness levels 和 SDLC maturity 的对应│   │
│ │  这个观点从 3 张 flashcard 收敛出来，已经稳定回忆 5   │   │
│ │  次。                                                  │   │
│ │                                                        │   │
│ │  💡 建议:                                              │   │
│ │  • Promote 成 synthesis《Harness Levels vs SDLC》      │   │
│ │  • 深挖 AGENTS.md 的成熟度如何与 L3 匹配               │   │
│ │                                                        │   │
│ │  🔍 Knowledge gaps:                                    │   │
│ │  • 「multi-agent orchestration」只有 1 篇 source       │   │
│ └────────────────────────────────────────────────────────┘   │
│                                                              │
│ [更多复习 →] [+ 新 Journal]                                  │
└──────────────────────────────────────────────────────────────┘
```

---

## 页面 2: Journal

```
┌──────────────────────────────────────────────────────────────┐
│ LLM Harness · Journal                          85 entries    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌──────────────────────────────────────────────────────┐    │
│ │  💭 What's on your mind?                             │    │
│ │  [3-row textarea, Cmd+Enter 提交]                    │    │
│ │                                                      │    │
│ │                                                      │    │
│ │                                [Discard]  [Save ⌘⏎]  │    │
│ └──────────────────────────────────────────────────────┘    │
│  💡 tip: AI 今晚 3am 会 distill 所有未处理的 entry            │
│                                                              │
│ ─── Today (3) ──────────────────────────────────────────    │
│                                                              │
│  14:32  "context 管理才是瓶颈，不是模型"                    │
│         ✨ distilled → flashcard #12                          │
│                                                              │
│  10:15  "anthropic 的 tool use 设计很优雅，比 openai 的       │
│          function call 简洁。"                                │
│         ⏳ pending distill                                    │
│                                                              │
│  08:03  "harness 其实就是给 agent 加 rails"                  │
│         ✨ distilled → flashcard #8 · promoted  🎯           │
│                                                              │
│ ─── Yesterday (5) ──────────────────────────────────────    │
│                                                              │
│  23:48  "agent harness 成熟度和软件工程 L0-L4 对应？"        │
│         ✨ distilled → flashcard #5                           │
│                                                              │
│  ... (更多)                                                  │
│                                                              │
│ [Load more]                                                  │
└──────────────────────────────────────────────────────────────┘
```

---

## 页面 3: Sources

```
┌──────────────────────────────────────────────────────────────┐
│ LLM Harness · Sources                   [+ Add URL / Text]   │
├──────────────────────────────────────────────────────────────┤
│  [ All  |  To Read (3)  |  Reading (1)  |  Read (8) ]        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 📄 Beyond Standard LLMs                              │   │
│  │ Sebastian Raschka · 2026-04-15 · web                 │   │
│  │                                                       │   │
│  │ TL;DR: 除了 transformer 主流路径，本文综述 linear    │   │
│  │ attention, text diffusion, code world model 等替代。 │   │
│  │                                                       │   │
│  │ Status: [⚪ to read ▾]        🔖 0 highlights         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 📄 Harness Engineering Deep Dive                     │   │
│  │ 知乎 · 2026-04-16 · web                               │   │
│  │                                                       │   │
│  │ TL;DR: Harness 四大支柱：Context Architecture、      │   │
│  │ Agent Specialization、Persistent Memory、Structured  │   │
│  │ Execution...                                          │   │
│  │                                                       │   │
│  │ Status: [✅ read ▾]           🔖 5 highlights         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  [Load more]                                                 │
└──────────────────────────────────────────────────────────────┘
```

### Source Detail / Reading

```
┌──────────────────────────────────────────────────────────────┐
│ ← Back to Sources                                            │
│                                                              │
│ 📄 Harness Engineering Deep Dive                             │
│ 知乎 · 2026-04-16                                             │
│                                                              │
│  ┌─ Article (40% width) ─┬─ Highlights (60%) ──┐             │
│  │ ## 四大支柱            │                       │             │
│  │                        │ [no highlights yet]   │             │
│  │ 1. Context Architecture│                       │             │
│  │                        │ 💡 Select text to     │             │
│  │ 上下文分层与渐进式披露 │    highlight          │             │
│  │ 是...                  │                       │             │
│  │                        │                       │             │
│  │ 2. Agent Specialization│                       │             │
│  │                        │                       │             │
│  │ ...                    │                       │             │
│  └────────────────────────┴───────────────────────┘             │
│                                                              │
│  [AI 提炼 → flashcard]     [导出 markdown]    [删除 source]   │
└──────────────────────────────────────────────────────────────┘
```

选中文字后右侧弹出：

```
  ┌────────────────────────────────────┐
  │ 🔖 Add highlight                   │
  │                                    │
  │ 选中: "harness 四大支柱..."        │
  │                                    │
  │ Note (optional):                   │
  │ [ textarea 让你补充想法 ]          │
  │                                    │
  │ [Save] (Cmd+S)                     │
  │                                    │
  │ 💡 This highlight becomes a        │
  │    journal entry tonight.          │
  └────────────────────────────────────┘
```

---

## 页面 4: Flashcards

```
┌──────────────────────────────────────────────────────────────┐
│ LLM Harness · Flashcards                     24 total        │
│ [ Due Today (5) | All (24) | Learning (3) | Mastered (8) ]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Review Mode                        ██████░░░░  2 / 5        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                                                       │   │
│  │  📇                                                   │   │
│  │                                                       │   │
│  │  Harness engineering 和 context engineering 的        │   │
│  │  关系是什么？                                          │   │
│  │                                                       │   │
│  │                                                       │   │
│  │  [Show answer]                                        │   │
│  │                                                       │   │
│  │  Source: journal 2026-04-15                           │   │
│  │  Concept: harness-engineering                         │   │
│  │  Stage: review · Ease: 2.5 · Streak: 4                │   │
│  │                                                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  (点 Show answer 后)                                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  📇 Back                                              │   │
│  │                                                       │   │
│  │  Context engineering 是 harness 的子集。              │   │
│  │  Harness 管整个 agent 执行环境和约束；                │   │
│  │  context engineering 只管喂给 agent 的信息。          │   │
│  │                                                       │   │
│  │  [ 记得 (+3d) ] [ 模糊 (+1d) ] [ 忘了 (<1d) ]         │   │
│  │  [ 有新想法 → journal ]                               │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

---

## 页面 5: Wiki

```
┌──────────────────────────────────────────────────────────────┐
│ LLM Harness · Wiki                            [+ New Page]   │
├─────────────────┬────────────────────────────────────────────┤
│ 📑 Index         │                                            │
│                  │   ## Harness Engineering                   │
│ 💡 Concepts (4)  │                                            │
│  ○ harness-eng   │   ### Actuel                                │
│  ○ context-eng   │   - 定义：围绕 AI Agent 设计约束机制...     │
│  ○ agents-md     │   - 核心问题：...                           │
│  ○ rails         │   - 核心洞察：...                           │
│                  │                                            │
│ 🧑 Entities (1)  │   ### Sources                              │
│  ○ sebastian-r   │   - [[harness-engineering-deep-dive]]      │
│                  │                                            │
│ 🧠 Synthesis (2) │   ### Related Concepts                     │
│  ○ ...           │   - [[context-engineering]] — 子集         │
│                  │   - [[agents-md]] — 组件                   │
│ ❓ Questions (1) │                                            │
│  ○ ...           │   [Edit] [Delete]                          │
│                  │                                            │
│ 🗺 Topics (1)    │   ─── Backlinks ──────────────────────     │
│  ○ ...           │   • [[harness-engineering-deep-dive]]      │
└─────────────────┴────────────────────────────────────────────┘
```

---

## 页面 6: Settings

```
┌──────────────────────────────────────────────────────────────┐
│ Settings                                                     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌─ Profile ────────────────────────────────────────────┐    │
│ │ Email:    lucas@example.com                          │    │
│ │ Timezone: [Asia/Shanghai ▾]                          │    │
│ └──────────────────────────────────────────────────────┘    │
│                                                              │
│ ┌─ AI Configuration ───────────────────────────────────┐    │
│ │ Anthropic API Key: [sk-ant-xxxxxxxx] [Test]          │    │
│ │                                                       │    │
│ │ Models:                                               │    │
│ │   Distill:      [Claude Haiku ▾]                      │    │
│ │   Source Sum:   [Claude Haiku ▾]                      │    │
│ │   Weekly:       [Claude Sonnet ▾]                     │    │
│ └──────────────────────────────────────────────────────┘    │
│                                                              │
│ ┌─ Morning Ritual ─────────────────────────────────────┐    │
│ │ Time:    [08:00 ▾]                                    │    │
│ │ Channel: [x] Email  [ ] Feishu webhook                │    │
│ │ Count:   [5] cards per day                            │    │
│ └──────────────────────────────────────────────────────┘    │
│                                                              │
│ ┌─ Feishu Integration (optional) ──────────────────────┐    │
│ │ Webhook URL: https://atlas.xxx/api/webhooks/feishu    │    │
│ │ Your Feishu open_id: [ou_xxxxxxx] [Connect]           │    │
│ │ Default Atlas: [LLM Harness ▾]                        │    │
│ └──────────────────────────────────────────────────────┘    │
│                                                              │
│ ┌─ Data Export ────────────────────────────────────────┐    │
│ │ [📦 Download Markdown zip]  · All atlases            │    │
│ │ [📦 Export as Obsidian vault]                         │    │
│ └──────────────────────────────────────────────────────┘    │
│                                                              │
│ ┌─ Danger Zone ────────────────────────────────────────┐    │
│ │ [Delete my account]                                   │    │
│ └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

---

## 页面 7: Onboarding（首次登录）

```
Step 1/3 - 欢迎
┌──────────────────────────────────────────────────────────────┐
│  👋 Welcome to Atlas                                         │
│                                                              │
│  Atlas 帮你把散乱的阅读、随记、想法变成有主题、有节奏的学习。 │
│                                                              │
│  三件事每天做：                                              │
│  1. 看 AI 推的源 (1 min)                                     │
│  2. 敲下你的想法 (5 sec)                                     │
│  3. 回几张 flashcard (1 min)                                 │
│                                                              │
│  其它全部 AI 代劳。                                          │
│                                                              │
│                                            [Next →]          │
└──────────────────────────────────────────────────────────────┘

Step 2/3 - 建第一个 Atlas
┌──────────────────────────────────────────────────────────────┐
│  📝 Create your first Atlas                                  │
│                                                              │
│  What do you want to deeply learn?                           │
│                                                              │
│  Name:   [________________________]                          │
│          e.g. "LLM Harness Engineering"                     │
│                                                              │
│  Thesis (your 1-sentence view):                              │
│  [                                                        ]  │
│  [                                                        ]  │
│  [ e.g. "harness + context management is the real moat"  ]  │
│                                                              │
│  Tags: [llm] [agent] [+ add]                                │
│                                                              │
│  [← Back]                                 [Create →]         │
└──────────────────────────────────────────────────────────────┘

Step 3/3 - 连接 AI
┌──────────────────────────────────────────────────────────────┐
│  🔑 Connect your Anthropic API key                           │
│                                                              │
│  Atlas 用你的 Claude API 做 distill / summary / digest。     │
│  你的 key 加密存储，不共享。                                 │
│                                                              │
│  API Key: [________________________] [Test]                  │
│                                                              │
│  💡 Don't have one? [Get it here →]                         │
│                                                              │
│                                                              │
│  [← Back]                            [Skip] [Save & Go →]   │
└──────────────────────────────────────────────────────────────┘
```
