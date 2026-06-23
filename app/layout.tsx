import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Rolevance — AI Interview Platform',
  description: 'Practice with Adam Reid, your AI interview evaluator. Real questions. Real voice. Real feedback. The closest thing to a real interview.',
  openGraph: {
    title: 'Rolevance — AI Interview Platform',
    description: 'ChatGPT will chat with you. Rolevance will hire you.',
    images: [
      {
        url: 'https://mockboss-ai.vercel.app/og.png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Rolevance — AI Interview Platform',
    description: 'ChatGPT will chat with you. Rolevance will hire you.',
    images: [
      {
        url: 'https://mockboss-ai.vercel.app/og.png',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
