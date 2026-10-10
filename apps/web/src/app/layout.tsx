import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WorkSpace — Multi-Tenant SaaS Project Management",
  description:
    "Secure, multi-tenant project management engineered for modern organizations.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col font-sans antialiased text-slate-900 bg-slate-950">
        {children}
      </body>
    </html>
  );
}
