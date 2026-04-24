import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";
import { AppShell } from "@/components/app-shell";

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
    <AppShell sidebar={<AppSidebar atlases={atlases ?? []} email={user.email ?? ""} />}>
      {children}
    </AppShell>
  );
}
