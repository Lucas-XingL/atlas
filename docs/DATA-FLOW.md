# Atlas Data Flow — 关键流程时序图

> 5 条关键 pipeline 的具体数据流和调用栈，帮你 Verify 设计可行。

---

## Flow 1: Ingest URL

```
用户 Web 上粘 URL
  ↓
POST /api/atlases/[slug]/sources
  body: { url: "https://..." }
  ↓
Next.js Route Handler
  1. 验证 user 属于该 atlas (RLS 或显式 check)
  2. 立刻 insert sources { url, title: url, status: "unread", raw_content: "" }
  3. 返回 201 with source.id
  4. (非阻塞) 异步调用 fetchAndSummarize(source.id)
  ↓
fetchAndSummarize (serverless function, fire-and-forget)
  ↓
  1. fetch(url, { user-agent: ... })
  2. readability.parse(html) → title + content
  3. turndown(content) → markdown
  4. 识别并下载图片？ → MVP 暂不做（Phase 1.5）
  5. UPDATE sources SET title=..., raw_content=md
  6. 调 Claude Haiku:
     prompt: "Read this article and output JSON {tl_dr, key_claims[], quotes[]}"
     input: md (truncate to 10k tokens)
  7. UPDATE sources SET summary=json
  ↓
Web 轮询 or realtime subscribe (Supabase realtime)
  → 看到 source.summary 更新，UI 显示完整
```

**风险点**：
- `fetch` 超时（默认 Next.js 10s；改长）
- Claude API 慢（平均 3-8s for 10k tokens）
- 大页面（>100k tokens）→ 截断前 + 分块（Phase 2）

**预期耗时**：10-20 秒总体。

---

## Flow 2: Journal Capture

### Via Web

```
用户敲字 Cmd+Enter
  ↓
POST /api/atlases/[slug]/journal
  body: { text: "...", channel: "web" }
  ↓
Route Handler
  INSERT journal_entries { atlas_id, user_id, text, channel, status: "raw" }
  ↓
Return 201 { id, created_at }
  ↓
UI 乐观更新：立刻把 entry 添到时间线
```

### Via 飞书

```
用户发 /j 在想啥
  ↓
飞书 bot platform → webhook
POST /api/webhooks/feishu
  body: { event: { message: { sender_id: ..., content: "/j ..." } } }
  ↓
Route Handler
  1. 验 webhook signature
  2. SELECT user from user_settings WHERE feishu_open_id = sender_id
  3. 如果消息以 /j 开头:
     text = message.content.slice(2).trim()
     INSERT journal_entries { atlas_id: user.default_atlas, text, channel: "feishu", status: "raw" }
  4. 回复飞书 "📝 已记 (#N) · 今晚 distill"
  ↓
Return 200 OK
```

**风险点**：
- 飞书 webhook 延迟
- 多用户时 open_id 映射
- 消息体格式解析（各 bot 框架不同）

MVP 先只支持单用户（你），hard-code 默认 atlas。

---

## Flow 3: Distill（每晚 3am Cron）

```
Supabase pg_cron 触发 (03:00 用户时区)
  ↓
POST /api/cron/distill
  header: x-cron-secret: <CRON_SECRET>
  ↓
Route Handler (持续 ~5-10 分钟)
  1. 查所有 user + 所有 atlas 有 status="raw" 的 journal_entries
     （按 user 分组，避免一次处理太多）
  2. 对每个 user + atlas 组合:
     a. 拉最近 24 小时的 raw journal（最多 50 条）
     b. 拉该 atlas 近期 existing flashcards（最近 30 张，避免 duplicate）
     c. 调 Claude Sonnet:
        prompt (见 PRD §6.4.2)
        input: entries + existing_cards summaries
        output: { new_cards: [{front, back, origin_ids: []}] }
     d. 对 output 中每张 new_card:
        - INSERT flashcards {..., sr: default(new)}
        - UPDATE origin journal_entries SET status="distilled",
                 processed_at=now(),
                 ai_annotations.flashcard_ids += [card.id]
     e. 没被识别的 journal（不适合做 card）也 UPDATE status="archived"
  3. 记录本次 cron 运行 metrics
  ↓
Return 200 { processed: { users: N, journals: M, cards: K } }
```

**控制措施**：
- 每次调 Sonnet 超时设 90s
- 超过则 partial commit（保留未处理为 raw 下次再试）
- Claude 返回 malformed JSON → log + fallback（不 distill）
- 单次 user 单次 atlas 最多 20 条 entries（过多时分批）

