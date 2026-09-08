import { Link, useLocation } from "wouter";
import { LayoutDashboard, UtensilsCrossed, CalendarDays, ShoppingCart, Leaf, ChartColumnBig, Soup, CopyPlus, CalendarClock, Ruler } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";

const navItems = [
  { href: "/", label: "Dashboard", shortLabel: "Start", icon: LayoutDashboard },
  { href: "/summary", label: "Podsumowanie", shortLabel: "Statystyki", icon: ChartColumnBig },
  { href: "/body-measurements", label: "Pomiary ciała", shortLabel: "Pomiary", icon: Ruler },
  { href: "/meal-plan", label: "Plan posiłków", shortLabel: "Plan", icon: CalendarDays },
  { href: "/meal-plan-templates", label: "Jadłospisy", shortLabel: "Jadłospisy", icon: CopyPlus },
  { href: "/meal-prep", label: "Meal Prep", shortLabel: "Meal Prep", icon: CalendarClock },
  { href: "/shared-meals", label: "Wspólne posiłki", shortLabel: "Wspólne", icon: Soup },
  { href: "/recipes", label: "Przepisy", shortLabel: "Przepisy", icon: UtensilsCrossed },
  { href: "/ingredients", label: "Składniki", shortLabel: "Produkty", icon: Leaf },
  { href: "/shopping-list", label: "Lista zakupów", shortLabel: "Zakupy", icon: ShoppingCart },
];

export function Navigation() {
  const [location] = useLocation();
  const currentPath = location.replace(/[?#].*$/, "").replace(/\/$/, "") || "/";

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/70 bg-card/95 pb-[max(0.4rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.12)] backdrop-blur supports-[backdrop-filter]:bg-card/85 md:relative md:flex md:h-screen md:w-72 md:flex-col md:border-r md:border-t-0 md:p-6 md:pb-6"
    >
      <div className="hidden items-center gap-3 px-2 md:flex">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Leaf className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-primary">NutriPlan</h1>
          <p className="text-xs text-muted-foreground">Planuj posiłki szybciej i spokojniej</p>
        </div>
      </div>

      <div className="hidden md:mt-8 md:block md:px-2">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nawigacja</p>
      </div>

      <div className="flex items-stretch justify-start gap-1 overflow-x-auto p-1.5 no-scrollbar md:mt-1 md:flex-1 md:flex-col md:gap-2 md:overflow-visible md:p-0">
        {navItems.map((item) => {
          const isActive = currentPath === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <button
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex h-14 min-w-[4.75rem] shrink-0 flex-col items-center justify-center rounded-xl px-1.5 py-1.5 text-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:h-auto md:min-w-0 md:w-full md:flex-row md:justify-start md:gap-3 md:px-4 md:py-3 md:text-left",
                  isActive
                    ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 md:h-5 md:w-5" strokeWidth={2.25} />
                <span className="mt-1 text-[11px] font-medium leading-tight md:mt-0 md:text-sm">{item.shortLabel}</span>
                <span className="sr-only md:not-sr-only md:ml-auto md:text-xs md:text-muted-foreground">
                  {item.label}
                </span>
              </button>
            </Link>
          );
        })}
      </div>

      <div className="mt-1 px-2 md:mt-4 md:px-2">
        <ThemeToggle className="w-full justify-center md:justify-start" />
      </div>
    </nav>
  );
}
