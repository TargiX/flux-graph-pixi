import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.roomboard.online"),
  title: {
    default: "Roomboard",
    template: "%s · Roomboard",
  },
  description:
    "A private visual decision room for landing-page reviews, moodboards, and creative feedback. Open a room, invite editors or viewers, and close the loop.",
  openGraph: {
    description:
      "Open a private visual room, invite the people who need to decide, and turn creative feedback into a clear decision.",
    siteName: "Roomboard",
    title: "Roomboard",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary",
    description:
      "A private visual decision room for landing-page reviews, moodboards, and creative feedback.",
    title: "Roomboard",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