---

## Flow 4: Morning Ritual（每天 8am 用户时区）

```
pg_cron 按用户时区分别触发
  ↓
POST /api/cron/morning-push?user_id=xxx
  ↓
Route Handler
  1. 查该用户所有 atlas 的 due flashcards:
     SELECT * FROM flashcards
     WHERE user_id = xxx
       AND next_review_at <= now() + interval '4 hours'  -- 扩一点窗口
     ORDER BY next_review_at
     LIMIT 5
  2. 查昨日 distill 的 new flashcards:
     WHERE user_id = xxx
       AND created_at > now() - interval '24 hours'
     LIMIT 10
  3. 渲染邮件 HTML / 飞书卡片:
     - due 5 张 preview
     - new 卡提醒
     - deep link → atlas.xxx/app/flashcards/due
  4. 调 Resend / 飞书 webhook 发送
  5. 记录 morning_push_sent 到 user_settings
  ↓
Return 200
```

---

## Flow 5: Flashcard Review

```
用户在 UI 点 [记得]
  ↓
POST /api/flashcards/[id]/review
  body: { rating: "remembered" }
  ↓
Route Handler
  1. SELECT flashcard (确认 user owns)
  2. rating_to_q = { remembered: 5, foggy: 3, forgot: 1 }
  3. new_sr = sm2(card, q)
  4. UPDATE flashcards SET ease=..., interval_days=..., next_review_at=..., review_count += 1, success_count += (q >= 3 ? 1 : 0), maturity=..., stage=...
  5. 如果 success_count >= 5 且没被 promoted → 加 hint "candidate for synthesis"
  ↓
Return updated card
  ↓
UI 自动切下一张
```

---

## Flow 6: Weekly Digest（周日 8am）

```
pg_cron 触发
  ↓
POST /api/cron/weekly-digest
  ↓
Route Handler (per user)
  1. 对每个 active atlas:
     a. 查本周 (Mon-Sun):
        - journal_entries count + samples
        - flashcards created count + samples
        - sources read count + titles
        - reviews count + retention rate
        - wiki page updates
     b. 调 Claude Sonnet:
        prompt (见 PRD §6.4.3)
        input: 上述 digest data
        output: markdown (200-300 字)
     c. INSERT digest_snapshots { atlas_id, period='weekly', period_start, period_end, content }
  2. 发邮件/飞书: "本周 Atlas 摘要 · 查看详情"
  ↓
Return 200
```

---

## Flow 7: Export

```
用户点 [Export Markdown]
  ↓
GET /api/export
  ↓
Route Handler
  1. 查该 user 所有 atlases + sources + journal + flashcards + wiki pages
  2. 构建 zip:
     atlases/
       <slug>/
         _meta.json  (thesis, tags)
         sources/<source-slug>.md
         journal/<date>.md  (按天聚合)
         flashcards.json
         wiki/
           concepts/<slug>.md
           entities/<slug>.md
           synthesis/<slug>.md
     scratch/
       orphan-flashcards.json
  3. Return zip as stream (Content-Disposition: attachment)
```

---

## 关键设计决策

### 为什么 distill 单独 cron，不在 journal 写入时同步跑？

- 用户写 journal 要快（<100ms），不能等 LLM
- distill 需要 context（多条 journal + 已有 cards），同步跑只有 1 条就浪费
- 异步 + 批处理 更经济

### 为什么 user 要自己绑 Claude API key？

- 成本不摊到我们
- 用户数据经过他们自己的 API（隐私好）
- 避免 free-rider

### 为什么 RLS 而不是应用层验权？

- Supabase 原生支持
- 即使 API 有 bug，数据库层拒绝跨 user 访问
- 少写大量 `WHERE user_id = x`

### 为什么 Realtime subscribe 只在 MVP 的 source summary 里用？

- Source 是**异步生成的**，UI 需要看到更新
- 其它数据（journal, flashcard, wiki）用户主动操作，TanStack Query 乐观更新就够
- Realtime 多了 connection 开销

---

## 监控指标（MVP 期间）

| Metric | Alert 阈值 |
|---|---|
| API 5xx rate | > 1% |
| Distill cron 失败率 | > 5% |
| Claude API 平均延迟 | > 15s |
| Source fetch 失败率 | > 20%（高了改降级路径） |
| Morning push 送达率 | < 95% |
| MAU | 跟踪变化趋势 |
