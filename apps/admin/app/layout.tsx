import './globals.css';

export const metadata = {
  title: 'DeuceX Admin',
  // Never indexable: vercel.json also sends X-Robots-Tag on every response.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
