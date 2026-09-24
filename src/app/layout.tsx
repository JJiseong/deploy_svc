import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deploy Portal",
  description: "Private GitHub deployment portal",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
