import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo size={36} className="text-primary" />
          <h1 className="text-xl font-semibold tracking-tight">欢迎来到 Atlas</h1>
          <p className="text-sm text-muted-foreground">
            用邮箱登录 · 我们会发一封 magic link
          </p>
        </div>
        <LoginForm next={searchParams.next} />
      </div>
    </main>
  );
}
