import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roomboard",
  description: "A realtime collaborative Pixi.js whiteboard for notes, images, and comments.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
