import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ASES — Academic Schedule Execution System',
  description: 'Academic Schedule Management System for B. K. Birla College, Kalyan',
  icons: {
    icon: 'https://i.ibb.co/8D6qf9gg/tl.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
