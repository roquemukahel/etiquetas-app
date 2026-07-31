import type { Metadata, Viewport } from 'next';
import { Inter, Sora } from 'next/font/google';
import '../styles/globals.css';
import { SCRIPT_TEMA_INICIAL } from './lib/theme';
import SelectorDeActor from './SelectorDeActor';
import BotonFlotante from './BotonFlotante';
import AppShell from './AppShell';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const sora = Sora({ subsets: ['latin'], variable: '--font-sora', display: 'swap' });

export const metadata: Metadata = {
  title: 'Qovento',
  description: 'Etiquetas y stock para tu local de celulares',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#F8FAFC',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${inter.variable} ${sora.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA_INICIAL }} />
      </head>
      <body className="min-h-screen bg-canvas dark:bg-dark-bg text-ink dark:text-dark-text font-sans transition-colors">
        <SelectorDeActor />
        <AppShell>{children}</AppShell>
        <BotonFlotante />
      </body>
    </html>
  );
}
