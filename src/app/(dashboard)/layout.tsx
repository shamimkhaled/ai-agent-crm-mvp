import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { AuthHydration } from "@/components/auth/AuthHydration";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-[hsl(var(--surface-0))]">
      <AuthHydration />

      {/* Ambient background grid */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        aria-hidden="true"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 80% 60% at 50% -20%, hsl(var(--cyan) / 0.06) 0%, transparent 60%),
            radial-gradient(ellipse 50% 40% at 90% 80%, hsl(var(--violet) / 0.05) 0%, transparent 60%),
            linear-gradient(hsl(var(--border) / 0.4) 1px, transparent 1px),
            linear-gradient(90deg, hsl(var(--border) / 0.4) 1px, transparent 1px)
          `,
          backgroundSize: "100% 100%, 100% 100%, 40px 40px, 40px 40px",
        }}
      />

      <Sidebar />

      <div className="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden pt-16 sm:ml-[72px] lg:ml-64 transition-all duration-300 z-10">
        <TopNav />
        <main className="p-4 sm:p-6 lg:p-8 w-full mx-auto max-w-[1600px]">
          {children}
        </main>
      </div>
    </div>
  );
}
