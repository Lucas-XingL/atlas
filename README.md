# Atlas

> 个人化 AI 学习副驾驶。每个知识库（Atlas）有明确主题，AI 主动推源、提炼灵感、跟踪学习轨迹。

## Status

MVP code scaffolded (Next.js 14 + Supabase + GLM/MiniMax). Awaiting your Vercel & Supabase accounts to deploy.

## Design Docs

1. [PRD v3](docs/PRD-v3.md) — **当前版本**. 三管道 × 阅读池
2. [PRD v2](docs/PRD-v2.md) — v2 LearningPath + Highlight (已实现)
3. [PRD v1](docs/PRD-v1.md) — v1 基线 (已实现)
4. [WIREFRAMES](docs/WIREFRAMES.md) — UI 线框 (v1)
5. [DATA-FLOW](docs/DATA-FLOW.md) — 关键流程时序 (v1)
6. [IMPLEMENTATION-PLAN](docs/IMPLEMENTATION-PLAN.md) — 3 周 MVP 实现计划 (v1, 已完成)

## Stack

- **Frontend**: Next.js 14 App Router · React 18 · Tailwind + custom tokens (ElevenLabs-inspired dark + violet `#8B5CF6`)
- **Backend**: Next.js Route Handlers (Node runtime) · Supabase (Postgres + Auth + pg_cron)
- **AI**: 双厂商 provider-agnostic — **智谱 GLM-5.1 / 4.7-FlashX** (默认) · **MiniMax-M2.7 / M2.7-highspeed** (备选)。用户在 settings 切换，OpenAI-compat ChatCompletion endpoint
- **Email push**: Resend

## 代码结构

```
src/
├── app/
│   ├── page.tsx                        # 落地页
│   ├── login/                          # magic-link 登录
│   ├── auth/{callback,signout}/        # OAuth 回调
│   ├── app/                            # 登录后的 layout + 侧栏
│   │   ├── atlases/{new,[slug]/*}/
│   │   ├── flashcards/due/             # 跨 Atlas 复习
│   │   └── settings/
│   └── api/
│       ├── atlases/*                   # CRUD + sources + journal + distill
│       ├── flashcards/{due, [id]/review}
│       ├── cron/{distill, morning-push, weekly-digest}
│       ├── settings/
│       └── export/
├── lib/
│   ├── ai/                             # provider / summarize / distill / json
│   ├── fetch/web.ts                    # readability + turndown
│   ├── sr/sm2.ts                       # Spaced repetition
│   ├── notify/email.ts                 # Resend
│   ├── supabase/{client,server,middleware}.ts
│   └── types/
├── components/                         # shadcn-style UI + 业务组件
└── middleware.ts                       # 路由保护

supabase/migrations/
├── 001_init.sql                        # tables, triggers, bootstrap
├── 002_rls.sql                         # Row level security
└── 003_cron.sql                        # pg_cron 每晚 distill / 每小时 morning push / 周日 digest
```

## MVP 功能

1. **Auth** — 邮箱 magic link
2. **Atlas CRUD** — 列表 / 新建 / tabs（Dashboard / Sources / Journal / Flashcards）
3. **Source ingest** — URL (Readability + Turndown → LLM summary) · 粘贴文本
4. **Journal** — Web 输入 (Cmd+Enter) · 时间线分组
5. **AI Distill** — 每晚 cron · `/api/atlases/[slug]/distill` 手动按钮
6. **Spaced Repetition + Morning Ritual** — SM-2 · Resend 邮件 · 周日摘要

## 本地开发

```bash
pnpm install
cp .env.example .env.local    # 填入 Supabase + LLM key
pnpm dev
```

### 必填环境变量

| Var | 用途 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 公开 anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端 (cron + fire-and-forget) |
| `NEXT_PUBLIC_APP_URL` | 邮件 deep-link 用 |
| `CRON_SECRET` | pg_cron 调用 `/api/cron/*` 的 header secret |
| `ZHIPU_API_KEY` 或 `MINIMAX_API_KEY` | 开发时的 fallback key（用户可在 settings 覆盖） |
| `RESEND_API_KEY` + `RESEND_FROM_EMAIL` | 晨间推送（没配就 skip） |

## 部署（你稍后搞定时走这些步骤）

### 1. Supabase

1. https://supabase.com 新建 project（任意 region，建议 ap-southeast-1）
2. SQL Editor 依次跑 `supabase/migrations/001_init.sql` → `002_rls.sql`
3. Dashboard → Project Settings → API：记下 URL / anon / service_role
4. Dashboard → Database → Extensions：启用 `pg_cron` 和 `pg_net`
5. SQL Editor 跑：
   ```sql
   ALTER DATABASE postgres SET "app.settings.app_url" TO 'https://YOUR-VERCEL-URL.vercel.app';
   ALTER DATABASE postgres SET "app.settings.cron_secret" TO 'YOUR-CRON-SECRET';
   ```
6. SQL Editor 跑 `003_cron.sql`

### 2. Vercel

1. https://vercel.com 新建 project，连接 GitHub repo
2. Framework: Next.js（自动识别）
3. Env vars：全填进去（见上表）
4. Deploy
5. 回 Supabase 用第一步得到的 Vercel URL 更新 `app.settings.app_url`

### 3. LLM API Key（运行时首次使用前）

- 智谱：https://open.bigmodel.cn/usercenter/apikeys → 创建 API Key
- MiniMax：https://platform.minimaxi.com/user-center/basic-information/interface-key
- 登录 Atlas → /app/settings → 选 provider → 粘贴 key → 保存

### 4. Resend（可选，不配就跳过邮件推送）

- https://resend.com → API Keys → 创建
- 绑定一个域名或先用 `onboarding@resend.dev`

## 验证 MVP

1. 登录 → 创建 Atlas「LLM Harness」→ 写 thesis
2. Sources → 粘一个 URL（例如 lilianweng 博客）→ 15s 内看到 summary
3. Journal → 写 3-5 条随记 → Cmd+Enter
4. 点「现在提炼」按钮 → 应该看到 N 张 flashcard
5. 跨 Atlas 复习 → 打三次分（记得/模糊/忘了）
6. 一周后查 Dashboard → weekly digest 应该出现

## Roadmap (Phase 2+)

- AI source 推荐（主动找源）
- Framework 自演化
- Wiki pages + backlinks
- Flashcard → Synthesis promotion
- 飞书 bot 集成（MVP 不做）
- Obsidian 导入（MVP 不做）
- 移动 PWA

## License

Private. Built for personal use.
