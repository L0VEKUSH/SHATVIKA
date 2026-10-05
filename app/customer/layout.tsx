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
        <div id="main-content" className="h-full overflow-y-auto pb-20 md:pb-0">
          {children}
        </div>
      </div>
    </div>
  );
}
