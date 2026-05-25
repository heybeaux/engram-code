import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Engram-Code Dashboard',
  description: 'Phase 2 dashboard for engram-code v2 cards API',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
