import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = createSupabaseServer();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", new URL(request.url).origin), 303);
}
