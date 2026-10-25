import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "清川 · 河湖垃圾智能巡检系统",
  description: "拍照即巡检，证据可追溯：可审计的河湖垃圾多模态巡检 Agent",
};

export const viewport: Viewport = {
  themeColor: "#041419",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
