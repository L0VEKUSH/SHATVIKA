import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SHATVIKA CORNER Admin',
  description: 'SHATVIKA CORNER restaurant admin dashboard',
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
