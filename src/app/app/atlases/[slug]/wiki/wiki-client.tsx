"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { cn, formatRelative } from "@/lib/utils";
import { BookOpen, FileText, Loader2, Network, Sparkles } from "lucide-react";
import type { WikiLogEntry, WikiPage } from "@/lib/types";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

export type WikiGraphNode = {
  id: string;
  slug: string;
  title: string;
  kind: "source" | "concept" | "index" | "synthesis";
  updated_at: string;
  tags: string[];
};
export type WikiGraphEdge = { source: string; target: string };

const KIND_STYLE: Record<
  WikiGraphNode["kind"],
  { color: string; label: string; icon: React.ReactNode }
> = {
  source: { color: "#38bdf8", label: "Source", icon: <FileText className="h-3 w-3" /> },
  concept: { color: "#a78bfa", label: "Concept", icon: <Sparkles className="h-3 w-3" /> },
  synthesis: { color: "#f472b6", label: "Synthesis", icon: <Network className="h-3 w-3" /> },
  index: { color: "#64748b", label: "Index", icon: <BookOpen className="h-3 w-3" /> },
};

export function WikiClient({
  slug,
  nodes,
  edges,
  logs,
  sourceCount,
  ingestedCount,
  initialSlug,
}: {
  slug: string;
  nodes: WikiGraphNode[];
  edges: WikiGraphEdge[];
  logs: WikiLogEntry[];
  sourceCount: number;
  ingestedCount: number;
  initialSlug: string | null;
}) {
  const [activeSlug, setActiveSlug] = React.useState<string | null>(initialSlug);
  const [activePage, setActivePage] = React.useState<WikiPage | null>(null);
  const [backlinks, setBacklinks] = React.useState<
    Array<{ id: string; slug: string; title: string; kind: string }>
  >([]);
  const [loading, setLoading] = React.useState(false);
  const [tab, setTab] = React.useState<"graph" | "list">("graph");
  const [kindFilter, setKindFilter] = React.useState<"all" | WikiGraphNode["kind"]>("all");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [dims, setDims] = React.useState({ w: 600, h: 520 });

  React.useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDims({
          w: Math.floor(entry.contentRect.width),
          h: Math.max(420, Math.floor(entry.contentRect.height)),
        });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Seed with the atlas-level index page if present
  React.useEffect(() => {
    if (activeSlug) return;
    const idx = nodes.find((n) => n.slug === "index");
    if (idx) setActiveSlug("index");
    else if (nodes.length > 0) setActiveSlug(nodes[0].slug);
  }, [nodes, activeSlug]);

  // Load page body when active changes
  React.useEffect(() => {
    if (!activeSlug) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/atlases/${slug}/wiki/${activeSlug}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.page) {
          setActivePage(j.page);
          setBacklinks(j.backlinks ?? []);
        } else {
          setActivePage(null);
          setBacklinks([]);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [activeSlug, slug]);

  const filteredNodes =
    kindFilter === "all" ? nodes : nodes.filter((n) => n.kind === kindFilter);
  const filteredIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = edges.filter(
    (e) => filteredIds.has(e.source) && filteredIds.has(e.target)
  );

  const graphData = React.useMemo(() => {
    return {
      nodes: filteredNodes.map((n) => ({
        ...n,
        val: n.kind === "concept" ? 5 : n.kind === "synthesis" ? 8 : 3,
      })),
      links: filteredEdges.map((e) => ({ source: e.source, target: e.target })),
    };
  }, [filteredNodes, filteredEdges]);

  const activeNodeId = nodes.find((n) => n.slug === activeSlug)?.id ?? null;

  if (nodes.length === 0) {
    return <EmptyState slug={slug} sourceCount={sourceCount} />;
  }

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6 lg:px-8">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">知识库</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            读过的内容会自动 ingest 到这里，形成可交互的 wiki 网络 · 共 {nodes.length} 页
            {" · "}
            {ingestedCount}/{sourceCount} 个 source 已入库
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle tab={tab} onChange={setTab} />
          <KindFilter value={kindFilter} onChange={setKindFilter} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr),minmax(360px,480px)]">
        {/* Left: graph or list */}
        <div
          ref={containerRef}
          className="relative h-[620px] overflow-hidden rounded-lg border border-border/60 bg-card/30"
        >
          {tab === "graph" ? (
            <Graph
              data={graphData}
              width={dims.w}
              height={dims.h}
              activeNodeId={activeNodeId}
              onNodeClick={(slug) => setActiveSlug(slug)}
            />
          ) : (
            <PageList
              nodes={filteredNodes}
              activeSlug={activeSlug}
              onClick={setActiveSlug}
            />
          )}
        </div>

        {/* Right: markdown panel */}
        <aside className="min-h-[620px] rounded-lg border border-border/60 bg-card/40 p-0">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 加载中
            </div>
          ) : activePage ? (
            <PagePanel
              slug={slug}
              page={activePage}
              backlinks={backlinks}
              allSlugs={new Set(nodes.map((n) => n.slug))}
              onNavigate={setActiveSlug}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              点一个节点看它的 page
            </div>
          )}
        </aside>
      </div>

      {/* Recent activity */}
      {logs.length > 0 ? (
        <div className="mt-6 rounded-lg border border-border/60 bg-card/30 p-5">
          <div className="mb-3 flex items-center gap-2">
            <div className="text-sm font-medium">最近活动</div>
            <Badge variant="outline">{logs.length}</Badge>
          </div>
          <ul className="space-y-3">
            {logs.map((l) => (
              <li key={l.id} className="text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="tabular-nums">{l.created_at.slice(0, 10)}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">
                    {l.kind}
                  </span>
                  <span className="truncate text-foreground/90">{l.summary}</span>
                </div>
                {l.pages_touched.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-2 pl-1">
                    {l.pages_touched.map((t, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveSlug(t.slug)}
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px]",
                          t.action === "created"
                            ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                            : t.action === "updated"
                              ? "bg-primary/10 text-primary hover:bg-primary/20"
                              : "bg-muted text-muted-foreground"
                        )}
                      >
                        {t.action === "created" ? "+" : "↻"} {t.title}
                      </button>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// ----------------------------------------------------------------------
// Graph subview
// ----------------------------------------------------------------------

function Graph({
  data,
  width,
  height,
  activeNodeId,
  onNodeClick,
}: {
  data: { nodes: Array<WikiGraphNode & { val: number }>; links: WikiGraphEdge[] };
  width: number;
  height: number;
  activeNodeId: string | null;
  onNodeClick: (slug: string) => void;
}) {
  return (
    <ForceGraph2D
      width={width}
      height={height}
      graphData={data}
      backgroundColor="rgba(0,0,0,0)"
      linkColor={() => "rgba(255,255,255,0.12)"}
      linkWidth={(l: unknown) => {
        const link = l as { source: { id?: string } | string; target: { id?: string } | string };
        const srcId = typeof link.source === "string" ? link.source : link.source.id;
        const tgtId = typeof link.target === "string" ? link.target : link.target.id;
        return srcId === activeNodeId || tgtId === activeNodeId ? 1.8 : 0.6;
      }}
      nodeRelSize={4}
      nodeCanvasObject={(node: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const n = node as WikiGraphNode & { x: number; y: number; val: number };
        const isActive = n.id === activeNodeId;
        const style = KIND_STYLE[n.kind];
        const radius = Math.sqrt(n.val) * 2.2;

        ctx.beginPath();
        ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = style.color;
        ctx.globalAlpha = isActive ? 1 : 0.85;
        ctx.fill();

        if (isActive) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2 / globalScale;
          ctx.stroke();
        }

        // Label
        const fontSize = Math.max(10 / globalScale, 2.5);
        ctx.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.globalAlpha = isActive ? 1 : 0.7;
        ctx.fillStyle = isActive ? "#fff" : "rgba(230,230,240,0.85)";
        ctx.fillText(truncate(n.title, 24), n.x, n.y + radius + 2);
        ctx.globalAlpha = 1;
      }}
      onNodeClick={(node: unknown) => {
        const n = node as WikiGraphNode;
        onNodeClick(n.slug);
      }}
      cooldownTicks={120}
      enableNodeDrag={true}
    />
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// ----------------------------------------------------------------------
// List subview
// ----------------------------------------------------------------------

function PageList({
  nodes,
  activeSlug,
  onClick,
}: {
  nodes: WikiGraphNode[];
  activeSlug: string | null;
  onClick: (slug: string) => void;
}) {
  const byKind = {
    synthesis: nodes.filter((n) => n.kind === "synthesis"),
    concept: nodes.filter((n) => n.kind === "concept"),
    source: nodes.filter((n) => n.kind === "source"),
    index: nodes.filter((n) => n.kind === "index"),
  };
  const sections: Array<[string, WikiGraphNode[]]> = [
    ["综述", byKind.synthesis],
    ["概念", byKind.concept],
    ["Source 笔记", byKind.source],
    ["系统", byKind.index],
  ];

  return (
    <div className="h-full overflow-y-auto p-3">
      {sections.map(([label, items]) =>
        items.length === 0 ? null : (
          <div key={label} className="mb-5">
            <div className="sticky top-0 z-10 bg-card/90 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground backdrop-blur">
              {label} · {items.length}
            </div>
            <ul className="mt-1 space-y-0.5">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => onClick(n.slug)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      activeSlug === n.slug
                        ? "bg-primary/15 text-primary"
                        : "text-foreground/85 hover:bg-muted"
                    )}
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: KIND_STYLE[n.kind].color }}
                    />
                    <span className="truncate">{n.title}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {formatRelative(n.updated_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// Markdown side panel
// ----------------------------------------------------------------------

function PagePanel({
  slug,
  page,
  backlinks,
  allSlugs,
  onNavigate,
}: {
  slug: string;
  page: WikiPage;
  backlinks: Array<{ id: string; slug: string; title: string; kind: string }>;
  allSlugs: Set<string>;
  onNavigate: (slug: string) => void;
}) {
  const sourceId =
    page.kind === "source" && Array.isArray(page.frontmatter?.source_ids)
      ? (page.frontmatter.source_ids as string[])[0]
      : null;
  const tags = Array.isArray(page.frontmatter?.tags)
    ? (page.frontmatter.tags as string[])
    : [];

  // Transform [[slug]] into interactive spans (resolved → button, unresolved → muted).
  const rendered = React.useMemo(
    () => transformWikilinks(page.body_md, allSlugs),
    [page.body_md, allSlugs]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span
              className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5"
              style={{ color: KIND_STYLE[page.kind as keyof typeof KIND_STYLE]?.color }}
            >
              {KIND_STYLE[page.kind as keyof typeof KIND_STYLE]?.icon}
              {KIND_STYLE[page.kind as keyof typeof KIND_STYLE]?.label ?? page.kind}
            </span>
            <span>{page.slug}</span>
            <span>· rev {page.revision}</span>
            <span>· {formatRelative(page.updated_at)}</span>
          </div>
          <h2 className="mt-1 truncate text-lg font-semibold">{page.title}</h2>
          {tags.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {tags.slice(0, 6).map((t) => (
                <span
                  key={t}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  #{t}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {sourceId ? (
          <Link
            href={`/app/atlases/${slug}/reading/${sourceId}`}
            className="shrink-0 rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            查看原文 →
          </Link>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="prose-atlas">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // Neutralize plain <a href="/wiki/..."> so wikilinks stay in-panel
              a: ({ href, children, ...props }) => {
                const match = href?.match(/^wiki:([a-z0-9\-_]+)$/);
                if (match) {
                  const target = match[1];
                  const resolved = allSlugs.has(target);
                  return (
                    <button
                      onClick={() => resolved && onNavigate(target)}
                      className={cn(
                        "rounded px-0.5 font-medium",
                        resolved
                          ? "text-primary hover:underline"
                          : "cursor-not-allowed text-muted-foreground line-through decoration-dotted"
                      )}
                      title={resolved ? `跳转 [[${target}]]` : `[[${target}]] 尚未生成`}
                    >
                      {children}
                    </button>
                  );
                }
                return (
                  <a href={href} target="_blank" rel="noreferrer" {...props}>
                    {children}
                  </a>
                );
              },
            }}
          >
            {rendered}
          </ReactMarkdown>
        </div>

        {backlinks.length > 0 ? (
          <div className="mt-6 border-t border-border/60 pt-4">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              被 {backlinks.length} 处引用
            </div>
            <ul className="space-y-1 text-sm">
              {backlinks.map((b) => (
                <li key={b.id}>
                  <button
                    onClick={() => onNavigate(b.slug)}
                    className="text-primary hover:underline"
                  >
                    {b.title}
                  </button>
                  <span className="ml-2 text-[10px] text-muted-foreground">{b.kind}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Rewrite [[target]] and [[target|label]] into markdown links pointing at a
// custom `wiki:<slug>` scheme. ReactMarkdown renders them via the `a` component
// above, which decides whether it's resolved or dangling.
function transformWikilinks(md: string, _allSlugs: Set<string>): string {
  return md.replace(/\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/g, (_m, target, label) => {
    const slug = String(target).trim().toLowerCase().replace(/\s+/g, "-");
    const visible = (label ?? target).toString().trim();
    // Escape markdown-control chars inside the label so they don't break rendering.
    const safe = visible.replace(/[\[\]]/g, "");
    return `[${safe}](wiki:${slug})`;
  });
}

// ----------------------------------------------------------------------
// Controls
// ----------------------------------------------------------------------

function ViewToggle({
  tab,
  onChange,
}: {
  tab: "graph" | "list";
  onChange: (t: "graph" | "list") => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border/60 bg-card/50">
      {(["graph", "list"] as const).map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={cn(
            "px-2.5 py-1 text-xs transition-colors",
            tab === t ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t === "graph" ? "图谱" : "列表"}
        </button>
      ))}
    </div>
  );
}

function KindFilter({
  value,
  onChange,
}: {
  value: "all" | WikiGraphNode["kind"];
  onChange: (k: "all" | WikiGraphNode["kind"]) => void;
}) {
  const options: Array<{ v: "all" | WikiGraphNode["kind"]; label: string }> = [
    { v: "all", label: "全部" },
    { v: "concept", label: "概念" },
    { v: "source", label: "Source" },
    { v: "synthesis", label: "综述" },
  ];
  return (
    <div className="flex gap-1 text-xs">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "rounded px-2 py-1 transition-colors",
            value === o.v
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------
// Empty state
// ----------------------------------------------------------------------

function EmptyState({ slug, sourceCount }: { slug: string; sourceCount: number }) {
  return (
    <div className="mx-auto max-w-2xl px-8 py-20 text-center">
      <Network className="mx-auto h-10 w-10 text-muted-foreground" />
      <h1 className="mt-5 text-xl font-semibold">知识库还是空的</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {sourceCount === 0 ? (
          <>去内容推荐挑几条素材，读完之后会自动 ingest 到这里</>
        ) : (
          <>
            你有 {sourceCount} 个 source，但还没有读完任何一个。
            <br />
            去阅读清单把一个 source 标为「已读」试试 —— AI 会把它变成知识库里的一页 wiki。
          </>
        )}
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link
          href={`/app/atlases/${slug}/reading`}
          className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm text-primary hover:bg-primary/20"
        >
          <BookOpen className="h-4 w-4" /> 去阅读清单
        </Link>
        <Link
          href={`/app/atlases/${slug}/recommendations`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
        >
          <Sparkles className="h-4 w-4" /> 内容推荐
        </Link>
      </div>
    </div>
  );
}
