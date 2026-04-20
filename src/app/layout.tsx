import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Atlas · 个人化 AI 学习副驾驶",
  description:
    "每个知识库有明确主题。AI 帮你挑料、帮你提炼、帮你记住。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="dark" suppressHydrationWarning>
      <body className="texture-grain min-h-screen bg-background font-sans text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
