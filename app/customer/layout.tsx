import Link from 'next/link';
import { User, MapPin, Package, LogOut } from 'lucide-react';
import CustomerSidebar from './CustomerSidebar';

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
      <CustomerSidebar />
      <div className="flex-1 overflow-hidden">
        <main className="h-full overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
