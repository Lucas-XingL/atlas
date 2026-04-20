import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { LogoMark } from "@/components/logo";
import { AppSidebar } from "@/components/app-sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: atlases } = await supabase
    .from("atlases")
    .select("id, slug, name")
    .eq("status", "active")
    .order("updated_at", { ascending: false });

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-border/60 bg-background md:flex md:flex-col">
        <div className="flex h-14 items-center border-b border-border/60 px-4">
          <Link href="/app">
            <LogoMark />
          </Link>
        </div>
        <AppSidebar
          atlases={atlases ?? []}
          email={user.email ?? ""}
        />
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
