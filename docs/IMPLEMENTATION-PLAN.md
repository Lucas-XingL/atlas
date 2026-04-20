# Atlas Implementation Plan — Phase 1 MVP

> 3 周严格 MVP。6 个 must-have 功能，全程部署到 Vercel + Supabase 线上环境。

---

## 工作量估算

| Week | Hours | 交付 |
|---|---|---|
| W1 | ~20h | Infra + Auth + Atlas CRUD |
| W2 | ~20h | Source + Journal + Web UI |
| W3 | ~20h | Distill + Flashcard + Morning + Digest |
| Buffer | ~10h | Polish + 真实使用 + bug 修 |
| **Total** | **~70h** | |

按每周 10-15 小时业余时间估，6-8 周完成。

---

## Week 1: Foundation

### 1.1 Repo & tooling setup（Day 1-2）

**任务**：
- [ ] 初始化 Next.js 14 项目（App Router, TypeScript, Tailwind, ESLint）
- [ ] 装 shadcn/ui、TanStack Query、zod
- [ ] 配 Supabase 项目（本地 + 线上）
- [ ] 初始化 Supabase schema（见 PRD §6.2）
- [ ] 配 Row Level Security
- [ ] 配 GitHub Actions（TypeScript 检查 + 测试）
- [ ] 部署到 Vercel（接上 Supabase 环境变量）

**交付物**：
- `https://atlas-<你的 subdomain>.vercel.app` 能打开（显示 hello world）
- `supabase/migrations/001_init.sql` 应用成功
- RLS 阻止跨用户读写

### 1.2 Auth（Day 3）

**任务**：
- [ ] Supabase magic link 登录 UI
- [ ] `/login`、`/auth/callback` 页面
- [ ] `middleware.ts` 保护 `/app/*` 路由
- [ ] User settings table 初始化（新用户注册时自动插入默认 row）

**交付物**：
- 邮箱输入 → 收 magic link → 点击登录 → 跳 `/app`

### 1.3 Atlas CRUD（Day 4-7）

**任务**：
- [ ] API: `POST/GET/PATCH/DELETE /api/atlases`、`/api/atlases/[slug]`
- [ ] 页面: `/app/atlases`（列表）、`/app/atlases/new`（新建）、`/app/atlases/[slug]`（详情空态）
- [ ] shadcn Form + zod schema for 新建
- [ ] Atlas 左 sidebar 组件
- [ ] Onboarding 3 步（见 wireframe）

**交付物**：
- 能登录 → 新建一个 Atlas "Test" → 列表看到 → 点进详情（空态）

---

## Week 2: Input Pipelines

### 2.1 Source Ingest（Day 8-11）

**任务**：
- [ ] 装 `@mozilla/readability` + `turndown` + `jsdom`
- [ ] 实现 `lib/fetch/web.ts`：URL → title + markdown
- [ ] 实现 `lib/fetch/text.ts`：user paste text → normalize
- [ ] API: `POST /api/atlases/[slug]/sources`（URL or text → create source）
- [ ] 调用 Claude Haiku 生成 summary（`lib/ai/summarize.ts`）
- [ ] 页面: Sources list tab + detail reader
- [ ] 图片下载（Substack patches 等）—— **Phase 1.5 再做**，MVP 留 remote URL

**交付物**：
- 在 Atlas 里粘 URL "https://lilianweng.github.io/posts/2023-06-23-agent/" → 15 秒内后台完成 fetch + summary → Sources 列表出现

### 2.2 Journal 快速输入（Day 12-13）

**任务**：
- [ ] API: `POST/GET /api/atlases/[slug]/journal`
- [ ] 页面: Journal tab（快速输入框 + 时间线）
- [ ] Cmd+Enter 提交
- [ ] 飞书 webhook `POST /api/webhooks/feishu`（解 `/j <text>` 命令）
  - 简化版：webhook 查 user_settings 找 feishu_open_id 匹配的用户 → 往其 default_atlas 写 entry
  - MVP 先只做单用户（你本人），hard-code 的关系可以直接在 settings 里配

**交付物**：
- Web 上能写 journal → 立刻看到
- 飞书发 `/j test` → 30 秒内 Web 刷新能看到

### 2.3 Polish（Day 14）

**任务**：
- [ ] Atlas dashboard 页（基础 stats 卡片）
- [ ] 左 sidebar 的 Atlas 切换 + "Due Today (N)"
- [ ] 全局 toast 通知（react-hot-toast）
- [ ] 黑白模式切换
- [ ] 键盘快捷键（/ 全局搜索 placeholder，暂不实装搜索）

**交付物**：
- Atlas 看起来像个产品了（不是原型）

---

