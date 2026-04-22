import { cache } from "react";
import { createSupabaseServer } from "@/lib/supabase/server";
import { decodeSlug } from "@/lib/slug";

export type AtlasSummary = {
  id: string;
  slug: string;
  name: string;
  thesis: string | null;
};

/**
 * Fetch atlas row by raw slug param. Cached per request via React `cache()`,
 * so layout + page can both call this without double-querying Supabase.
 */
export const getAtlasBySlug = cache(
  async (rawSlug: string): Promise<AtlasSummary | null> => {
    const slug = decodeSlug(rawSlug);
    const supabase = createSupabaseServer();
    const { data } = await supabase
      .from("atlases")
      .select("id, slug, name, thesis")
      .eq("slug", slug)
      .maybeSingle();
    return (data as AtlasSummary) ?? null;
  }
);
