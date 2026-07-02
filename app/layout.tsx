import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lumina · Investment Research",
  description: "A modern watchlist for US and India markets.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="bg-orbs" aria-hidden>
          <span className="orb orb-1" />
          <span className="orb orb-2" />
          <span className="orb orb-3" />
        </div>
        {children}
      </body>
    </html>
  );
}
