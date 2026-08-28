import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Board",
  description: "A corkboard-style project tracker for features, progress, ownership, and bottlenecks.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
