# Atlas

> 个人化 AI 学习副驾驶。每个知识库（Atlas）有明确主题，AI 主动推源、提炼灵感、跟踪学习轨迹。

## Status

🚧 Design docs complete. Code not started.

## Design Docs

1. [PRD](docs/PRD.md) — 产品需求、对象模型、MVP 范围
2. [WIREFRAMES](docs/WIREFRAMES.md) — UI 线框（ASCII）
3. [DATA-FLOW](docs/DATA-FLOW.md) — 关键流程时序
4. [IMPLEMENTATION-PLAN](docs/IMPLEMENTATION-PLAN.md) — 3 周 MVP 实现计划

## MVP 6 个核心功能

1. Auth（email magic link）
2. Atlas CRUD
3. Source ingest（URL + text）
4. Journal 捕获（Web + 飞书）
5. AI Distill（每晚 cron 从 journal 提炼 flashcard）
6. Spaced Repetition + Morning Ritual

## Stack

Next.js 14 + Supabase + Claude API + Vercel

## 下一步

回答开放问题（见 PRD §11），然后 `pnpm create next-app@latest atlas`。
