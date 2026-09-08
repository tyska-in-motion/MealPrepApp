import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDarkMode = theme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={toggleTheme}
      className={cn(
        "h-10 rounded-xl border border-border/70 bg-card/70 px-3 text-muted-foreground hover:bg-muted/80 hover:text-foreground",
        className,
      )}
      aria-label={isDarkMode ? "Przełącz na tryb jasny" : "Przełącz na tryb ciemny"}
      title={isDarkMode ? "Przełącz na tryb jasny" : "Przełącz na tryb ciemny"}
    >
      {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span className="text-xs font-semibold">{isDarkMode ? "Jasny" : "Ciemny"}</span>
    </Button>
  );
}
