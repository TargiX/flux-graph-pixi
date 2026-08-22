import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.roomboard.online"),
  title: {
    default: "Roomboard - Visual Decision Room",
    template: "%s · Roomboard",
  },
  description:
    "Drop mockups, images, links and ideas into a shared canvas. Invite the team, collect feedback, and turn messy opinions into clear decisions.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    description:
      "Drop mockups, images, links and ideas into a shared canvas. Invite the team, collect feedback, and turn messy opinions into clear decisions.",
    siteName: "Roomboard",
    title: "Roomboard - Visual Decision Room",
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
      "Drop mockups, images, links and ideas into a shared canvas. Invite the team, collect feedback, and turn messy opinions into clear decisions.",
    images: ["/opengraph-image"],
    title: "Roomboard - Visual Decision Room",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
