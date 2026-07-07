import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppHeader } from "@/components/AppHeader";
import { SessionProvider } from "@/components/SessionProvider";
import { UserProvider } from "@/contexts/UserContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "OneGo Tournament Cloud（OTC）",
    template: "%s｜OneGo Tournament Cloud（OTC）",
  },
  description:
    "OneGo棋賽雲（OTC）是多棋種一站式雲端賽務平台，支援圍棋、西洋棋、象棋與五子棋，從線上報名、繳費到編排與成績管理，全程數位化。",
  applicationName: "OneGo Tournament Cloud（OTC）",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SessionProvider>
          <UserProvider>
            <AppHeader />
            {children}
          </UserProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
