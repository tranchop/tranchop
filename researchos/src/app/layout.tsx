import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'ResearchOS', description: 'Gestão de conhecimento, pesquisa e escrita científica' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
