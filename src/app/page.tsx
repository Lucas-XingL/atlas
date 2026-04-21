import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
          <Link href="/" className="inline-flex items-center gap-2">
            <Logo size={22} className="text-primary" />
            <span className="font-semibold tracking-tight">atlas</span>
          </Link>
          <Link href="/login">
            <Button size="sm" variant="outline">
              登录
            </Button>
          </Link>
        </div>
      </header>

      <section className="relative flex-1">
        <div className="mx-auto flex max-w-3xl flex-col items-center px-6 py-28 text-center">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/50 px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Personal AI learning copilot
          </div>

          <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            深度学习{" "}
            <span className="bg-gradient-to-br from-primary via-purple-400 to-primary bg-clip-text text-transparent">
              一个主题
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            每个 Atlas 聚焦一个主题。AI 帮你挑料、提炼随记、调度复习，
            把散点笔记变成有观点的深度理解。
          </p>

          <div className="mt-10 flex items-center gap-3">
            <Link href="/login">
              <Button size="lg">开始使用</Button>
            </Link>
            <a
              href="https://github.com"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              查看设计文档 →
            </a>
          </div>

          <div className="mt-24 grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { t: "入库", d: "URL / 文本 → 15 秒内 AI 摘要" },
              { t: "随记", d: "随手记录 → AI 每晚提炼成卡" },
              { t: "记忆", d: "间隔重复 + 晨间推送" },
            ].map((f) => (
              <div
                key={f.t}
                className="rounded-lg border border-border/60 bg-card/40 p-5 text-left"
              >
                <div className="text-sm font-medium text-primary">{f.t}</div>
                <div className="mt-2 text-sm text-muted-foreground">{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        Atlas · built for deep work
      </footer>
    </main>
  );
}
