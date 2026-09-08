import { fetchMealEntryFull, useDayPlanSummary, useUpdateMealEntry, useToggleEaten, useAddMealEntry, useDeleteMealEntry } from "@/hooks/use-meal-plan";
import { useAllIngredients } from "@/hooks/use-ingredients";
import { useRecipeSearchIndex } from "@/hooks/use-recipes";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, subDays } from "date-fns";
import { pl } from "date-fns/locale";
import { Layout } from "@/components/Layout";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Flame, CheckCircle2, Circle, CalendarDays, ChevronLeft, ChevronRight, Settings2, Wallet, Eye, Check, ChevronsUpDown, X, PlusCircle, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { type MouseEvent, type PointerEvent, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueries } from "@tanstack/react-query";
import { apiRequest, fetchWithTimeout, queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { RecipeView } from "@/components/RecipeView";
import { calculateNutritionAmount, calculatePurchaseAmount, calculateScaledAmount } from "@shared/scaling";
import { buildSharedIngredientsSummary } from "@/lib/shared-ingredients";
import { hasEditedMealIngredients } from "@/lib/meal-entry-ingredients";

export default function Dashboard() {
  type PersonTargets = { calories: number; protein: number; carbs: number; fat: number };
  type MacroKey = Exclude<keyof PersonTargets, "calories">;
  type MacroPercentages = Record<MacroKey, number>;
  type MacroPercentageRange = { min: number; max: number };
  type MacroPercentageRanges = Record<MacroKey, MacroPercentageRange>;
  type MacroStats = { calories: number; protein: number; carbs: number; fat: number };
  const mealTypeLabels: Record<string, string> = {
    breakfast: "Śniadanie",
    snack: "Drugie śniadanie",
    lunch: "Obiad",
    dinner: "Kolacja",
  };
  const [date, setDate] = useState(new Date());
  const dateStr = format(date, "yyyy-MM-dd");
  const nextDateStr = format(addDays(date, 1), "yyyy-MM-dd");
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const { data: dayPlan, isLoading: isLoadingPlan } = useDayPlanSummary(dateStr);
  const { data: nextDayPlan, isLoading: isLoadingNextDayPlan } = useDayPlanSummary(nextDateStr);
  const { mutate: toggleEaten } = useToggleEaten();
  const handleEatenButtonPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    // Keep the touch on the checkbox button itself, so mobile browsers do not
    // treat a near-miss/drag as interaction with the recipe row next to it.
    event.stopPropagation();
  };
  const handleEatenButtonClick = (event: MouseEvent<HTMLButtonElement>, meal: any) => {
    event.preventDefault();
    event.stopPropagation();
    toggleEaten({ id: meal.id, isEaten: !meal.isEaten });
  };
  const [viewingRecipe, setViewingRecipe] = useState<any>(null);
  const [viewingMeal, setViewingMeal] = useState<any>(null);
  const [viewingPlannedServings, setViewingPlannedServings] = useState<number | undefined>(undefined);
  const [disableRecipeScaling, setDisableRecipeScaling] = useState(false);
  const [usePrecalculatedIngredientAmounts, setUsePrecalculatedIngredientAmounts] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddMode, setQuickAddMode] = useState<"recipe" | "ingredient" | "custom">("recipe");
  const [quickMealType, setQuickMealType] = useState("lunch");
  const [quickPerson, setQuickPerson] = useState<"A" | "B">("A");
  const [quickRecipeId, setQuickRecipeId] = useState<number | null>(null);
  const [quickCustomName, setQuickCustomName] = useState("");
  const [quickCustomCalories, setQuickCustomCalories] = useState<number>(450);
  const [quickCustomProtein, setQuickCustomProtein] = useState<number>(25);
  const [quickCustomCarbs, setQuickCustomCarbs] = useState<number>(45);
  const [quickCustomFat, setQuickCustomFat] = useState<number>(15);
  const [quickIngredientId, setQuickIngredientId] = useState<number | null>(null);
  const [quickIngredientAmount, setQuickIngredientAmount] = useState<number>(100);
  const [isQuickRecipePopoverOpen, setIsQuickRecipePopoverOpen] = useState(false);
  const [isQuickIngredientPopoverOpen, setIsQuickIngredientPopoverOpen] = useState(false);
  const upcomingRangeDays = 2;
  const [servingInputs, setServingInputs] = useState<Record<string, string>>({});
  const [targetsByPerson, setTargetsByPerson] = useState<Record<"A" | "B", PersonTargets>>({
    A: { calories: 1850, protein: 120, carbs: 205, fat: 61 },
    B: { calories: 2700, protein: 170, carbs: 302, fat: 90 },
  });
  const [macroPercentagesByPerson, setMacroPercentagesByPerson] = useState<Record<"A" | "B", MacroPercentages>>({
    A: { protein: 26, carbs: 44, fat: 30 },
    B: { protein: 25, carbs: 45, fat: 30 },
  });
  const [macroPercentageRangesByPerson, setMacroPercentageRangesByPerson] = useState<Record<"A" | "B", MacroPercentageRanges>>({
    A: { protein: { min: 26, max: 26 }, carbs: { min: 44, max: 44 }, fat: { min: 30, max: 30 } },
    B: { protein: { min: 25, max: 25 }, carbs: { min: 45, max: 45 }, fat: { min: 30, max: 30 } },
  });

  const [isEditingIngredients, setIsEditingIngredients] = useState(false);
  const [editingMealIngredients, setEditingMealIngredients] = useState<any[]>([]);
  const { data: allAvailableIngredients } = useAllIngredients();
  const { toast } = useToast();

  const { mutate: updateMealEntry, mutateAsync: updateMealEntryAsync, isPending: isSaving } = useUpdateMealEntry();
  const { mutate: addEntry, isPending: isQuickAdding } = useAddMealEntry();
  const { mutate: deleteEntry, isPending: isDeletingMeal } = useDeleteMealEntry();
  const { data: recipes } = useRecipeSearchIndex();
  const upcomingDateStrings = useMemo(
    () => Array.from({ length: upcomingRangeDays }, (_, index) => format(addDays(new Date(), index), "yyyy-MM-dd")),
    [upcomingRangeDays]
  );
  const upcomingRangeEndDate = upcomingDateStrings[upcomingDateStrings.length - 1] || todayStr;
  const upcomingPlans = useQueries({
    queries: upcomingDateStrings.map((day) => ({
      queryKey: [api.mealPlan.getDaySummary.path, day],
      queryFn: async () => {
        const response = await fetchWithTimeout(`/api/meal-plan/${day}/summary`);
        if (!response.ok) throw new Error("Failed to fetch meal plan");
        return response.json();
      },
    })),
  });
  const isLoadingUpcomingPlans = upcomingPlans.some((query) => query.isLoading);
  const { data: upcomingShoppingList = [] } = useQuery<any[]>({
    queryKey: [api.mealPlan.getShoppingList.path, todayStr, upcomingRangeEndDate, "urgent-categories"],
    queryFn: async () => {
      const response = await fetch(`/api/shopping-list?startDate=${todayStr}&endDate=${upcomingRangeEndDate}`);
      if (!response.ok) return [];
      return response.json();
    },
  });
  const selectedQuickRecipe = useMemo(
    () => recipes?.find((recipe: any) => recipe.id === quickRecipeId),
    [recipes, quickRecipeId]
  );
  const quickRecipeServings = useMemo(() => {
    const servings = Number(selectedQuickRecipe?.servings) || 1;
    return Math.max(0.25, servings);
  }, [selectedQuickRecipe]);
  const quickRecipeNutritionPreview = useMemo(() => {
    if (!selectedQuickRecipe) return null;
    const baseServings = Math.max(0.1, Number(selectedQuickRecipe?.servings) || 1);
    const factor = quickRecipeServings / baseServings;
    return {
      calories: Math.round((Number(selectedQuickRecipe?.stats?.calories) || 0) * factor),
      protein: Number(((Number(selectedQuickRecipe?.stats?.protein) || 0) * factor).toFixed(1)),
      carbs: Number(((Number(selectedQuickRecipe?.stats?.carbs) || 0) * factor).toFixed(1)),
      fat: Number(((Number(selectedQuickRecipe?.stats?.fat) || 0) * factor).toFixed(1)),
    };
  }, [selectedQuickRecipe, quickRecipeServings]);
  const selectedQuickIngredient = useMemo(
    () => allAvailableIngredients?.find((ingredient: any) => ingredient.id === quickIngredientId),
    [allAvailableIngredients, quickIngredientId]
  );
  const quickIngredientNutritionPreview = useMemo(() => {
    if (!selectedQuickIngredient) return null;
    const factor = Math.max(0, quickIngredientAmount) / 100;
    return {
      calories: Math.round((Number(selectedQuickIngredient?.calories) || 0) * factor),
      protein: Number(((Number(selectedQuickIngredient?.protein) || 0) * factor).toFixed(1)),
      carbs: Number(((Number(selectedQuickIngredient?.carbs) || 0) * factor).toFixed(1)),
      fat: Number(((Number(selectedQuickIngredient?.fat) || 0) * factor).toFixed(1)),
    };
  }, [selectedQuickIngredient, quickIngredientAmount]);

  const frequentAddonIngredientIds = useMemo(() => new Set(
    (viewingRecipe?.frequentAddons || []).map((addon: any) => Number(addon.ingredientId))
  ), [viewingRecipe?.frequentAddons]);
  const frequentAddonDefinitions = viewingRecipe?.frequentAddons || [];
  const getAddonBaseAmount = (addon: any) => Number(addon?.baseAmount ?? addon?.amount) || 0;
  const getAddonIncrementAmount = (addon: any) => {
    const entryServings = Number(viewingMeal?.servings) || 1;
    const recipeServings = Number(viewingRecipe?.servings) || 1;
    const amount = calculateScaledAmount({
      baseAmount: getAddonBaseAmount(addon),
      scalingType: addon?.scalingType || "LINEAR",
      scalingFormula: addon?.scalingFormula,
      stepThresholds: addon?.stepThresholds,
    }, entryServings, recipeServings);

    return Number.isFinite(amount) ? amount : getAddonBaseAmount(addon);
  };


  const resolveRecipeIngredientSource = (ingredientId: number, occurrence: number) => {
    if (!viewingRecipe) return undefined;
    const recipeIngredients = (viewingRecipe.ingredients || []).filter((ri: any) => Number(ri?.ingredientId) === Number(ingredientId));
    const recipeFrequentAddons = (viewingRecipe.frequentAddons || []).filter((ri: any) => Number(ri?.ingredientId) === Number(ingredientId));
    const candidates = [...recipeIngredients, ...recipeFrequentAddons];
    return candidates[occurrence - 1] || candidates[0];
  };

  const getEntryIngredientServingFactor = (entry: any, ingredientId: number) => {
    const entryServings = Number(entry?.servings) || 1;
    const recipeServings = Number(entry?.recipe?.servings) || 1;
    const frequentAddonIds = new Set<number>(((entry?.recipe?.frequentAddons) || []).map((addon: any) => Number(addon.ingredientId)));
    if (frequentAddonIds.has(Number(ingredientId))) return 1;
    return entryServings / recipeServings;
  };

  const getEffectiveIngredientAmount = (entry: any, ri: any) => {
    if (ri?.scalingType === "FIXED") return Number(ri?.amount) || 0;
    if (typeof ri?.calculatedAmount === "number") return ri.calculatedAmount;
    const factor = getEntryIngredientServingFactor(entry, ri.ingredientId);
    return (Number(ri?.amount) || 0) * factor;
  };

  const getEntryIngredients = (entry: any) => {
    if (Array.isArray(entry?.ingredients) && entry.ingredients.length > 0) return entry.ingredients;
    if (Array.isArray(entry?.recipe?.ingredients)) return entry.recipe.ingredients;
    return [];
  };


  const startEditing = () => {
    if (!viewingRecipe || !viewingMeal) return;

    const hasMealSpecificIngredients = Boolean(viewingMeal?.ingredients && viewingMeal.ingredients.length > 0);
    const currentIngredients = hasMealSpecificIngredients
      ? viewingMeal.ingredients
      : viewingRecipe.ingredients;

    const recipeIngredientCounts = (viewingRecipe.ingredients || []).reduce((acc: Map<number, number>, ingredient: any) => {
      const ingredientId = Number(ingredient?.ingredientId);
      if (!Number.isFinite(ingredientId)) return acc;
      acc.set(ingredientId, (acc.get(ingredientId) || 0) + 1);
      return acc;
    }, new Map<number, number>());
    const occurrenceMap = new Map<number, number>();

    const mappedIngredients = currentIngredients.map((ri: any) => {
      const ingredientId = Number(ri.ingredientId);
      const occurrence = (occurrenceMap.get(ingredientId) || 0) + 1;
      occurrenceMap.set(ingredientId, occurrence);
      const recipeCount = recipeIngredientCounts.get(ingredientId) || 0;
      const isFrequentAddon = frequentAddonIngredientIds.has(ingredientId) && occurrence > recipeCount;

      const source = resolveRecipeIngredientSource(ingredientId, occurrence);
      const ingredientForScaling = {
        ...source,
        ...ri,
        baseAmount: Number(ri?.baseAmount ?? ri?.amount ?? source?.baseAmount ?? source?.amount ?? 0) || 0,
        scalingType: ri?.scalingType ?? source?.scalingType ?? "LINEAR",
        scalingFormula: ri?.scalingFormula ?? source?.scalingFormula,
        stepThresholds: ri?.stepThresholds ?? source?.stepThresholds,
      };

      return {
        ingredientId: ri.ingredientId,
        amount: Math.round(getEffectiveIngredientAmount(viewingMeal, ingredientForScaling as any)),
        ingredient: ri.ingredient,
        isFrequentAddon,
        scalingType: ingredientForScaling.scalingType,
        scalingFormula: ingredientForScaling.scalingFormula,
        stepThresholds: ingredientForScaling.stepThresholds,
      };
    });

    setEditingMealIngredients([
      ...mappedIngredients.filter((item: any) => !item.isFrequentAddon),
      ...mappedIngredients.filter((item: any) => item.isFrequentAddon),
    ]);
    setIsEditingIngredients(true);
  };

  const addIngredientToEdit = () => {
    setEditingMealIngredients([...editingMealIngredients, { ingredientId: 0, amount: 100, ingredient: null }]);
  };

  const addFrequentAddonToEdit = (addon: any) => {
    const addonIngredientId = Number(addon.ingredientId);
    const addonStep = getAddonIncrementAmount(addon);
    if (!addonIngredientId || addonStep <= 0) return;

    setEditingMealIngredients((prev) => {
      const existingIndex = prev.findIndex((item: any) => Number(item.ingredientId) === addonIngredientId && item.isFrequentAddon);
      if (existingIndex >= 0) {
        return prev.map((item: any, idx: number) =>
          idx === existingIndex
            ? {
                ...item,
                amount: Number(item.amount || 0) + addonStep,
                isFrequentAddon: true,
                scalingType: addon?.scalingType || item.scalingType || "LINEAR",
                scalingFormula: addon?.scalingFormula ?? item.scalingFormula,
                stepThresholds: addon?.stepThresholds ?? item.stepThresholds,
              }
            : item
        );
      }

      return [...prev, {
        ingredientId: addonIngredientId,
        amount: addonStep,
        ingredient: addon.ingredient || null,
        isFrequentAddon: true,
        scalingType: addon?.scalingType || "LINEAR",
        scalingFormula: addon?.scalingFormula,
        stepThresholds: addon?.stepThresholds,
      }];
    });
  };

  const updateIngredientInEdit = (index: number, updates: any) => {
    const newIngredients = [...editingMealIngredients];
    newIngredients[index] = { ...newIngredients[index], ...updates };
    if (updates.ingredientId && allAvailableIngredients) {
      newIngredients[index].ingredient = allAvailableIngredients.find((i: any) => i.id === updates.ingredientId);
      newIngredients[index].isFrequentAddon = frequentAddonIngredientIds.has(Number(updates.ingredientId));
    }
    setEditingMealIngredients(newIngredients);
  };

  const removeIngredientFromEdit = (index: number) => {
    setEditingMealIngredients(editingMealIngredients.filter((_, i) => i !== index));
  };


  const splitSharedIngredientsByServings = (ingredients: any[], participants: any[]) => {
    const totalServings = participants.reduce((sum: number, entry: any) => sum + (Number(entry?.servings) || 0), 0);
    const participantAmounts = participants.map(() => [] as any[]);

    ingredients.forEach((ingredient: any) => {
      const totalAmount = Math.round(Number(ingredient.amount) || 0);
      let assignedAmount = 0;

      participants.forEach((entry: any, index: number) => {
        const isLastParticipant = index === participants.length - 1;
        const ratio = totalServings > 0 ? (Number(entry?.servings) || 0) / totalServings : 0;
        const amount = isLastParticipant ? totalAmount - assignedAmount : Math.round(totalAmount * ratio);
        assignedAmount += amount;

        participantAmounts[index].push({
          ingredientId: Number(ingredient.ingredientId),
          amount,
          scalingType: "FIXED" as const,
        });
      });
    });

    return participantAmounts;
  };

  const updateViewingMealServings = (nextServings: number) => {
    if (!viewingMeal) return;
    const safeServings = Math.max(0.5, Math.round(nextServings * 2) / 2);
    setViewingPlannedServings(safeServings);
    setViewingMeal((prev: any) => (prev ? { ...prev, servings: safeServings } : prev));
    updateMealEntry({
      id: viewingMeal.id,
      updates: {
        servings: safeServings,
        isEaten: !!viewingMeal.isEaten,
        date: viewingMeal.date,
        mealType: viewingMeal.mealType,
      },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [`/api/meal-plan/${dateStr}`] });
      },
    });
  };

  const saveIngredients = () => {
    if (!viewingMeal || !viewingRecipe) return;

    const ingredientsData = editingMealIngredients
      .filter(i => i.ingredientId > 0)
      .map(i => ({
        ingredientId: Number(i.ingredientId),
        amount: Number(i.amount) || 0,
        // In individual mode this is the final amount for this person, not a new recipe base.
        overrideAmount: viewingMeal?.portionMode === "INDIVIDUAL" ? (Number(i.amount) || 0) : null,
        scalingType: "FIXED",
      }));

    if (ingredientsData.length === 0) {
      toast({ title: "Błąd", description: "Dodaj przynajmniej jeden składnik.", variant: "destructive" });
      return;
    }

    if (viewingMeal?.sharedParticipantEntries) {
      const participants = [viewingMeal.sharedParticipantEntries.A, viewingMeal.sharedParticipantEntries.B]
        .filter((entry: any) => entry?.id);
      const totalSharedServings = participants.reduce((sum: number, entry: any) => sum + (Number(entry?.servings) || 0), 0);

      if (participants.length > 0 && totalSharedServings > 0) {
        const splitIngredients = splitSharedIngredientsByServings(ingredientsData, participants);

        Promise.all(participants.map((entry: any, index: number) => updateMealEntryAsync({
          id: entry.id,
          updates: {
            ingredients: splitIngredients[index],
            isEaten: !!entry.isEaten,
            date: entry.date,
            mealType: entry.mealType,
          },
        }))).then(() => {
          queryClient.invalidateQueries({ queryKey: [`/api/meal-plan/${dateStr}`] });
          setIsEditingIngredients(false);
          setViewingRecipe(null);
          setViewingMeal(null);
          toast({ title: "Sukces", description: "Wspólna ilość składników została podzielona proporcjonalnie między osoby." });
        }).catch((error: Error) => {
          toast({ title: "Błąd", description: error.message || "Nie udało się zapisać wspólnych składników.", variant: "destructive" });
        });
        return;
      }
    }

    updateMealEntry({
      id: viewingMeal.id,
      updates: {
        ingredients: ingredientsData,
        isEaten: !!viewingMeal.isEaten,
        date: viewingMeal.date,
        mealType: viewingMeal.mealType
      }
    }, {
      onSuccess: () => {
        // Force immediate invalidation on success to be absolutely sure
        queryClient.invalidateQueries({ queryKey: [`/api/meal-plan/${dateStr}`] });
        setIsEditingIngredients(false);
        setViewingRecipe(null);
        setViewingMeal(null);
        toast({ title: "Sukces", description: "Składniki posiłku zostały zaktualizowane." });
      }
    });
  };

  const restoreOriginalIngredients = () => {
    if (!viewingMeal) return;
    updateMealEntry({
      id: viewingMeal.id,
      updates: {
        ingredients: [],
        isEaten: !!viewingMeal.isEaten,
        date: viewingMeal.date,
        mealType: viewingMeal.mealType,
      },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [`/api/meal-plan/${dateStr}`] });
        setViewingMeal((prev: any) => (prev ? { ...prev, ingredients: [] } : prev));
        setDisableRecipeScaling(false);
        toast({ title: "Sukces", description: "Przywrócono domyślne składniki z przepisu." });
      },
    });
  };

  const { data: settings, isLoading: isLoadingSettings } = useQuery<any>({
    queryKey: ["/api/user-settings"],
  });
  const { data: userSettingsHistory, isLoading: isLoadingSettingsHistory } = useQuery<Record<"A" | "B", any[]>>({
    queryKey: [api.userSettings.history.path, "0001-01-01", dateStr],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate: "0001-01-01", endDate: dateStr });
      const response = await fetchWithTimeout(`${api.userSettings.history.path}?${params.toString()}`);
      if (!response.ok) throw new Error("Nie udało się pobrać historii ustawień");
      return api.userSettings.history.responses[200].parse(await response.json());
    },
  });

  useEffect(() => {
    if (!settings) return;
    const baseTargets = {
      A: {
        calories: settings?.A?.targetCalories ?? 2000,
        protein: settings?.A?.targetProtein ?? 150,
        carbs: settings?.A?.targetCarbs ?? 200,
        fat: settings?.A?.targetFat ?? 65,
      },
      B: {
        calories: settings?.B?.targetCalories ?? settings?.A?.targetCalories ?? 2000,
        protein: settings?.B?.targetProtein ?? settings?.A?.targetProtein ?? 150,
        carbs: settings?.B?.targetCarbs ?? settings?.A?.targetCarbs ?? 200,
        fat: settings?.B?.targetFat ?? settings?.A?.targetFat ?? 65,
      },
    };

    let localOverrides: any = {};
    let localPercentageOverrides: any = {};
    let localPercentageRangeOverrides: any = {};
    try {
      localOverrides = JSON.parse(localStorage.getItem("dashboard-person-targets") || "{}");
      localPercentageOverrides = JSON.parse(localStorage.getItem("dashboard-person-macro-percentages") || "{}");
      localPercentageRangeOverrides = JSON.parse(localStorage.getItem("dashboard-person-macro-percentage-ranges") || "{}");
    } catch {
      localOverrides = {};
      localPercentageOverrides = {};
      localPercentageRangeOverrides = {};
    }

    const nextTargets = {
      A: {
        calories: Number(localOverrides?.A?.calories ?? baseTargets.A.calories),
        protein: Number(localOverrides?.A?.protein ?? baseTargets.A.protein),
        carbs: Number(localOverrides?.A?.carbs ?? baseTargets.A.carbs),
        fat: Number(localOverrides?.A?.fat ?? baseTargets.A.fat),
      },
      B: {
        calories: Number(localOverrides?.B?.calories ?? baseTargets.B.calories),
        protein: Number(localOverrides?.B?.protein ?? baseTargets.B.protein),
        carbs: Number(localOverrides?.B?.carbs ?? baseTargets.B.carbs),
        fat: Number(localOverrides?.B?.fat ?? baseTargets.B.fat),
      },
    };

    setTargetsByPerson(nextTargets);
    const nextPercentages = {
      A: {
        protein: Number(localPercentageOverrides?.A?.protein ?? settings?.A?.targetProteinPercentage ?? getMacroPercentages(nextTargets.A).protein),
        carbs: Number(localPercentageOverrides?.A?.carbs ?? settings?.A?.targetCarbsPercentage ?? getMacroPercentages(nextTargets.A).carbs),
        fat: Number(localPercentageOverrides?.A?.fat ?? settings?.A?.targetFatPercentage ?? getMacroPercentages(nextTargets.A).fat),
      },
      B: {
        protein: Number(localPercentageOverrides?.B?.protein ?? settings?.B?.targetProteinPercentage ?? settings?.A?.targetProteinPercentage ?? getMacroPercentages(nextTargets.B).protein),
        carbs: Number(localPercentageOverrides?.B?.carbs ?? settings?.B?.targetCarbsPercentage ?? settings?.A?.targetCarbsPercentage ?? getMacroPercentages(nextTargets.B).carbs),
        fat: Number(localPercentageOverrides?.B?.fat ?? settings?.B?.targetFatPercentage ?? settings?.A?.targetFatPercentage ?? getMacroPercentages(nextTargets.B).fat),
      },
    };
    setMacroPercentagesByPerson(nextPercentages);
    setMacroPercentageRangesByPerson({
      A: buildMacroPercentageRanges("A", settings?.A, nextPercentages.A, localPercentageRangeOverrides?.A),
      B: buildMacroPercentageRanges("B", settings?.B ?? settings?.A, nextPercentages.B, localPercentageRangeOverrides?.B),
    });
  }, [settings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: any) => {
      const res = await apiRequest("PATCH", "/api/user-settings", newSettings);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-settings"] });
      queryClient.invalidateQueries({ queryKey: [api.userSettings.history.path] });
    },
  });

  const isToday = dateStr === todayStr;
  const allEntries = dayPlan?.entries || [];
  const personName: Record<string, string> = { A: "Tysia", B: "Mati" };
  const alternateViewingMeal = useMemo(() => {
    if (!viewingMeal?.recipeId) return null;
    const currentPerson: "A" | "B" = (viewingMeal.person || "A") === "B" ? "B" : "A";
    const otherPerson = currentPerson === "A" ? "B" : "A";
    const currentBatchId = Number(viewingMeal.cookedBatchId || 0);

    return allEntries.find((entry: any) => {
      if ((entry.person || "A") !== otherPerson) return false;
      if (Number(entry.recipeId || 0) !== Number(viewingMeal.recipeId || 0)) return false;
      if (entry.mealType !== viewingMeal.mealType) return false;
      if (String(entry.date || dateStr) !== String(viewingMeal.date || dateStr)) return false;
      const entryBatchId = Number(entry.cookedBatchId || 0);
      return currentBatchId > 0 ? entryBatchId === currentBatchId : true;
    }) || null;
  }, [allEntries, dateStr, viewingMeal]);
  const sharedCookCards = useMemo(() => {
    const entriesWithDay = upcomingPlans.flatMap((plan, index) => {
      const entries = (plan.data?.entries || []) as any[];
      const dayDate = addDays(new Date(), index);
      const dayLabel = index === 0 ? "Dziś" : index === 1 ? "Jutro" : format(dayDate, "EEE, d.MM", { locale: pl });
      return entries
        .filter((entry) => entry?.isEaten !== true)
        .map((entry) => ({ ...entry, __dayLabel: dayLabel, __dayIndex: index }));
    });

    const sharedMap = new Map<string, { A: any[]; B: any[] }>();
    entriesWithDay.forEach((entry: any) => {
      if (!entry?.recipeId || !entry?.recipe) return;
      const person: "A" | "B" = (entry.person || "A") === "B" ? "B" : "A";
      const batchId = Number(entry.cookedBatchId || 0);
      const key = batchId > 0
        ? `batch:${batchId}`
        : `fallback:${entry.__dayLabel}:${entry.mealType}__${entry.recipeId}`;
      const current = sharedMap.get(key) || { A: [], B: [] };
      current[person].push(entry);
      sharedMap.set(key, current);
    });

    const sumServings = (entries: any[]) => entries.reduce((sum, entry) => sum + (Number(entry?.servings) || 0), 0);
    const mealOrder: Record<string, number> = { breakfast: 0, snack: 1, lunch: 2, dinner: 3 };
    return Array.from(sharedMap.entries())
      .map(([key, pair]) => {
        const allA = pair.A || [];
        const allB = pair.B || [];
        const primaryEntry = allA[0] || allB[0];
        if (!primaryEntry) return null;
        const isBatch = Number(primaryEntry?.cookedBatchId || 0) > 0;
        if (allA.length === 0 || allB.length === 0) {
          if (!isBatch) return null;
        }

        const allocatedServings = sumServings(allA) + sumServings(allB);
        const cookedBatchServings = Number(primaryEntry?.cookedBatch?.totalServings || 0);
        const servings = cookedBatchServings > 0 ? cookedBatchServings : allocatedServings;
        const scaledIngredients = buildSharedIngredientsSummary({
          entriesA: allA,
          entriesB: allB,
          recipe: primaryEntry?.recipe,
        });

        const dayLabels = Array.from(new Set([...(allA.map((entry: any) => entry.__dayLabel)), ...(allB.map((entry: any) => entry.__dayLabel))]));
        const dayLabel = dayLabels.length > 1 ? dayLabels.join(" + ") : (dayLabels[0] || "Dziś");
        const people = [
          ...(allA.length > 0 ? [personName.A] : []),
          ...(allB.length > 0 ? [personName.B] : []),
        ];

        return {
          uniqueKey: `${key}-${primaryEntry?.mealType}-${primaryEntry?.recipeId}`,
          recipe: primaryEntry?.recipe,
          entry: { ...primaryEntry, servings, ingredients: scaledIngredients, isSharedPreview: true, sharedParticipantEntries: { A: allA[0] || null, B: allB[0] || null } },
          dayIndex: Number(primaryEntry?.__dayIndex ?? 0),
          servings,
          dayLabel,
          mealLabel: mealTypeLabels[primaryEntry?.mealType] || primaryEntry?.mealType,
          people,
        };
      })
      .filter(Boolean)
      .sort((left: any, right: any) => {
        const byDay = Number(left?.dayIndex ?? 0) - Number(right?.dayIndex ?? 0);
        if (byDay !== 0) return byDay;
        return (mealOrder[left?.entry?.mealType] ?? 99) - (mealOrder[right?.entry?.mealType] ?? 99);
      });
  }, [upcomingPlans]);

  const urgentCategories = useMemo(() => {
    const normalizeCategory = (value: string = "") => value.trim().toLowerCase();
    const allowed = new Set(["mięso", "mieso", "pieczywo"]);
    return upcomingShoppingList
      .filter((item: any) => !item?.isExcluded)
      .filter((item: any) => allowed.has(normalizeCategory(item?.category || "")))
      .map((item: any) => ({
        ...item,
        normalizedCategory: normalizeCategory(item?.category || ""),
      }))
      .sort((a: any, b: any) => (a.normalizedCategory || "").localeCompare(b.normalizedCategory || "", "pl"));
  }, [upcomingShoppingList]);

  const calculateConsumed = (entries: any[]): MacroStats => {
    const eatenEntries = entries.filter((e: any) => e.isEaten) || [];

    return eatenEntries.reduce((acc: any, entry: any) => {
      if (entry.customCalories !== null) {
        const s = Number(entry.servings) || 1;
        return {
          ...acc,
          calories: acc.calories + (entry.customCalories || 0) * s,
          protein: acc.protein + (entry.customProtein || 0) * s,
          carbs: acc.carbs + (entry.customCarbs || 0) * s,
          fat: acc.fat + (entry.customFat || 0) * s,
        };
      }

      if (entry.totals) {
        return {
          calories: acc.calories + (Number(entry.totals.calories) || 0),
          protein: acc.protein + (Number(entry.totals.protein) || 0),
          carbs: acc.carbs + (Number(entry.totals.carbs) || 0),
          fat: acc.fat + (Number(entry.totals.fat) || 0),
        };
      }

      const entryIngredients = getEntryIngredients(entry);
      const stats = entryIngredients.reduce((sum: any, ri: any) => {
        if (!ri.ingredient) return sum;
        const effectiveAmount = getEffectiveIngredientAmount(entry, ri);
        const nutritionAmount = calculateNutritionAmount(effectiveAmount, ri.ingredient);
        return {
          calories: sum.calories + (ri.ingredient.calories * nutritionAmount / 100),
          protein: sum.protein + (ri.ingredient.protein * nutritionAmount / 100),
          carbs: sum.carbs + (ri.ingredient.carbs * nutritionAmount / 100),
          fat: sum.fat + (ri.ingredient.fat * nutritionAmount / 100),
        };
      }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

      return {
        calories: acc.calories + stats.calories,
        protein: acc.protein + stats.protein,
        carbs: acc.carbs + stats.carbs,
        fat: acc.fat + stats.fat,
      };
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
  };


  const getEffectiveTargetsForDay = (person: "A" | "B"): PersonTargets => {
    const history = [...(userSettingsHistory?.[person] || [])].sort((a, b) =>
      String(b.effectiveDate).localeCompare(String(a.effectiveDate))
    );
    const effective = history.find((row) => String(row.effectiveDate) <= dateStr);
    return {
      calories: Number(effective?.targetCalories ?? targetsByPerson[person].calories),
      protein: Number(effective?.targetProtein ?? targetsByPerson[person].protein),
      carbs: Number(effective?.targetCarbs ?? targetsByPerson[person].carbs),
      fat: Number(effective?.targetFat ?? targetsByPerson[person].fat),
    };
  };

  const effectiveTargetsByPerson = {
    A: getEffectiveTargetsForDay("A"),
    B: getEffectiveTargetsForDay("B"),
  };

  const isDashboardLoading = isLoadingPlan || isLoadingNextDayPlan || isLoadingSettings || isLoadingSettingsHistory || isLoadingUpcomingPlans;

  const consumedA = calculateConsumed(allEntries.filter((e: any) => (e.person || "A") === "A"));
  const consumedB = calculateConsumed(allEntries.filter((e: any) => (e.person || "A") === "B"));

  const totalDayCost = (dayPlan?.entries || []).reduce((acc: number, entry: any) => {
    const entryIngredients = getEntryIngredients(entry);
    return acc + entryIngredients.reduce((sum: number, ri: any) => {
      const effectiveAmount = getEffectiveIngredientAmount(entry, ri);
      return sum + ((ri.ingredient?.price || 0) * calculatePurchaseAmount(effectiveAmount, ri.ingredient) / 100);
    }, 0);
  }, 0) || 0;

  const resetQuickAdd = () => {
    setQuickAddMode("recipe");
    setQuickMealType("lunch");
    setQuickPerson("A");
    setQuickRecipeId(null);
    setQuickCustomName("");
    setQuickCustomCalories(450);
    setQuickCustomProtein(25);
    setQuickCustomCarbs(45);
    setQuickCustomFat(15);
    setQuickIngredientId(null);
    setQuickIngredientAmount(100);
    setIsQuickRecipePopoverOpen(false);
    setIsQuickIngredientPopoverOpen(false);
  };

  const macroCaloriesPerGram: Record<MacroKey, number> = {
    protein: 4,
    carbs: 4,
    fat: 9,
  };

  const macroPercentageLabels: Record<MacroKey, string> = {
    protein: "Białko",
    carbs: "Węglowodany",
    fat: "Tłuszcze",
  };


  const normalizeMacroPercentageRange = (range: MacroPercentageRange): MacroPercentageRange => {
    const min = Math.max(0, Math.min(100, Number(range.min) || 0));
    const max = Math.max(0, Math.min(100, Number(range.max) || 0));
    return min <= max ? { min, max } : { min: max, max: min };
  };

  const buildMacroPercentageRanges = (_person: "A" | "B", source: any, percentages: MacroPercentages, overrides?: any): MacroPercentageRanges => ({
    protein: normalizeMacroPercentageRange({
      min: Number(overrides?.protein?.min ?? source?.targetProteinPercentageMin ?? source?.targetProteinPercentage ?? percentages.protein),
      max: Number(overrides?.protein?.max ?? source?.targetProteinPercentageMax ?? source?.targetProteinPercentage ?? percentages.protein),
    }),
    carbs: normalizeMacroPercentageRange({
      min: Number(overrides?.carbs?.min ?? source?.targetCarbsPercentageMin ?? source?.targetCarbsPercentage ?? percentages.carbs),
      max: Number(overrides?.carbs?.max ?? source?.targetCarbsPercentageMax ?? source?.targetCarbsPercentage ?? percentages.carbs),
    }),
    fat: normalizeMacroPercentageRange({
      min: Number(overrides?.fat?.min ?? source?.targetFatPercentageMin ?? source?.targetFatPercentage ?? percentages.fat),
      max: Number(overrides?.fat?.max ?? source?.targetFatPercentageMax ?? source?.targetFatPercentage ?? percentages.fat),
    }),
  });

  const calculateMacroGramsFromPercentage = (calories: number, macroKey: MacroKey, percentage: number) => (
    Math.round((calories * (Number(percentage) || 0)) / 100 / macroCaloriesPerGram[macroKey])
  );

  const formatMacroRange = (range: MacroPercentageRange) => (
    range.min === range.max ? `${range.min}%` : `${range.min}-${range.max}%`
  );

  const formatMacroGramRange = (calories: number, macroKey: MacroKey, range: MacroPercentageRange) => {
    const min = calculateMacroGramsFromPercentage(calories, macroKey, range.min);
    const max = calculateMacroGramsFromPercentage(calories, macroKey, range.max);
    return min === max ? `${min} g` : `${min}-${max} g`;
  };

  const getMacroPercentages = (targets: PersonTargets): MacroPercentages => {
    if (targets.calories <= 0) return { protein: 0, carbs: 0, fat: 0 };

    return {
      protein: Math.round(((targets.protein * macroCaloriesPerGram.protein) / targets.calories) * 100),
      carbs: Math.round(((targets.carbs * macroCaloriesPerGram.carbs) / targets.calories) * 100),
      fat: Math.round(((targets.fat * macroCaloriesPerGram.fat) / targets.calories) * 100),
    };
  };

  const calculateTargetsFromPercentages = (calories: number, percentages: MacroPercentages): PersonTargets => ({
    calories,
    protein: Math.round((calories * (Number(percentages.protein) || 0)) / 100 / macroCaloriesPerGram.protein),
    carbs: Math.round((calories * (Number(percentages.carbs) || 0)) / 100 / macroCaloriesPerGram.carbs),
    fat: Math.round((calories * (Number(percentages.fat) || 0)) / 100 / macroCaloriesPerGram.fat),
  });

  const persistPersonTargets = (person: "A" | "B", nextTargets: PersonTargets, nextPercentages: MacroPercentages, nextRanges = macroPercentageRangesByPerson[person]) => {
    const normalizedRanges = {
      protein: normalizeMacroPercentageRange(nextRanges.protein),
      carbs: normalizeMacroPercentageRange(nextRanges.carbs),
      fat: normalizeMacroPercentageRange(nextRanges.fat),
    };
    const nextTargetsByPerson = { ...targetsByPerson, [person]: nextTargets };
    const nextPercentagesByPerson = { ...macroPercentagesByPerson, [person]: nextPercentages };
    const nextRangesByPerson = { ...macroPercentageRangesByPerson, [person]: normalizedRanges };

    setTargetsByPerson(nextTargetsByPerson);
    setMacroPercentagesByPerson(nextPercentagesByPerson);
    setMacroPercentageRangesByPerson(nextRangesByPerson);
    localStorage.setItem("dashboard-person-targets", JSON.stringify(nextTargetsByPerson));
    localStorage.setItem("dashboard-person-macro-percentages", JSON.stringify(nextPercentagesByPerson));
    localStorage.setItem("dashboard-person-macro-percentage-ranges", JSON.stringify(nextRangesByPerson));
    updateSettingsMutation.mutate({
      person,
      targetCalories: nextTargets.calories,
      targetProtein: nextTargets.protein,
      targetCarbs: nextTargets.carbs,
      targetFat: nextTargets.fat,
      targetProteinPercentage: nextPercentages.protein,
      targetCarbsPercentage: nextPercentages.carbs,
      targetFatPercentage: nextPercentages.fat,
      targetProteinPercentageMin: normalizedRanges.protein.min,
      targetProteinPercentageMax: normalizedRanges.protein.max,
      targetCarbsPercentageMin: normalizedRanges.carbs.min,
      targetCarbsPercentageMax: normalizedRanges.carbs.max,
      targetFatPercentageMin: normalizedRanges.fat.min,
      targetFatPercentageMax: normalizedRanges.fat.max,
    });
  };

  const updatePersonTargets = (person: "A" | "B", key: keyof PersonTargets, value: number) => {
    const cleanValue = Number(value) || 0;
    const currentTargets = targetsByPerson[person];
    const currentPercentages = macroPercentagesByPerson[person];
    const nextTargets = key === "calories"
      ? calculateTargetsFromPercentages(cleanValue, currentPercentages)
      : { ...currentTargets, [key]: cleanValue };
    const nextPercentages = key === "calories"
      ? currentPercentages
      : { ...currentPercentages, [key]: getMacroPercentages(nextTargets)[key] };

    const nextRanges = key === "calories" ? macroPercentageRangesByPerson[person] : {
      ...macroPercentageRangesByPerson[person],
      [key]: { min: nextPercentages[key], max: nextPercentages[key] },
    };
    persistPersonTargets(person, nextTargets, nextPercentages, nextRanges);
  };

  const updatePersonMacroPercentage = (person: "A" | "B", key: MacroKey, value: number) => {
    const nextPercentages = {
      ...macroPercentagesByPerson[person],
      [key]: Number(value) || 0,
    };
    const nextTargets = calculateTargetsFromPercentages(targetsByPerson[person].calories, nextPercentages);

    persistPersonTargets(person, nextTargets, nextPercentages, {
      ...macroPercentageRangesByPerson[person],
      [key]: { min: nextPercentages[key], max: nextPercentages[key] },
    });
  };

  const updatePersonMacroPercentageRange = (person: "A" | "B", key: MacroKey, edge: keyof MacroPercentageRange, value: number) => {
    const rawRange = { ...macroPercentageRangesByPerson[person][key], [edge]: Number(value) || 0 };
    const nextRanges = { ...macroPercentageRangesByPerson[person], [key]: normalizeMacroPercentageRange(rawRange) };
    const midpointPercentage = Math.round((nextRanges[key].min + nextRanges[key].max) / 2);
    const nextPercentages = { ...macroPercentagesByPerson[person], [key]: midpointPercentage };
    const nextTargets = calculateTargetsFromPercentages(targetsByPerson[person].calories, nextPercentages);
    persistPersonTargets(person, nextTargets, nextPercentages, nextRanges);
  };

  const macrosConfig: { key: keyof MacroStats; label: string; unit: string; barClassName: string }[] = [
    { key: "calories", label: "KCAL", unit: "kcal", barClassName: "bg-primary" },
    { key: "protein", label: "B", unit: "g", barClassName: "bg-blue-500" },
    { key: "carbs", label: "W", unit: "g", barClassName: "bg-amber-500" },
    { key: "fat", label: "T", unit: "g", barClassName: "bg-rose-500" },
  ];

  const getProgressPercent = (current: number, target: number) => {
    if (target <= 0) return 0;
    return (current / target) * 100;
  };

  const getProgressBarWidth = (current: number, target: number) => Math.min(getProgressPercent(current, target), 100);

  const renderMacroTiles = (title: string, consumedPerson: MacroStats, targets: PersonTargets) => (
    <div className="rounded-2xl border border-border/50 bg-white p-4 md:p-5 shadow-sm">
      <p className="mb-4 text-sm font-semibold text-foreground">{title}</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {macrosConfig.map((macro) => (
          <div key={macro.key} className="rounded-xl border border-border/60 bg-card p-3">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">{macro.label}</p>
              <p className="text-xs text-muted-foreground">
                {Math.round(consumedPerson[macro.key])} / {Math.round(targets[macro.key])} {macro.unit}
              </p>
            </div>
            <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-500", macro.barClassName)}
                style={{ width: `${getProgressBarWidth(consumedPerson[macro.key], targets[macro.key])}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {Math.round(getProgressPercent(consumedPerson[macro.key], targets[macro.key]))}% celu
            </p>
          </div>
        ))}
      </div>
    </div>
  );


  const getServingInputKey = (entry: any) => `${entry.id}-${entry.person || "A"}`;

  const updateServingsQuick = (entry: any, nextServings: number) => {
    const parsed = Number(nextServings);
    if (!parsed || parsed <= 0) return;

    updateMealEntry({
      id: entry.id,
      updates: {
        servings: parsed,
        isEaten: !!entry.isEaten,
        person: entry.person || "A",
        date: entry.date,
        mealType: entry.mealType,
      },
    });
  };

  const applyServingInput = (entry: any) => {
    const inputKey = getServingInputKey(entry);
    const rawValue = servingInputs[inputKey];
    if (rawValue === undefined) return;
    const parsed = Number(rawValue.replace(",", "."));
    if (!parsed || parsed <= 0) {
      setServingInputs((prev) => {
        const next = { ...prev };
        delete next[inputKey];
        return next;
      });
      return;
    }

    const rounded = Math.round(parsed * 100) / 100;
    updateServingsQuick(entry, rounded);
    setServingInputs((prev) => {
      const next = { ...prev };
      delete next[inputKey];
      return next;
    });
  };

  const updateIngredientAmountQuick = (entry: any, nextAmount: number) => {
    const entryIngredient = entry?.ingredients?.[0];
    const parsed = Math.max(1, Math.round(Number(nextAmount) || 0));
    if (!entryIngredient?.ingredientId || parsed <= 0) return;

    const ingredient = entryIngredient.ingredient || allAvailableIngredients?.find((item: any) => Number(item.id) === Number(entryIngredient.ingredientId));
    const factor = parsed / 100;

    updateMealEntry({
      id: entry.id,
      updates: {
        ingredients: [{ ingredientId: entryIngredient.ingredientId, amount: parsed }],
        servings: Number(entry.servings) || 1,
        isEaten: !!entry.isEaten,
        person: entry.person || "A",
        date: entry.date,
        mealType: entry.mealType,
        ...(ingredient ? {
          customCalories: Math.round((Number(ingredient.calories) || 0) * factor),
          customProtein: Number(((Number(ingredient.protein) || 0) * factor).toFixed(1)),
          customCarbs: Number(((Number(ingredient.carbs) || 0) * factor).toFixed(1)),
          customFat: Number(((Number(ingredient.fat) || 0) * factor).toFixed(1)),
        } : {}),
      },
    });
  };

  const quickAddValidationMessage = useMemo(() => {
    if (quickAddMode === "recipe" && !quickRecipeId) return "Wybierz przepis, aby dodać posiłek.";
    if (quickAddMode === "ingredient" && !quickIngredientId) return "Wybierz składnik, aby dodać wpis.";
    if (quickAddMode === "ingredient" && quickIngredientAmount <= 0) return "Podaj gramaturę większą niż 0 g.";
    if (quickAddMode === "custom" && !quickCustomName.trim()) return "Podaj nazwę własnego posiłku.";
    return null;
  }, [quickAddMode, quickRecipeId, quickIngredientId, quickIngredientAmount, quickCustomName]);

  const handleQuickAddMeal = () => {
    if (quickAddMode === "recipe") {
      if (!quickRecipeId) {
        toast({ title: "Błąd", description: "Wybierz przepis.", variant: "destructive" });
        return;
      }

      addEntry({
        date: dateStr,
        mealType: quickMealType,
        person: quickPerson,
        recipeId: quickRecipeId,
        servings: 1,
        isEaten: true,
      }, {
        onSuccess: () => {
          setIsQuickAddOpen(false);
          resetQuickAdd();
          toast({ title: "Dodano", description: "Posiłek został dodany do planu i oznaczony jako zjedzony." });
        },
      });
      return;
    }

    if (quickAddMode === "ingredient") {
      if (!quickIngredientId || !allAvailableIngredients) {
        toast({ title: "Błąd", description: "Wybierz składnik.", variant: "destructive" });
        return;
      }

      if (quickIngredientAmount <= 0) {
        toast({ title: "Błąd", description: "Podaj poprawną gramaturę.", variant: "destructive" });
        return;
      }

      const ingredient = allAvailableIngredients.find((item: any) => item.id === quickIngredientId);
      if (!ingredient) {
        toast({ title: "Błąd", description: "Nie znaleziono składnika.", variant: "destructive" });
        return;
      }

      const factor = quickIngredientAmount / 100;
      addEntry({
        date: dateStr,
        mealType: quickMealType,
        person: quickPerson,
        customName: ingredient.name,
        customCalories: Math.round((ingredient.calories || 0) * factor),
        customProtein: Number(((ingredient.protein || 0) * factor).toFixed(1)),
        customCarbs: Number(((ingredient.carbs || 0) * factor).toFixed(1)),
        customFat: Number(((ingredient.fat || 0) * factor).toFixed(1)),
        servings: 1,
        isEaten: true,
        recipeId: null as any,
      }, {
        onSuccess: (entry) => {
          updateMealEntry({
            id: entry.id,
            updates: {
              ingredients: [{ ingredientId: quickIngredientId, amount: Math.round(quickIngredientAmount) }],
              servings: 1,
            },
          }, {
            onSuccess: () => {
              setIsQuickAddOpen(false);
              resetQuickAdd();
              toast({ title: "Dodano", description: "Składnik został dodany i oznaczony jako zjedzony." });
            },
          });
        },
      });
      return;
    }

    if (!quickCustomName.trim()) {
      toast({ title: "Błąd", description: "Podaj nazwę posiłku.", variant: "destructive" });
      return;
    }

    addEntry({
      date: dateStr,
      mealType: quickMealType,
      person: quickPerson,
      customName: quickCustomName.trim(),
      customCalories: Number(quickCustomCalories) || 0,
      customProtein: Number(quickCustomProtein) || 0,
      customCarbs: Number(quickCustomCarbs) || 0,
      customFat: Number(quickCustomFat) || 0,
      servings: 1,
      isEaten: true,
      recipeId: null as any,
    }, {
      onSuccess: () => {
        setIsQuickAddOpen(false);
        resetQuickAdd();
        toast({ title: "Dodano", description: "Posiłek został dodany do planu i oznaczony jako zjedzony." });
      },
    });
  };


  if (isDashboardLoading) return <Layout><LoadingSpinner /></Layout>;

  return (
    <Layout>
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-4">
            <p className="text-muted-foreground text-lg">
              {isToday ? "Podsumowanie na dziś," : "Podsumowanie na"} <span className="font-semibold text-foreground">{format(date, "EEEE, d MMMM", { locale: pl })}</span>
            </p>
            <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full text-primary font-bold text-sm">
              <Wallet className="w-4 h-4" />
              {Math.round(totalDayCost)} PLN
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={isQuickAddOpen} onOpenChange={(open) => {
            setIsQuickAddOpen(open);
            if (!open) resetQuickAdd();
          }}>
            <DialogTrigger asChild>
              <Button className="rounded-xl gap-2">
                <PlusCircle className="w-4 h-4" />
                Szybkie dodanie
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl bg-white">
              <DialogHeader>
                <DialogTitle>Szybko dodaj zjedzony posiłek</DialogTitle>
                <DialogDescription>Wybierz osobę i dodaj zjedzony posiłek z przepisu lub jako własny wpis.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Typ posiłku</label>
                    <Select value={quickMealType} onValueChange={setQuickMealType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="breakfast">Śniadanie</SelectItem>
                        <SelectItem value="snack">Drugie śniadanie</SelectItem>
                        <SelectItem value="lunch">Obiad</SelectItem>
                        <SelectItem value="dinner">Kolacja</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Osoba</label>
                    <Select value={quickPerson} onValueChange={(v: "A" | "B") => setQuickPerson(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A">Tysia</SelectItem>
                        <SelectItem value="B">Mati</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button type="button" variant={quickAddMode === "recipe" ? "default" : "outline"} onClick={() => setQuickAddMode("recipe")} className="flex-1">
                    Z przepisu
                  </Button>
                  <Button type="button" variant={quickAddMode === "ingredient" ? "default" : "outline"} onClick={() => setQuickAddMode("ingredient")} className="flex-1">
                    Składnik
                  </Button>
                  <Button type="button" variant={quickAddMode === "custom" ? "default" : "outline"} onClick={() => setQuickAddMode("custom")} className="flex-1">
                    Własny posiłek
                  </Button>
                </div>

                {quickAddMode === "recipe" ? (
                  <div>
                    <label className="text-sm font-medium">Przepis</label>
                    <Popover open={isQuickRecipePopoverOpen} onOpenChange={setIsQuickRecipePopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" className={cn("w-full justify-between", !quickRecipeId && "text-muted-foreground")}>
                          {quickRecipeId ? recipes?.find((r) => r.id === quickRecipeId)?.name : "Wybierz przepis..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[440px] p-0">
                        <Command>
                          <CommandInput placeholder="Szukaj przepisu..." />
                          <CommandList>
                            <CommandEmpty>Nie znaleziono przepisu.</CommandEmpty>
                            <CommandGroup>
                              {recipes?.map((recipe) => (
                                <PopoverClose asChild key={recipe.id}>
                                  <CommandItem
                                    value={recipe.name}
                                    onSelect={() => {
                                      setQuickRecipeId(recipe.id);
                                      setIsQuickRecipePopoverOpen(false);
                                    }}
                                  >
                                    <Check className={cn("mr-2 h-4 w-4", quickRecipeId === recipe.id ? "opacity-100" : "opacity-0")} />
                                    {recipe.name}
                                  </CommandItem>
                                </PopoverClose>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {quickRecipeNutritionPreview && (
                      <div className="mt-2 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm">
                        <p className="font-semibold text-violet-700 dark:text-violet-300">
                          Makro i kcal dla ~{quickRecipeServings} porcji
                        </p>
                        <p className="text-foreground">
                          {quickRecipeNutritionPreview.calories} kcal • B: {quickRecipeNutritionPreview.protein} g • W: {quickRecipeNutritionPreview.carbs} g • T: {quickRecipeNutritionPreview.fat} g
                        </p>
                      </div>
                    )}
                  </div>
                ) : quickAddMode === "ingredient" ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium">Składnik</label>
                      <Popover open={isQuickIngredientPopoverOpen} onOpenChange={setIsQuickIngredientPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" role="combobox" className={cn("w-full justify-between", !quickIngredientId && "text-muted-foreground")}>
                            {quickIngredientId ? allAvailableIngredients?.find((i: any) => i.id === quickIngredientId)?.name : "Wybierz składnik..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[440px] p-0">
                          <Command>
                            <CommandInput placeholder="Szukaj składnika..." />
                            <CommandList>
                              <CommandEmpty>Nie znaleziono składnika.</CommandEmpty>
                              <CommandGroup>
                                {allAvailableIngredients?.map((ingredient: any) => (
                                  <PopoverClose asChild key={ingredient.id}>
                                    <CommandItem
                                      value={ingredient.name}
                                      onSelect={() => {
                                        setQuickIngredientId(ingredient.id);
                                        setIsQuickIngredientPopoverOpen(false);
                                      }}
                                    >
                                      <Check className={cn("mr-2 h-4 w-4", quickIngredientId === ingredient.id ? "opacity-100" : "opacity-0")} />
                                      {ingredient.name}
                                    </CommandItem>
                                  </PopoverClose>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Gramatura (g)</label>
                      <Input type="number" min={1} value={quickIngredientAmount} onChange={(e) => setQuickIngredientAmount(Number(e.target.value) || 0)} />
                    </div>
                    {selectedQuickIngredient && (
                      <div className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm">
                        <p className="font-semibold text-violet-700 dark:text-violet-300">{selectedQuickIngredient.name}</p>
                        {quickIngredientNutritionPreview && (
                          <p className="text-foreground">
                            Dla {Math.max(0, quickIngredientAmount)} g: {quickIngredientNutritionPreview.calories} kcal • B: {quickIngredientNutritionPreview.protein} g • W: {quickIngredientNutritionPreview.carbs} g • T: {quickIngredientNutritionPreview.fat} g
                          </p>
                        )}
                        {Number(selectedQuickIngredient?.unitWeight || 0) > 0 && (
                          <p className="text-xs text-violet-700 dark:text-violet-300">
                            {selectedQuickIngredient.unitDescription ? `${selectedQuickIngredient.unitDescription} • ` : ""}
                            1 szt. ≈ {selectedQuickIngredient.unitWeight} g
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium">Nazwa posiłku</label>
                      <Input value={quickCustomName} onChange={(e) => setQuickCustomName(e.target.value)} placeholder="np. Kanapka po treningu" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-sm font-medium">Kalorie</label><Input type="number" value={quickCustomCalories} onChange={(e) => setQuickCustomCalories(Number(e.target.value))} /></div>
                      <div><label className="text-sm font-medium">Białko (g)</label><Input type="number" value={quickCustomProtein} onChange={(e) => setQuickCustomProtein(Number(e.target.value))} /></div>
                      <div><label className="text-sm font-medium">Węglowodany (g)</label><Input type="number" value={quickCustomCarbs} onChange={(e) => setQuickCustomCarbs(Number(e.target.value))} /></div>
                      <div><label className="text-sm font-medium">Tłuszcz (g)</label><Input type="number" value={quickCustomFat} onChange={(e) => setQuickCustomFat(Number(e.target.value))} /></div>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
                {quickAddValidationMessage ? (
                  <p className="text-xs text-muted-foreground sm:mr-auto">{quickAddValidationMessage}</p>
                ) : null}
                <Button variant="outline" onClick={() => setIsQuickAddOpen(false)}>Anuluj</Button>
                <Button onClick={handleQuickAddMeal} disabled={isQuickAdding || !!quickAddValidationMessage}>{isQuickAdding ? "Dodawanie..." : "Dodaj i oznacz jako zjedzone"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" className="rounded-xl">
                <Settings2 className="w-5 h-5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Ustawienia celów (osobno dla każdej osoby)</DialogTitle>
                <DialogDescription>Ustaw dzienne cele kalorii i makroskładników niezależnie dla Tysi oraz Matiego.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {(["A", "B"] as const).map((person) => {
                  const ranges = macroPercentageRangesByPerson[person];
                  return (
                    <div key={person} className="space-y-4 rounded-xl border border-border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{personName[person]}</p>
                          <p className="text-xs text-muted-foreground">Podaj kcal i zakres procentowy, np. 20-35%, a widełki gramów przeliczą się automatycznie.</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Kalorie (kcal)</label>
                          <Input
                            type="number"
                            value={targetsByPerson[person].calories}
                            onChange={(e) => updatePersonTargets(person, "calories", Number(e.target.value))}
                          />
                        </div>
                        <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                          1 g białka = 4 kcal, 1 g węglowodanów = 4 kcal, 1 g tłuszczu = 9 kcal.
                        </div>
                      </div>

                      <div className="grid grid-cols-[1fr_4.5rem_4.5rem_5.5rem] items-end gap-2">
                        <p className="text-xs font-semibold text-muted-foreground">Makro</p>
                        <p className="text-xs font-semibold text-muted-foreground">Min %</p>
                        <p className="text-xs font-semibold text-muted-foreground">Max %</p>
                        <p className="text-xs font-semibold text-muted-foreground">Widełki</p>

                        {(["protein", "carbs", "fat"] as MacroKey[]).map((macroKey) => (
                          <div key={`${person}-${macroKey}`} className="contents">
                            <label className="pb-2 text-xs font-medium">{macroPercentageLabels[macroKey]}</label>
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={ranges[macroKey].min}
                              onChange={(e) => updatePersonMacroPercentageRange(person, macroKey, "min", Number(e.target.value))}
                              aria-label={`${macroPercentageLabels[macroKey]} minimalny procent kalorii dla ${personName[person]}`}
                            />
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={ranges[macroKey].max}
                              onChange={(e) => updatePersonMacroPercentageRange(person, macroKey, "max", Number(e.target.value))}
                              aria-label={`${macroPercentageLabels[macroKey]} maksymalny procent kalorii dla ${personName[person]}`}
                            />
                            <div className="rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs font-medium">
                              <div>{formatMacroRange(ranges[macroKey])}</div>
                              <div className="text-muted-foreground">{formatMacroGramRange(targetsByPerson[person].calories, macroKey, ranges[macroKey])}</div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <p className="text-xs text-muted-foreground">Zakresy makroskładników są traktowane jako niezależne widełki — ich minima i maksima nie muszą sumować się do 100%.</p>
                    </div>
                  );
                })}
              </div>
            </DialogContent>
          </Dialog>
          <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-border shadow-sm">
            <button
              onClick={() => setDate(d => subDays(d, 1))}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => setDate(new Date())}
              className={cn(
                "px-3 py-1 text-sm font-medium rounded-lg transition-colors",
                isToday ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground"
              )}
            >
              Dzisiaj
            </button>
            <button
              onClick={() => setDate(d => addDays(d, 1))}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="space-y-4 mb-8">
        {renderMacroTiles("Tysia", consumedA, effectiveTargetsByPerson.A)}
        {renderMacroTiles("Mati", consumedB, effectiveTargetsByPerson.B)}
      </div>

      <RecipeView
        recipe={viewingRecipe}
        isOpen={!!viewingRecipe}
        onClose={() => {
          setViewingRecipe(null);
          setViewingMeal(null);
          setViewingPlannedServings(undefined);
          setDisableRecipeScaling(false);
          setUsePrecalculatedIngredientAmounts(false);
        }}
        plannedServings={viewingPlannedServings ?? (viewingMeal ? Number(viewingMeal.servings) : undefined)}
        mealEntryIngredients={viewingMeal?.ingredients}
        frequentAddonIds={viewingRecipe?.frequentAddons?.map((addon: any) => addon.ingredientId) || []}
        onEditIngredients={viewingMeal ? startEditing : undefined}
        onPlannedServingsChange={viewingMeal && !disableRecipeScaling ? updateViewingMealServings : undefined}
        servingsLockedReason={hasEditedMealIngredients(viewingMeal) ? "Porcje zablokowane (edytowano składniki)" : undefined}
        allowIngredientEditing={!!viewingMeal}
        onRestoreOriginalIngredients={hasEditedMealIngredients(viewingMeal) ? restoreOriginalIngredients : undefined}
        usePrecalculatedAmounts={usePrecalculatedIngredientAmounts}
        switchPlannedPersonLabel={alternateViewingMeal ? `Pokaż: ${personName[(alternateViewingMeal.person || "A") as "A" | "B"]}` : undefined}
        onSwitchPlannedPerson={alternateViewingMeal ? () => {
          setViewingRecipe(alternateViewingMeal.recipe || viewingRecipe);
          setViewingMeal(alternateViewingMeal);
          setViewingPlannedServings(undefined);
          setUsePrecalculatedIngredientAmounts(Number(alternateViewingMeal?.cookedBatchId || alternateViewingMeal?.cookedBatch?.id) > 0);
        } : undefined}
        compact
        showFooter={false}
        onAddToPlan={() => {}}
      />

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Menu na {isToday ? "dziś" : format(date, "eeee", { locale: pl })}</h2>
          <div className="flex items-center gap-4">
            <Link href="/meal-plan#shared-meals">
              <span className="text-violet-700 text-sm font-semibold hover:underline cursor-pointer">Wspólne posiłki</span>
            </Link>
            <Link href={`/meal-plan?date=${dateStr}`}>
              <span className="text-primary text-sm font-semibold hover:underline cursor-pointer">Edytuj Plan</span>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Pokaż szybkie akcje dashboardu">
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[min(calc(100vw-2rem),32rem)] p-3">
                <div className="space-y-3">
                  <div className="rounded-2xl border border-amber-200/70 bg-amber-50/50 p-4">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-wider text-amber-800">Szybkie zakupy (mięso + pieczywo)</p>
                      <p className="text-xs text-amber-700 mt-1">
                        Tylko dziś i jutro: {format(new Date(), "d.MM", { locale: pl })} - {format(addDays(new Date(), 1), "d.MM", { locale: pl })}
                      </p>
                    </div>
                    {urgentCategories.length === 0 ? (
                      <p className="mt-3 text-sm text-amber-900">✅ Na dziś i jutro nie ma braków do dokupienia dla kategorii: mięso i pieczywo.</p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <p className="text-sm font-semibold text-amber-900">⚠️ Sprawdź i dokup na ostatnią chwilę:</p>
                        <div className="flex flex-wrap gap-2">
                          {urgentCategories.map((item: any) => (
                            <div key={`urgent-${item.ingredientId}-${item.name}`} className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900">
                              {item.name} • {Math.round(Number(item.totalAmount) || 0)} g
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {sharedCookCards.length > 0 && (
                    <div className="rounded-2xl border border-violet-200/70 bg-violet-50/50 p-4">
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <h3 className="text-sm font-extrabold uppercase tracking-wider text-violet-800">GOTUJEMY: dziś i jutro</h3>
                        <Link href="/meal-plan#shared-meals">
                          <span className="text-xs font-semibold text-violet-700 hover:underline cursor-pointer">Zobacz wszystkie wspólne</span>
                        </Link>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {sharedCookCards.map((shared: any) => (
                          <button
                            key={`dashboard-shared-${shared.uniqueKey}`}
                            type="button"
                            onClick={async () => {
                              const participantEntries = shared.entry?.sharedParticipantEntries || {};
                              const [fullMeal, fullEntryA, fullEntryB] = await Promise.all([
                                fetchMealEntryFull(Number(shared.entry.id)),
                                participantEntries.A?.id
                                  ? fetchMealEntryFull(Number(participantEntries.A.id))
                                  : Promise.resolve(participantEntries.A),
                                participantEntries.B?.id
                                  ? fetchMealEntryFull(Number(participantEntries.B.id))
                                  : Promise.resolve(participantEntries.B),
                              ]);
                              const fullRecipe = fullMeal.recipe || shared.recipe;
                              const sharedIngredients = buildSharedIngredientsSummary({
                                entriesA: fullEntryA ? [fullEntryA] : [],
                                entriesB: fullEntryB ? [fullEntryB] : [],
                                recipe: fullRecipe,
                              });
                              setViewingRecipe(fullRecipe);
                              setViewingMeal({
                                ...fullMeal,
                                ingredients: sharedIngredients,
                                sharedParticipantEntries: { A: fullEntryA, B: fullEntryB },
                                isSharedPreview: shared.entry?.isSharedPreview,
                              });
                              setViewingPlannedServings(Number(shared.servings) || undefined);
                              setDisableRecipeScaling(true);
                              setUsePrecalculatedIngredientAmounts(true);
                            }}
                            className="text-left rounded-xl border border-violet-200 bg-white px-3 py-2 hover:border-violet-300 hover:shadow-sm transition-all"
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="h-10 w-10 rounded-lg bg-cover bg-center bg-muted flex-shrink-0"
                                style={{ backgroundImage: `url(${shared.recipe?.imageUrl || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400"})` }}
                              />
                              <div className="min-w-0">
                                <p className="font-semibold text-sm truncate">{shared.recipe?.name}</p>
                                <p className="text-[11px] text-muted-foreground mt-1">
                                  {shared.dayLabel} • {shared.mealLabel} • {shared.people.join(" + ")}
                                </p>
                                <p className="text-[11px] font-semibold text-violet-700 mt-1">
                                  Podgląd przepisu ({shared.servings} por.)
                                </p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {allEntries.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-border">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <CalendarDays className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Brak zaplanowanych posiłków na ten dzień</h3>
            <p className="text-muted-foreground mb-4">Zacznij dodawać zdrowe przepisy do swojego harmonogramu!</p>
            <Link href={`/meal-plan?date=${dateStr}`}>
              <button className="bg-primary text-primary-foreground px-6 py-2 rounded-xl font-medium hover:bg-primary/90 transition-colors">
                Zaplanuj posiłki
              </button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {["breakfast", "snack", "lunch", "dinner"].map((type) => {
              const meals = allEntries.filter((e: any) => e.mealType === type);
              if (!meals?.length) return null;

              return (
                <div key={type} className="bg-white rounded-2xl p-3 shadow-sm border border-border/50">
                  <h3 className="uppercase text-[10px] font-bold text-muted-foreground tracking-wider mb-2">{mealTypeLabels[type]}</h3>
                  <div className="space-y-2">
                    {meals.map((meal: any) => (
                      <div
                        key={meal.id}
                        className={cn(
                          "flex items-center justify-between group rounded-lg border p-2 transition-colors",
                          meal.isEaten ? "border-violet-300 bg-violet-100" : "border-transparent"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            onPointerDown={handleEatenButtonPointerDown}
                            onClick={(event) => handleEatenButtonClick(event, meal)}
                            className={cn(
                              "-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all duration-300 touch-manipulation active:bg-primary/10",
                              meal.isEaten ? "text-primary" : "text-muted-foreground hover:text-primary/70"
                            )}
                            aria-label={meal.isEaten ? "Oznacz posiłek jako niezjedzony" : "Oznacz posiłek jako zjedzony"}
                          >
                            {meal.isEaten ? <CheckCircle2 className="w-7 h-7" /> : <Circle className="w-7 h-7" />}
                          </button>
                          <div
                            className="w-9 h-9 rounded-lg bg-cover bg-center border border-border/50 shrink-0"
                            style={{ backgroundImage: `url(${meal.recipe?.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400'})` }}
                          />

                          <div className="flex flex-col flex-1">
                            <div className="flex items-center gap-2">
                                  <p className={cn(
                                "font-medium text-sm transition-all truncate",
                                meal.isEaten && "text-muted-foreground line-through decoration-primary/50"
                              )}>
                                {meal.recipe?.name || meal.customName}
                              </p>
                              {meal.recipe && (
                                <button
                                  onClick={async () => {
                                    const fullMeal = await fetchMealEntryFull(Number(meal.id));
                                    setViewingRecipe(fullMeal.recipe);
                                    setViewingMeal(fullMeal);
                                    setDisableRecipeScaling(hasEditedMealIngredients(fullMeal));
                                    setUsePrecalculatedIngredientAmounts(Number(fullMeal?.cookedBatchId || fullMeal?.cookedBatch?.id) > 0);
                                  }}
                                  className="text-muted-foreground hover:text-primary p-1 rounded-full hover:bg-secondary transition-colors"
                                  title="Pokaż przepis"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                              {meal.recipe ? (
                                <span className="text-[9px] sm:text-[10px] font-bold text-primary bg-primary/10 px-1.5 sm:px-2 py-0.5 rounded-full whitespace-nowrap">
                                  {personName[meal.person || "A"]}: {(Number(meal.servings) || 1)}/{(Number(meal.recipe?.servings) || 1)} porcji
                                </span>
                              ) : (
                                <span className="text-[9px] sm:text-[10px] font-bold text-muted-foreground bg-secondary/60 px-1.5 sm:px-2 py-0.5 rounded-full whitespace-nowrap">
                                  {personName[meal.person || "A"]}: x{Number(meal.servings) || 1}
                                </span>
                              )}
                              {!meal.recipe && meal.ingredients?.length ? (
                                <div className="flex items-center gap-1 rounded-full border border-border bg-white px-1 py-0.5">
                                  <button
                                    className="h-6 w-6 text-xs rounded-full hover:bg-secondary shrink-0"
                                    onClick={() => updateIngredientAmountQuick(meal, (Number(meal.ingredients[0]?.amount) || 0) - 10)}
                                    title="Zmniejsz gramaturę"
                                  >
                                    -
                                  </button>
                                  <Input
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    step={10}
                                    className="h-6 w-14 text-[11px] font-semibold px-1 py-0 text-center"
                                    value={Number(meal.ingredients[0]?.amount) || 0}
                                    onChange={(e) => updateIngredientAmountQuick(meal, Number(e.target.value))}
                                    aria-label="Gramatura składnika"
                                  />
                                  <span className="text-[10px] font-medium text-muted-foreground">g</span>
                                  <button
                                    className="h-6 w-6 text-xs rounded-full hover:bg-secondary shrink-0"
                                    onClick={() => updateIngredientAmountQuick(meal, (Number(meal.ingredients[0]?.amount) || 0) + 10)}
                                    title="Zwiększ gramaturę"
                                  >
                                    +
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 rounded-full border border-border bg-white px-1 py-0.5">
                                  <button
                                    className="h-6 w-6 text-xs rounded-full hover:bg-secondary shrink-0"
                                    onClick={() => updateServingsQuick(meal, Math.max(0.5, (Number(meal.servings) || 1) - 0.5))}
                                    title="Zmniejsz porcję"
                                  >
                                    -
                                  </button>
                                  <Input
                                    type="number"
                                    inputMode="decimal"
                                    min={0.5}
                                    step={0.5}
                                    className="h-6 w-12 sm:w-14 text-[11px] font-semibold px-1 py-0 text-center"
                                    value={servingInputs[getServingInputKey(meal)] ?? String(Number(meal.servings) || 1)}
                                    onChange={(e) => setServingInputs((prev) => ({ ...prev, [getServingInputKey(meal)]: e.target.value }))}
                                    onBlur={() => applyServingInput(meal)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.currentTarget.blur();
                                      }
                                    }}
                                    aria-label="Liczba porcji"
                                  />
                                  <button
                                    className="h-6 w-6 text-xs rounded-full hover:bg-secondary shrink-0"
                                    onClick={() => updateServingsQuick(meal, (Number(meal.servings) || 1) + 0.5)}
                                    title="Zwiększ porcję"
                                  >
                                    +
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <Flame className="w-3 h-3" />
                                {meal.recipe ? (meal.totals?.calories ?? (() => {
                                  const total = (meal.ingredients && meal.ingredients.length > 0 ? meal.ingredients : (meal.recipe?.ingredients || [])).reduce((sum: number, ri: any) => {
                                    if (!ri.ingredient) return sum;
                                    const effectiveAmount = getEffectiveIngredientAmount(meal, ri);
                                    return sum + (ri.ingredient.calories * calculateNutritionAmount(effectiveAmount, ri.ingredient) / 100);
                                  }, 0);
                                  return Math.round(total);
                                })()) : ((meal.customCalories || 0) * (Number(meal.servings) || 1))} kcal
                              </p>
                              {meal.recipe && (
                                <p className="text-[11px] text-primary/70 font-semibold flex items-center gap-1">
                                  <Wallet className="w-3 h-3" />
                                  {meal.totals?.price ?? (() => {
                                    const total = (meal.ingredients && meal.ingredients.length > 0 ? meal.ingredients : (meal.recipe?.ingredients || [])).reduce((sum: number, ri: any) => {
                                      if (!ri.ingredient) return sum;
                                      const effectiveAmount = getEffectiveIngredientAmount(meal, ri);
                                      return sum + (ri.ingredient.price * calculatePurchaseAmount(effectiveAmount, ri.ingredient) / 100);
                                    }, 0);
                                    return Math.round(total);
                                  })()} PLN
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        <div
                          className="flex items-center gap-2"
                        >
                          <button
                            className="rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                            title="Usuń posiłek"
                            onClick={() => {
                              const mealName = meal.recipe?.name || meal.customName || "ten posiłek";
                              if (window.confirm(`Czy na pewno usunąć ${mealName} z planu?`)) {
                                deleteEntry({ id: meal.id, date: meal.date });
                              }
                            }}
                            disabled={isDeletingMeal}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={isEditingIngredients} onOpenChange={setIsEditingIngredients}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col bg-white">
          <DialogHeader>
            <DialogTitle>Edytuj składniki posiłku</DialogTitle>
            <DialogDescription>Dostosuj składniki i ilości dla wybranego posiłku.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4 space-y-4">
            {frequentAddonDefinitions.length > 0 && (
              <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Najczęstsze dodatki (opcjonalnie)</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {frequentAddonDefinitions.map((addon: any) => {
                    const isAlreadyAdded = editingMealIngredients.some((item: any) => Number(item.ingredientId) === Number(addon.ingredientId) && item.isFrequentAddon);
                    return (
                      <Button
                        key={`edit-addon-${addon.ingredientId}`}
                        type="button"
                        size="sm"
                        variant={isAlreadyAdded ? "secondary" : "outline"}
                        className={cn("h-8", isAlreadyAdded && "border-violet-300 bg-violet-100 text-violet-900")}
                        onClick={() => addFrequentAddonToEdit(addon)}
                      >
                        + {Math.round(getAddonIncrementAmount(addon))}g {addon.ingredient?.name || "Składnik"}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            {editingMealIngredients.map((item, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex gap-2 items-start bg-secondary/20 p-3 rounded-xl border border-transparent max-sm:gap-1.5 max-sm:p-2",
                  item.isFrequentAddon && "border-violet-300 bg-violet-50/50"
                )}
              >
                <div className="min-w-0 flex-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className={cn("w-full min-w-0 justify-between bg-white px-2 text-left max-sm:text-xs", !item.ingredientId && "text-muted-foreground")}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {item.ingredientId > 0
                            ? allAvailableIngredients?.find(i => i.id === item.ingredientId)?.name || item.ingredient?.name || "Nieznany składnik"
                            : "Wybierz składnik..."}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0">
                      <Command>
                        <CommandInput placeholder="Szukaj składnika..." />
                        <CommandList>
                          <CommandEmpty>Nie znaleziono składnika.</CommandEmpty>
                          <CommandGroup>
                            {allAvailableIngredients?.map((i) => (
                              <PopoverClose asChild key={i.id}>
                                <CommandItem
                                  value={i.name}
                                  onSelect={() => updateIngredientInEdit(idx, { ingredientId: i.id })}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      item.ingredientId === i.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {i.name}
                                </CommandItem>
                              </PopoverClose>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {item.isFrequentAddon && (
                    <span className="mt-1 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-800">
                      Najczęstszy dodatek
                    </span>
                  )}
                </div>

                <div className="w-36 shrink-0 max-sm:w-32">
                  <div className="relative">
                    <Input
                      type="number"
                      value={item.amount}
                      onChange={(e) => updateIngredientInEdit(idx, { amount: e.target.value })}
                      className="bg-white pr-8 max-sm:px-2"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-bold">
                      {item.ingredient?.unit || 'g'}
                    </span>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeIngredientFromEdit(idx)}
                  className="shrink-0 text-destructive hover:text-destructive/80 hover:bg-destructive/10 max-sm:h-9 max-sm:w-9"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}

            <Button variant="outline" className="w-full border-dashed" onClick={addIngredientToEdit}>
              + Dodaj składnik
            </Button>
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setIsEditingIngredients(false)} disabled={isSaving}>Anuluj</Button>
            <Button onClick={saveIngredients} disabled={isSaving} className="bg-primary hover:bg-primary/90">
              {isSaving ? <LoadingSpinner /> : "Zapisz zmiany"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