## Week 3: AI Intelligence

### 3.1 Distill Pipeline（Day 15-17）

**任务**：
- [ ] 实现 `lib/ai/distill.ts`:
  ```typescript
  async function distillJournal(entries: JournalEntry[], existing: Flashcard[]): Promise<DistillResult>
  ```
- [ ] 返回：新 flashcards[] + 更新的 journal.status / ai_annotations
- [ ] 调用 Claude Sonnet（distill 需要质量）
- [ ] API: `POST /api/cron/distill`（header-protected with `CRON_SECRET`）
- [ ] 配置 Supabase pg_cron 每晚 3am 触发
  - 备份方案: Vercel Cron
- [ ] Prompt engineering（参见 PRD §6.4.2）
- [ ] 手动 trigger 按钮：settings 里 "Run distill now"

**交付物**：
- 晚上 3am 自动跑 → 第二天打开 Atlas 看到 journal 条目标 distilled，有新 flashcard

### 3.2 Flashcard + Spaced Repetition（Day 18-19）

**任务**：
- [ ] 实现 SM-2 算法 `lib/sr/sm2.ts`
- [ ] API:
  - `GET /api/flashcards/due?atlas_slug=xxx`（跨 atlas 可选）
  - `POST /api/flashcards/[id]/review { rating: 'remembered'|'foggy'|'forgot' }`
- [ ] 页面: Flashcards tab（review 模式 + all 模式）
- [ ] Review UI（front → show answer → 3 按钮）
- [ ] 反馈映射: remembered=5, foggy=3, forgot=1 → sm2(q)

**交付物**：
- 能 review 卡片，SR 正确调 next_review_at

### 3.3 Morning Ritual（Day 20-21）

**任务**：
- [ ] API: `POST /api/cron/morning-push`
- [ ] 配 pg_cron 每天 8am（用户时区）触发
- [ ] 实现 `lib/notify/email.ts`（用 Resend 或 Supabase 内置 email）
- [ ] 实现 `lib/notify/feishu.ts`（发到用户配置的 webhook）
- [ ] 推送内容：HTML 邮件 or 飞书卡片，含 N 张 flashcard preview + deep link

**交付物**：
- 8am 邮箱收到 "今日 5 张卡"，点击进 Atlas review 页

### 3.4 Weekly Digest（Day 22-23）

**任务**：
- [ ] API: `POST /api/cron/weekly-digest`（pg_cron 每周日 8am 触发）
- [ ] 实现 `lib/ai/weekly-digest.ts`：调 Sonnet 生成 markdown
- [ ] Snapshot 到 `digest_snapshots` 表
- [ ] Dashboard 展示最新 digest

**交付物**：
- 周日早上 dashboard 看到本周摘要

### 3.5 Export & Polish（Day 24-25）

**任务**：
- [ ] API: `GET /api/export` → 返回 zip (markdown 文件 + JSON metadata)
- [ ] Settings 页加 "Export" 按钮
- [ ] E2E 真实使用 1 周，收集 bug

---

## 技术决策清单

| 项 | 选择 | 原因 |
|---|---|---|
| Framework | Next.js 14 App Router | RSC + serverless 完美配合 Vercel |
| Styling | Tailwind + shadcn/ui | 写得快，组件够用 |
| DB | Supabase Postgres | 自带 Auth、Realtime、RLS、cron |
| Auth | Supabase Email Magic Link | 不用密码，简单 |
| Cron | Supabase pg_cron（首选）+ Vercel Cron（备份） | pg_cron 更可靠 |
| AI SDK | `@anthropic-ai/sdk` | 官方 |
| Fetch HTML | `@mozilla/readability` + `turndown` | 最稳定 |
| Email | Resend | 免费额度足够，DX 好 |
| State (client) | TanStack Query | 缓存 + 乐观更新 |
| Forms | react-hook-form + zod | 类型安全 |
| Deploy | Vercel | Next.js 原生支持 |
| Monitoring | Vercel Analytics 免费版 | MVP 够用 |
| Error tracking | 推迟（Phase 2） | 免费用户量不值得 |

---

## 文件结构

