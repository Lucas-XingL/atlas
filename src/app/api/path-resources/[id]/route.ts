import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { PathResourceUserStatus } from "@/lib/types";

export const runtime = "nodejs";

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  tier: z.enum(["core", "extra"]).optional(),
  resource_type: z.enum(["consumable", "external", "physical"]).optional(),
  url: z.string().url().nullable().optional(),
  author: z.string().max(100).nullable().optional(),
  why_relevant: z.string().max(400).nullable().optional(),
  search_hint: z.string().max(200).nullable().optional(),
  user_status: z.enum(["suggested", "accepted", "reading", "finished", "skipped"]).optional(),
  source_id: z.string().uuid().nullable().optional(),
  res_order: z.number().int().min(0).optional(),
});

/**
 * Allowed user_status transitions. Keeps the state machine honest on the server
 * so a bug in the UI can't put a resource into an illegal state.
 *
 * `accepted` is an internal synonym for "source created but no content yet" —
 * the UI never lets the user pick it directly; it's always set by /accept.
 * We therefore allow transitions from it as if it were `reading`.
 */
const ALLOWED_TRANSITIONS: Record<PathResourceUserStatus, PathResourceUserStatus[]> = {
  suggested: ["reading", "accepted", "skipped"],
  accepted: ["reading", "finished", "skipped", "suggested"],
  reading: ["finished", "skipped"],
  finished: ["reading"], // re-open
  skipped: ["suggested", "reading"], // restore
};

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  // If changing user_status, verify the transition is legal.
  if (parsed.data.user_status) {
    const { data: current } = await supabase
      .from("path_resources")
      .select("user_status")
      .eq("id", params.id)
      .maybeSingle<{ user_status: PathResourceUserStatus }>();

    if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });

    const from = current.user_status;
    const to = parsed.data.user_status;
    if (from !== to && !ALLOWED_TRANSITIONS[from].includes(to)) {
      return NextResponse.json(
        { error: `illegal status transition ${from} → ${to}` },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabase
    .from("path_resources")
    .update(parsed.data)
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ resource: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const { error } = await supabase.from("path_resources").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
