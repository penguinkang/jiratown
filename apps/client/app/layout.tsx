import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JiraTown",
  description: "Pixel RPG workload visualization for Jira, reminders, and manual tasks."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
