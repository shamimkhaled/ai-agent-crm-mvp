import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { AuthHydration } from "@/components/auth/AuthHydration";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <AuthHydration />
      <Sidebar />
      <div className="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden pt-16 sm:ml-20 lg:ml-64 transition-all">
        <TopNav />
        <main className="p-4 sm:p-6 lg:p-8 w-full mx-auto max-w-7xl">
          {children}
        </main>
      </div>
    </div>
  );
}
