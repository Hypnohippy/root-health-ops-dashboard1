// app/layout.tsx
import "./globals.css";
import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Root Health Ops",
  description: "Root Health Ops Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta
          name="tiktok-developers-site-verification"
          content="0B7fkj4hG1N8gVPjVcpfwYAqJJCJ9k5h"
        />
      </head>
      <body className="min-h-screen bg-slate-950 text-slate-50">
        {children}
      </body>
    </html>
  );
}