```
~/Code/atlas/
├── docs/
│   ├── PRD.md                    ← 产品需求（已写）
│   ├── WIREFRAMES.md             ← 线框（已写）
│   ├── IMPLEMENTATION-PLAN.md    ← 本文件
│   └── DATA-FLOW.md              ← 数据流（待写）
├── supabase/
│   ├── migrations/
│   │   ├── 001_init.sql
│   │   ├── 002_rls.sql
│   │   └── 003_cron.sql
│   ├── functions/                ← Edge Functions（如需要）
│   └── config.toml
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx              ← 落地页
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   └── callback/
│   │   ├── (app)/
│   │   │   ├── layout.tsx        ← 含 sidebar
│   │   │   ├── atlases/
│   │   │   │   ├── page.tsx      ← list
│   │   │   │   ├── new/
│   │   │   │   └── [slug]/
│   │   │   │       ├── page.tsx  ← dashboard
│   │   │   │       ├── sources/
│   │   │   │       ├── journal/
│   │   │   │       ├── flashcards/
│   │   │   │       └── wiki/
│   │   │   ├── flashcards/       ← 跨 atlas 复习
│   │   │   │   └── due/
│   │   │   └── settings/
│   │   └── api/
│   │       ├── atlases/
│   │       ├── webhooks/feishu/
│   │       ├── cron/
│   │       │   ├── distill/
│   │       │   ├── morning-push/
│   │       │   └── weekly-digest/
│   │       └── export/
│   ├── components/
│   │   ├── ui/                   ← shadcn 生成的
│   │   ├── atlas-sidebar.tsx
│   │   ├── journal-input.tsx
│   │   ├── flashcard-review.tsx
│   │   └── ...
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── server.ts
│   │   │   └── client.ts
│   │   ├── ai/
│   │   │   ├── claude.ts
│   │   │   ├── distill.ts
│   │   │   ├── summarize.ts
│   │   │   └── weekly-digest.ts
│   │   ├── fetch/
│   │   │   ├── web.ts
│   │   │   └── text.ts
│   │   ├── sr/
│   │   │   └── sm2.ts
│   │   ├── notify/
│   │   │   ├── email.ts
│   │   │   └── feishu.ts
│   │   └── types/
│   │       └── index.ts          ← Atlas / Source / JournalEntry / Flashcard ...
│   └── hooks/
│       ├── use-atlas.ts
│       └── ...
├── .env.example
├── .env.local                    ← gitignore
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── README.md
```

---

## 部署步骤（首次）

1. **Supabase**
   - 在 supabase.com 创建 project
   - 在 SQL editor 跑 `001_init.sql` + `002_rls.sql`
   - 记下 project URL + anon key + service_role key

2. **Vercel**
   - 连 GitHub repo `~/Code/atlas`
   - 设置 env vars:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_ROLE_KEY`
     - `ANTHROPIC_API_KEY`（fallback，用户自己的 key 会覆盖）
     - `CRON_SECRET`（保护 cron endpoints）
     - `RESEND_API_KEY`
   - 部署

3. **域名**（可选）
   - 买 `atlas.xxx.com` 或用 Vercel 子域 `atlas-xxx.vercel.app`

4. **飞书 bot**（可选）
   - 在 OpenPlatform 创建 app
   - 加 webhook 指向 `https://atlas.xxx/api/webhooks/feishu`
   - 把 bot open_id 填到 settings

---

## 验收测试清单（Done 标准）

| # | 场景 | 预期 |
|---|---|---|
| 1 | 新用户 onboarding | 3 步走完能建 Atlas |
| 2 | 粘贴 Substack URL | 15 秒内有 title + summary |
| 3 | Web 上敲 "test" journal | 立刻出现在时间线 |
| 4 | 飞书发 `/j test` | 30 秒内出现在时间线 |
| 5 | 等 1 晚 | 次日能看到 distill 结果 |
| 6 | 复习 flashcard | SR 正确调 next_review |
| 7 | 早上 8am | 收邮件/飞书推送 |
| 8 | 周日早上 | 看到 weekly digest |
| 9 | 点 export | 下载 zip 能在 Obsidian 打开 |

---

## 已知风险

1. **Supabase pg_cron 可能不稳** → 备用 Vercel Cron（不过 free tier 只支持 daily，不够 fine-grained）
2. **飞书 bot 配置繁琐** → Phase 1.5 再做完整，MVP 先支持 Web 输入即可
3. **Claude API 偶尔 ratelimit** → 加 backoff + retry
4. **Substack / 复杂 SPA 抓取失败** → fallback "提示用户自己粘正文"
5. **我写不动 / 时间不够** → 每 Week 末 review，必要时砍 feature

---

## 接下来我需要你做的

在写任何代码前，你先回答几个问题（见 PRD §11 开放问题）：

- [ ] 域名：用 `atlas.xxx.com` 还是先用 Vercel 免费子域？
- [ ] Anthropic API key：用户自绑还是我们代付？
- [ ] 飞书 bot 是不是 MVP 必需？
- [ ] 想不想继续用现在的 Supabase / Vercel 账户还是新建

我回答完你拍板后，下一步就是 `pnpm create next-app@latest atlas` + Supabase schema 建表。
