import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.roomboard.online"),
  title: {
    default: "Roomboard - Visual decisions, in one room",
    template: "%s · Roomboard",
  },
  description:
    "A private visual decision room for landing-page reviews, moodboards, and creative feedback. Open a room, invite editors or viewers, and close the loop.",
  openGraph: {
    description:
      "Open a private visual room, invite the people who need to decide, and turn creative feedback into a clear decision.",
    siteName: "Roomboard",
    title: "Roomboard - Visual decisions, in one room",
    type: "website",
    url: "/",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Roomboard visual decision room preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    description:
      "A private visual decision room for landing-page reviews, moodboards, and creative feedback.",
    images: ["/opengraph-image"],
    title: "Roomboard - Visual decisions, in one room",
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
