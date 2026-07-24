import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ねこ茶屋',
  description: 'ねこたちが切り盛りする茶屋の放置経営ゲーム',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // ピンチズームを止め、ゲーム画面として固定する
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
