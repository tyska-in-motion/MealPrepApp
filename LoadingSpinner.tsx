import { Navigation } from "./Navigation";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 px-4 pt-4 pb-[calc(11rem+env(safe-area-inset-bottom))] md:pb-8 md:p-8 overflow-y-auto h-screen">
        <div className="max-w-6xl mx-auto page-transition">
          {children}
        </div>
      </main>
    </div>
  );
}
