import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Worship Projector",
  description: "Church worship media projector system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
