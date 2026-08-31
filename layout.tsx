import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reading rewards",
  description: "Parent-funded reading rewards"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
