import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { RegisterSW } from "./register-sw";

export const metadata: Metadata = {
  title: "LitLoot",
  description: "Read pages. Earn loot."
};

const localization = {
  signIn: {
    start: {
      title: "Sign in to LitLoot",
      subtitle: "Welcome back"
    }
  },
  signUp: {
    start: {
      title: "Create your LitLoot account",
      subtitle: "Read pages. Earn loot."
    }
  }
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      localization={localization}
      appearance={{
        variables: {
          colorPrimary: "#1565c0",
          colorText: "#111",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        },
        layout: {
          logoLinkUrl: "/",
          helpPageUrl: "https://litloot.us",
          unsafe_disableDevelopmentModeWarnings: true
        }
      }}
    >
      <html lang="en">
        <body>{children}<RegisterSW /></body>
      </html>
    </ClerkProvider>
  );
}
