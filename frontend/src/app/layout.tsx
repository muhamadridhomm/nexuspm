import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NexusPM Demo — Project, Resource & Document Workspace",
  description: "A local-first workspace for managing projects, issues, resources, and project documents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
