import type { Metadata } from "next";
import { DM_Mono, Space_Grotesk } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { auth } from "@/auth";
import { AiTaskChat } from "@/components/ai-task-chat";
import { AppToaster } from "@/components/app-toaster";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "2026 To-do Cockpit",
  description: "Realtime polling dashboard for Google Sheet tasks.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html
      lang="vi"
      className={`${spaceGrotesk.variable} ${dmMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <NuqsAdapter>
          <SiteHeader userEmail={session?.user?.email ?? null} />
          <div className="flex-1">{children}</div>
          <SiteFooter />
          {session?.user?.email ? <AiTaskChat /> : null}
          <AppToaster />
        </NuqsAdapter>
      </body>
    </html>
  );
}
