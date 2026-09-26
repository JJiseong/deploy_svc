import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "배포 포털",
  description: "승인된 GitHub 저장소를 배포하는 비공개 포털",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
