import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'CloudCost — weekly AWS spend by project', template: '%s · CloudCost' },
  description:
    'Multi-tenant AWS cost visibility: weekly spend by project and service, week-over-week trends, spike detection and a Monday digest email.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
