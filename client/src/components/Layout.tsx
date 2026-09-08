import { Navigation } from "./Navigation";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <Navigation />
      <main className="h-screen flex-1 overflow-x-hidden overflow-y-auto px-3 pb-[calc(6.1rem+env(safe-area-inset-bottom))] pt-4 md:px-8 md:pb-8 md:pt-8">
        <div className="mx-auto w-full min-w-0 max-w-6xl page-transition">
          {children}
        </div>
      </main>
    </div>
  );
}
