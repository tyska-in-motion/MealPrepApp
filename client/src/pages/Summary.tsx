import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, buildUrl } from "@shared/routes";
import { format, subDays } from "date-fns";
import { pl } from "date-fns/locale";
import { CalendarDays, Coins, Flame, ChefHat, Carrot } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculateNutritionAmount, calculatePurchaseAmount, calculateScaledAmount } from "@shared/scaling";

type SummaryData = {
  date: string;
  totalCalories: number;
  totalPrice: number;
  entries: any[];
};

type ExcludedStatsDays = Record<string, string>;

const RANGE_OPTIONS = [
  { label: "7 dni", days: 7 },
  { label: "14 dni", days: 14 },
  { label: "30 dni", days: 30 },
  { label: "90 dni", days: 90 },
];

export default function Summary() {
  const [rangeDays, setRangeDays] = useState(30);
  const [ingredientCategoryFilter, setIngredientCategoryFilter] = useState("all");
  const [ingredientRankingMode, setIngredientRankingMode] = useState<"amount" | "recipeFrequency">("amount");
  const [recipeTagFilter, setRecipeTagFilter] = useState("all");
  const [excludedStatsDays, setExcludedStatsDays] = useState<ExcludedStatsDays>({});
  const queryClient = useQueryClient();

  const dates = useMemo(() => {
    return Array.from({ length: rangeDays }, (_, i) =>
      format(subDays(new Date(), rangeDays - i), "yyyy-MM-dd")
    );
  }, [rangeDays]);

  const statsExclusionsRange = useMemo(() => ({
    startDate: dates[0],
    endDate: dates[dates.length - 1],
  }), [dates]);

  const statsExclusionsQueryKey = useMemo(() => [
    api.mealPlan.getStatsExclusions.path,
    statsExclusionsRange.startDate,
    statsExclusionsRange.endDate,
  ], [statsExclusionsRange]);

  const { data: savedStatsExclusions, isSuccess: savedStatsExclusionsLoaded } = useQuery<{ date: string; reason: string }[]>({
    queryKey: statsExclusionsQueryKey,
    queryFn: async () => {
      const url = buildUrl(api.mealPlan.getStatsExclusions.path, statsExclusionsRange);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Nie udało się pobrać wykluczeń statystyk");
      return api.mealPlan.getStatsExclusions.responses[200].parse(await res.json());
    },
  });

  useEffect(() => {
    if (!savedStatsExclusionsLoaded) return;

    setExcludedStatsDays(Object.fromEntries(savedStatsExclusions.map((item) => [item.date, item.reason])));
  }, [savedStatsExclusions, savedStatsExclusionsLoaded]);


  const setStatsExclusion = useMutation({
    mutationFn: async ({ date, excluded }: { date: string; excluded: boolean }) => {
      const res = await fetch(api.mealPlan.setStatsExclusion.path, {
        method: api.mealPlan.setStatsExclusion.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          reason: excluded ? "Wykluczony w statystykach" : "",
        }),
      });

      if (!res.ok) {
        throw new Error(excluded
          ? "Nie udało się zapisać wykluczonego dnia"
          : "Nie udało się przywrócić dnia do statystyk");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [api.mealPlan.getStatsExclusions.path] });
    },
  });

  const { data: settings, isLoading: isLoadingSettings } = useQuery<any>({
    queryKey: [api.userSettings.get.path],
  });

  const userSettingsHistoryRange = useMemo(() => ({
    // Fetch settings history from the beginning so every displayed day uses
    // the target that was effective on that day, not the current settings.
    startDate: "0001-01-01",
    endDate: dates[dates.length - 1],
  }), [dates]);

  const { data: userSettingsHistory, isLoading: isLoadingSettingsHistory } = useQuery<Record<"A" | "B", any[]>>({
    queryKey: [api.userSettings.history.path, userSettingsHistoryRange.startDate, userSettingsHistoryRange.endDate],
    queryFn: async () => {
      const url = buildUrl(api.userSettings.history.path, userSettingsHistoryRange);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Nie udało się pobrać historii celów kalorycznych");
      return api.userSettings.history.responses[200].parse(await res.json());
    },
  });

  const targetsByPerson = useMemo(() => ({
    A: Number(settings?.A?.targetCalories ?? 2000),
    B: Number(settings?.B?.targetCalories ?? settings?.A?.targetCalories ?? 2000),
  }), [settings]);

  const getTargetCaloriesForDay = (person: "A" | "B", date: string) => {
    const history = [...(userSettingsHistory?.[person] || [])].sort((a, b) =>
      String(a.effectiveDate).localeCompare(String(b.effectiveDate)),
    );
    const effective = history.reduce((match, row) => (String(row.effectiveDate) <= date ? row : match), null as any);
    return Number(effective?.targetCalories ?? targetsByPerson[person]);
  };

  const dayQueries = useQueries({
    queries: dates.map((date) => ({
      queryKey: [api.mealPlan.getDaySummary.path, date],
      queryFn: async () => {
        const url = buildUrl(api.mealPlan.getDaySummary.path, { date });
        const res = await fetch(url);
        if (!res.ok) throw new Error("Nie udało się pobrać danych dziennych");
        return api.mealPlan.getDaySummary.responses[200].parse(await res.json()) as SummaryData;
      },
    })),
  });

  const isLoading = dayQueries.some((q) => q.isLoading) || isLoadingSettings || isLoadingSettingsHistory;

  const analytics = useMemo(() => {
    const allDays = dayQueries
      .map((q) => q.data)
      .filter((day): day is SummaryData => !!day);
    const days = allDays.filter((day) => !excludedStatsDays[day.date]);

    const getEntryIngredientAmount = (entry: any, ri: any) => {
      if (typeof ri?.calculatedAmount === "number" && Number.isFinite(ri.calculatedAmount)) {
        return ri.calculatedAmount;
      }
      const entryServings = Number(entry?.servings) || 1;
      const recipeServings = Number(entry?.recipe?.servings) || 1;
      return calculateScaledAmount(ri, entryServings, recipeServings);
    };
    const calculateEntryNutrients = (entry: any) => {
      if (entry.totals) {
        return {
          calories: Number(entry.totals.calories) || 0,
          protein: Number(entry.totals.protein) || 0,
          carbs: Number(entry.totals.carbs) || 0,
          fat: Number(entry.totals.fat) || 0,
        };
      }

      const result = { calories: 0, protein: 0, carbs: 0, fat: 0 };
      const entryServings = Number(entry.servings) || 1;

      if (!entry.recipe) {
        return {
          calories: (Number(entry.customCalories) || 0) * entryServings,
          protein: (Number(entry.customProtein) || 0) * entryServings,
          carbs: (Number(entry.customCarbs) || 0) * entryServings,
          fat: (Number(entry.customFat) || 0) * entryServings,
        };
      }

      const ingredientsToUse = entry.ingredients?.length > 0 ? entry.ingredients : (entry.recipe?.ingredients || []);

      ingredientsToUse.forEach((ri: any) => {
        if (!ri.ingredient) return;
        const multiplier = calculateNutritionAmount(getEntryIngredientAmount(entry, ri), ri.ingredient) / 100;
        result.calories += (Number(ri.ingredient.calories) || 0) * multiplier;
        result.protein += (Number(ri.ingredient.protein) || 0) * multiplier;
        result.carbs += (Number(ri.ingredient.carbs) || 0) * multiplier;
        result.fat += (Number(ri.ingredient.fat) || 0) * multiplier;
      });

      return result;
    };

    const ingredientMap = new Map<number, {
      name: string;
      category: string;
      totalAmount: number;
      usedInDays: Set<string>;
      usedInRecipes: Set<string>;
    }>();
    const recipeMap = new Map<number, { name: string; count: number; events: Set<string>; tags: string[] }>();

    days.forEach((day) => {
      (day.entries || []).filter((entry: any) => entry.isEaten).forEach((entry: any) => {
        if (entry.recipe?.id) {
          const recipeId = Number(entry.recipe.id);
          const currentRecipe = recipeMap.get(recipeId) || {
            name: entry.recipe.name,
            count: 0,
            events: new Set<string>(),
            tags: Array.isArray(entry.recipe.tags) ? entry.recipe.tags : [],
          };
          const batchId = Number(entry.cookedBatchId || 0);
          if (batchId > 0) {
            currentRecipe.events.add(`batch:${batchId}`);
          } else {
            currentRecipe.events.add(`day:${day.date}`);
          }
          recipeMap.set(recipeId, currentRecipe);
        }

        const ingredientsToUse = entry.ingredients?.length > 0 ? entry.ingredients : (entry.recipe?.ingredients || []);
        const entryIngredientIds = new Set<number>();
        ingredientsToUse.forEach((ri: any) => {
          if (!ri.ingredient?.id) return;
          const ingredientId = Number(ri.ingredient.id);
          const category = (ri.ingredient.category || "Bez kategorii").trim() || "Bez kategorii";
          const currentIngredient = ingredientMap.get(ri.ingredient.id) || {
            name: ri.ingredient.name,
            category,
            totalAmount: 0,
            usedInDays: new Set<string>(),
            usedInRecipes: new Set<string>(),
          };

          currentIngredient.totalAmount += getEntryIngredientAmount(entry, ri);
          currentIngredient.usedInDays.add(day.date);
          ingredientMap.set(ri.ingredient.id, currentIngredient);
          entryIngredientIds.add(ingredientId);
        });
        const usageEventKey = entry.id ? `entry:${entry.id}` : `day:${day.date}:recipe:${entry.recipe?.id || "custom"}`;
        entryIngredientIds.forEach((ingredientId) => {
          const ingredient = ingredientMap.get(ingredientId);
          if (!ingredient) return;
          ingredient.usedInRecipes.add(usageEventKey);
          ingredientMap.set(ingredientId, ingredient);
        });
      });
    });

    recipeMap.forEach((recipe, recipeId) => {
      recipe.count = recipe.events.size;
      recipeMap.set(recipeId, recipe);
    });

    const mostUsedIngredients = Array.from(ingredientMap.values())
      .map((ingredient) => ({
        ...ingredient,
        totalAmount: Math.round(ingredient.totalAmount),
        usedDaysCount: ingredient.usedInDays.size,
        usedInRecipesCount: ingredient.usedInRecipes.size,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    const mostCookedRecipes = Array.from(recipeMap.values()).sort((a, b) => b.count - a.count);
    const ingredientCategories = Array.from(new Set(mostUsedIngredients.map((ingredient) => ingredient.category))).sort((a, b) => a.localeCompare(b, "pl"));
    const recipeTags = Array.from(new Set(mostCookedRecipes.flatMap((recipe) => recipe.tags || []))).sort((a, b) => a.localeCompare(b, "pl"));

    const dailyHistory = [...days].sort((a, b) => b.date.localeCompare(a.date)).map((day) => {
      const eatenEntries = (day.entries || []).filter((entry: any) => entry.isEaten);
      const getPersonCalories = (person: "A" | "B", modeEntries: any[]) => {
        return Math.round(modeEntries
          .filter((entry: any) => (entry.person || "A") === person)
          .reduce((sum: number, entry: any) => {
            if (entry.totals) return sum + (Number(entry.totals.calories) || 0);

            if (!entry.recipe) {
              const servings = Number(entry.servings) || 1;
              return sum + (Number(entry.customCalories) || 0) * servings;
            }

            const ingredientsToUse = entry.ingredients?.length > 0 ? entry.ingredients : (entry.recipe?.ingredients || []);

            const kcal = ingredientsToUse.reduce((kcalSum: number, ri: any) => {
              if (!ri.ingredient) return kcalSum;
              return kcalSum + ((Number(ri.ingredient.calories) || 0) * calculateNutritionAmount(getEntryIngredientAmount(entry, ri), ri.ingredient) / 100);
            }, 0);

            return sum + kcal;
          }, 0));
      };

      const getPersonPrice = (person: "A" | "B", modeEntries: any[]) => {
        return modeEntries
          .filter((entry: any) => (entry.person || "A") === person)
          .reduce((sum: number, entry: any) => {
            if (entry.totals) return sum + (Number(entry.totals.price) || 0);

            if (!entry.recipe) {
              return sum + (Number(entry.customPrice) || 0) * (Number(entry.servings) || 1);
            }

            const ingredientsToUse = entry.ingredients?.length > 0 ? entry.ingredients : (entry.recipe?.ingredients || []);

            const price = ingredientsToUse.reduce((priceSum: number, ri: any) => {
              if (!ri.ingredient) return priceSum;
              return priceSum + ((Number(ri.ingredient.price) || 0) * calculatePurchaseAmount(getEntryIngredientAmount(entry, ri), ri.ingredient) / 100);
            }, 0);

            return sum + price;
          }, 0);
      };

      return {
        date: day.date,
        label: format(new Date(day.date), "d MMM", { locale: pl }),
        price: Number(day.totalPrice) || 0,
        calories: Number(day.totalCalories) || 0,
        perPerson: {
          A: {
            eatenCalories: getPersonCalories("A", eatenEntries),
            eatenPrice: getPersonPrice("A", eatenEntries),
            targetCalories: getTargetCaloriesForDay("A", day.date),
          },
          B: {
            eatenCalories: getPersonCalories("B", eatenEntries),
            eatenPrice: getPersonPrice("B", eatenEntries),
            targetCalories: getTargetCaloriesForDay("B", day.date),
          },
        },
      };
    });

    const createStatsBucket = () => ({ totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0, daysWithMeals: 0 });
    const personStats = { A: createStatsBucket(), B: createStatsBucket() };

    days.forEach((day) => {
      (["A", "B"] as const).forEach((person) => {
        const personEntriesForDay = (day.entries || []).filter(
          (entry: any) => entry.isEaten && (entry.person || "A") === person,
        );

        if (!personEntriesForDay.length) return;

        personStats[person].daysWithMeals += 1;

        personEntriesForDay.forEach((entry: any) => {
          const nutrients = calculateEntryNutrients(entry);
          personStats[person].totalCalories += nutrients.calories;
          personStats[person].totalProtein += nutrients.protein;
          personStats[person].totalCarbs += nutrients.carbs;
          personStats[person].totalFat += nutrients.fat;
        });
      });
    });

    const averageCalories = (person: "A" | "B") => {
      const stats = personStats[person];
      return stats.daysWithMeals ? Math.round(stats.totalCalories / stats.daysWithMeals) : 0;
    };

    const averageMacros = (person: "A" | "B") => {
      const stats = personStats[person];
      return {
        protein: stats.daysWithMeals ? Math.round(stats.totalProtein / stats.daysWithMeals) : 0,
        carbs: stats.daysWithMeals ? Math.round(stats.totalCarbs / stats.daysWithMeals) : 0,
        fat: stats.daysWithMeals ? Math.round(stats.totalFat / stats.daysWithMeals) : 0,
      };
    };

    const perPersonAvgCalories = { A: averageCalories("A"), B: averageCalories("B") };

    const perPersonAvgMacros = { A: averageMacros("A"), B: averageMacros("B") };

    const totalCost = dailyHistory.reduce(
      (sum, day) => sum + day.perPerson.A.eatenPrice + day.perPerson.B.eatenPrice,
      0,
    );

    return {
      days,
      allDays,
      excludedDaysCount: allDays.length - days.length,
      totalCost,
      mostUsedIngredients,
      mostCookedRecipes,
      ingredientCategories,
      recipeTags,
      dailyHistory,
      perPersonAvgCalories,
      perPersonAvgMacros,
    };
  }, [dayQueries, targetsByPerson, userSettingsHistory, excludedStatsDays]);

  const filteredMostUsedIngredients = useMemo(() => {
    const filteredByCategory = ingredientCategoryFilter === "all"
      ? analytics.mostUsedIngredients
      : analytics.mostUsedIngredients.filter((ingredient) => ingredient.category === ingredientCategoryFilter);

    return [...filteredByCategory]
      .sort((a, b) => ingredientRankingMode === "amount"
        ? b.totalAmount - a.totalAmount
        : b.usedInRecipesCount - a.usedInRecipesCount)
      .slice(0, 8);
  }, [analytics.mostUsedIngredients, ingredientCategoryFilter, ingredientRankingMode]);

  const filteredMostCookedRecipes = useMemo(() => {
    const filteredByTag = recipeTagFilter === "all"
      ? analytics.mostCookedRecipes
      : analytics.mostCookedRecipes.filter((recipe) => recipe.tags.includes(recipeTagFilter));
    return filteredByTag.slice(0, 8);
  }, [analytics.mostCookedRecipes, recipeTagFilter]);

  return (
    <Layout>
      <div className="space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-fit gap-2">
                <CalendarDays className="h-4 w-4" />
                Wyklucz dni ze statystyk
                {analytics.excludedDaysCount > 0 && (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                    {analytics.excludedDaysCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(92vw,28rem)] p-3">
              <div className="mb-3 space-y-1">
                <div className="text-sm font-medium">Wyklucz dni ze statystyk</div>
                <p className="text-xs text-muted-foreground">
                  Wybierz dni z listy. Zmiany zapisują się automatycznie i są wspólne dla każdej przeglądarki.
                </p>
              </div>
              <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {dates.map((date) => {
                  const isExcluded = Boolean(excludedStatsDays[date]);
                  const label = format(new Date(`${date}T00:00:00`), "EEE, d MMM", { locale: pl });

                  return (
                    <label
                      key={date}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                        isExcluded ? "border-destructive/50 bg-destructive/10" : "bg-background/60 hover:bg-muted/60",
                      )}
                    >
                      <Checkbox
                        checked={isExcluded}
                        disabled={setStatsExclusion.isPending}
                        onCheckedChange={(checked) => setStatsExclusion.mutate({ date, excluded: checked === true })}
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          <div className="flex flex-wrap gap-2">
            {RANGE_OPTIONS.map((option) => (
              <Button
                key={option.days}
                variant={rangeDays === option.days ? "default" : "outline"}
                onClick={() => setRangeDays(option.days)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </header>

        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <>
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
              <div className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                  <Coins className="h-4 w-4" /> Koszt (okres)
                </div>
                <div className="text-2xl font-bold">{analytics.totalCost.toFixed(2)} PLN</div>
              </div>

              <div className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                  <CalendarDays className="h-4 w-4" /> Dni w statystykach
                </div>
                <div className="text-2xl font-bold">{analytics.days.length}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  z {analytics.allDays.length} pobranych dni • wykluczono {analytics.excludedDaysCount}
                </div>
              </div>


              <div className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                  <Flame className="h-4 w-4" /> Śr. kcal — zjedzone (Tysia)
                </div>
                <div className="text-2xl font-bold">{analytics.perPersonAvgCalories.A} kcal</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Zjedzone B: {analytics.perPersonAvgMacros.A.protein}g • W: {analytics.perPersonAvgMacros.A.carbs}g • T: {analytics.perPersonAvgMacros.A.fat}g
                </div>
              </div>

              <div className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                  <Flame className="h-4 w-4" /> Śr. kcal — zjedzone (Mati)
                </div>
                <div className="text-2xl font-bold">{analytics.perPersonAvgCalories.B} kcal</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Zjedzone B: {analytics.perPersonAvgMacros.B.protein}g • W: {analytics.perPersonAvgMacros.B.carbs}g • T: {analytics.perPersonAvgMacros.B.fat}g
                </div>
              </div>
            </section>


            <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border bg-card p-4 shadow-sm">
                <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                  <Carrot className="h-5 w-5 text-emerald-600" /> Najczęściej używane składniki
                </h2>
                <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <Select value={ingredientCategoryFilter} onValueChange={setIngredientCategoryFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filtr kategorii" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Wszystkie kategorie</SelectItem>
                      {analytics.ingredientCategories.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={ingredientRankingMode} onValueChange={(value) => setIngredientRankingMode(value as "amount" | "recipeFrequency")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sortowanie składników" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="amount">Po gramaturze</SelectItem>
                      <SelectItem value="recipeFrequency">Po częstotliwości w przepisach</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  {filteredMostUsedIngredients.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Brak danych składników w wybranym okresie.</p>
                  ) : (
                    filteredMostUsedIngredients.map((ingredient) => (
                      <div key={ingredient.name} className="flex items-center justify-between rounded-lg border bg-background/60 px-3 py-2">
                        <div>
                          <div className="font-medium">{ingredient.name}</div>
                          <div className="text-xs text-muted-foreground">
                            kategoria: {ingredient.category} • użyte dni: {ingredient.usedDaysCount}
                          </div>
                        </div>
                        <div className="text-sm font-semibold">
                          {ingredientRankingMode === "amount" ? `${ingredient.totalAmount} g` : `${ingredient.usedInRecipesCount}x`}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border bg-card p-4 shadow-sm">
                <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                  <ChefHat className="h-5 w-5 text-primary" /> Najczęściej gotowane przepisy
                </h2>
                <div className="mb-3">
                  <Select value={recipeTagFilter} onValueChange={setRecipeTagFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filtr tagów" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Wszystkie tagi</SelectItem>
                      {analytics.recipeTags.map((tag) => (
                        <SelectItem key={tag} value={tag}>
                          {tag}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  {filteredMostCookedRecipes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Brak gotowanych przepisów w wybranym okresie.</p>
                  ) : (
                    filteredMostCookedRecipes.map((recipe) => (
                      <div key={recipe.name} className="flex items-center justify-between rounded-lg border bg-background/60 px-3 py-2">
                        <div>
                          <div className="font-medium">{recipe.name}</div>
                          {!!recipe.tags.length && (
                            <div className="text-xs text-muted-foreground">
                              {recipe.tags.join(" • ")}
                            </div>
                          )}
                        </div>
                        <div className="text-sm font-semibold">{recipe.count}x</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="rounded-2xl border bg-card p-4 shadow-sm">
                <h2 className="text-lg font-semibold">Historia dzienna</h2>
                <p className="text-sm text-muted-foreground">Wykresy pokazują tylko zjedzone posiłki.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {[{ key: "A", name: "Tysia" }, { key: "B", name: "Mati" }].map((person) => (
                <div key={person.key} className="rounded-2xl border bg-card p-4 shadow-sm">
                  <h2 className="mb-3 text-lg font-semibold">Historia dzienna — {person.name}</h2>
                  <div className="space-y-2">
                    {analytics.dailyHistory.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Brak danych dla wybranego okresu.</p>
                    ) : (
                      analytics.dailyHistory.map((day) => {
                        const personData = day.perPerson[person.key as "A" | "B"];
                        const targetCalories = Math.max(1, Number(personData.targetCalories) || 0);
                        const calories = personData.eatenCalories;
                        const price = personData.eatenPrice;
                        const caloriePercentage = Math.round((calories / targetCalories) * 100);
                        const calorieStatus = caloriePercentage < 95
                          ? { label: "poniżej celu", barClassName: "bg-amber-400", rowClassName: "border-amber-200 bg-amber-50/70 dark:border-amber-500/40 dark:bg-amber-500/15" }
                          : caloriePercentage <= 105
                            ? { label: "w celu", barClassName: "bg-emerald-500", rowClassName: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/40 dark:bg-emerald-500/15" }
                            : { label: "powyżej celu", barClassName: "bg-red-500", rowClassName: "border-red-200 bg-red-50/70 dark:border-red-500/45 dark:bg-red-500/15" };

                        return (
                          <div
                            key={`${person.key}-${day.date}`}
                            className={cn(
                              "grid grid-cols-[90px_1fr_auto] items-center gap-3 rounded-lg border px-3 py-2",
                              calorieStatus.rowClassName,
                            )}
                          >
                            <span className="text-sm font-medium">{day.label}</span>
                            <div className="space-y-1">
                              <div className="h-2 rounded-full bg-white/70 dark:bg-background/60">
                                <div
                                  className={cn("h-2 rounded-full", calorieStatus.barClassName)}
                                  style={{ width: `${Math.min(100, caloriePercentage)}%` }}
                                />
                              </div>
                              <div className="text-[11px] text-muted-foreground dark:text-foreground/80">
                                {caloriePercentage}% celu ({targetCalories} kcal) • {calorieStatus.label}
                              </div>
                            </div>
                            <span className="text-xs text-muted-foreground dark:text-foreground/80">{calories} kcal • {price.toFixed(2)} PLN</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
              </div>
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}
