import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ChefHat, Clock } from "lucide-react";
import { Layout } from "@/components/Layout";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { api } from "@shared/routes";
import { fetchWithTimeout } from "@/lib/queryClient";

const formatAmount = (value: number) => {
  const rounded = Math.round(Number(value || 0) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(".", ",");
};

const formatAmountSummary = (item: any) => {
  const totals = Array.isArray(item?.totalAmounts)
    ? item.totalAmounts.filter((amount: any) => Number(amount?.amount) > 0)
    : [];

  if (totals.length > 0) {
    return totals.map((amount: any) => `${formatAmount(Number(amount.amount))} ${amount.unit || "g"}`).join(" + ");
  }

  if (Number(item?.totalAmount) > 0) {
    return `${formatAmount(Number(item.totalAmount))} ${item.unit || "g"}`;
  }

  return null;
};

export default function MealPrep() {
  const date = format(new Date(), "yyyy-MM-dd");
  const lookAheadDays = 7;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [api.mealPrep.opportunities.path, date, lookAheadDays],
    queryFn: async () => {
      const params = new URLSearchParams({ date, lookAheadDays: String(lookAheadDays) });
      const res = await fetchWithTimeout(`${api.mealPrep.opportunities.path}?${params.toString()}`);
      if (!res.ok) throw new Error("Nie udało się pobrać meal prep");
      return api.mealPrep.opportunities.responses[200].parse(await res.json());
    },
  });

  const items = data?.items || [];

  const totalMeals = items.reduce((sum: number, item: any) => sum + (item.forMeals?.length || 0), 0);

  return (
    <Layout>
      <div className="mb-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <CalendarClock className="h-3.5 w-3.5" /> Meal Prep
        </div>
        <h1 className="font-display text-3xl font-bold">Co możesz przygotować wcześniej?</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Automatycznie pokazujemy zadania meal prep z planu posiłków na najbliższe dni — także te zaplanowane na dzisiaj.
        </p>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" /> {format(new Date(`${date}T00:00:00`), "d MMMM yyyy", { locale: pl })}</span>
            <span>Zakres planu: {data?.startDate} – {data?.endDate}</span>
            <span>{items.length} zadań / {totalMeals} posiłków</span>
            {isFetching && <span>Odświeżanie...</span>}
          </div>

          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-card p-8 text-center shadow-sm">
              <ChefHat className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <h2 className="font-semibold">Brak rzeczy do przygotowania</h2>
              <p className="mt-1 text-sm text-muted-foreground">Dodaj zadania w przepisach albo zaplanuj posiłki w najbliższych dniach.</p>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {items.map((item: any) => {
                const amountSummary = formatAmountSummary(item);

                return (
                <article key={item.groupKey} className="rounded-2xl border bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-xl font-semibold">{item.title}</h2>
                      <p className="text-sm text-muted-foreground">
                        {item.ingredientName ? item.ingredientName : "Zadanie ogólne"}
                      </p>
                      {amountSummary ? (
                        <p className="mt-2 inline-flex rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                          Do przygotowania: {amountSummary}
                        </p>
                      ) : (
                        <p className="mt-2 inline-flex rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                          Brak wybranego składnika do zsumowania ilości
                        </p>
                      )}
                    </div>
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">do {item.maxDaysBefore} dni</span>
                  </div>

                  {item.notes && <p className="mt-3 rounded-xl bg-muted/50 p-3 text-sm">{item.notes}</p>}

                  {(item.perRecipes || []).length > 0 && (
                    <div className="mt-3 rounded-xl border bg-muted/30 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suma na przepis</p>
                      <div className="space-y-1.5">
                        {(item.perRecipes || []).map((recipe: any) => {
                          const recipeAmountSummary = formatAmountSummary(recipe);
                          return (
                            <div key={recipe.recipeId} className="flex items-center justify-between gap-3 text-sm">
                              <span className="font-medium">{recipe.recipeName}</span>
                              <span className="shrink-0 text-xs font-semibold text-primary">
                                {recipeAmountSummary || "—"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 space-y-2">
                    {(item.forMeals || []).map((meal: any) => (
                      <div key={`${meal.entryId}-${meal.date}`} className="flex items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2 text-sm">
                        <div>
                          <p className="font-medium">{meal.recipeName}</p>
                          <p className="text-xs text-muted-foreground">{meal.date} · {meal.person === "B" ? "Mati" : "Tysia"} · {meal.mealType}</p>
                        </div>
                        {Number(meal.amount) > 0 && <span className="shrink-0 text-xs font-medium">{formatAmount(meal.amount)} {meal.unit || item.unit || "g"}</span>}
                      </div>
                    ))}
                  </div>
                </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
