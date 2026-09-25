import { FlagSprite } from '@deucex/ui';
import './globals.css';

export const metadata = {
  title: 'DeuceX Admin',
  // Never indexable: vercel.json also sends X-Robots-Tag on every response.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        <FlagSprite />
        {children}
      </body>
    </html>
  );
}
