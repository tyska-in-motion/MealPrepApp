import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { fetchRecipeDetails, useRecipeSearchIndex, useCreateRecipe, useUpdateRecipe, useDeleteRecipe } from "@/hooks/use-recipes";
import { useDebounce } from "@/hooks/use-debounce";
import { useAllIngredients } from "@/hooks/use-ingredients";
import { useAddMealEntry, useDayPlan, useUpdateMealEntry } from "@/hooks/use-meal-plan";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, Clock, Trash2, ChefHat, X, Eye, Edit2, CalendarPlus, Check, ChevronsUpDown, Heart } from "lucide-react";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useToast } from "@/hooks/use-toast";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { calculateNutritionAmount, calculatePurchaseAmount, type ScalingType } from "@shared/scaling";
import { validatePercentageAllocations, type PortionMode } from "@shared/meal-portions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { buildInstructionSteps, parseInstructionLines, type InstructionLink } from "@/lib/instruction-steps";
import { normalizeSearchText } from "@/lib/text-normalize";
import { format, addDays } from "date-fns";
import { pl } from "date-fns/locale";
import { Link } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const parseLocalizedNumberInput = (value: unknown) => {
  if (typeof value !== "string") return value;
  const normalized = value.replace(",", ".").trim();
  return normalized === "" ? 0 : Number(normalized);
};

const localizedNumber = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(parseLocalizedNumberInput, schema);

// Form schema matching the backend expectation
const createRecipeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  tags: z.array(z.string()).optional().default([]),
  description: z.string().optional(),
  instructions: z.string().optional(),
  comments: z.string().optional(),
  instructionSteps: z.array(z.any()).optional(),
  prepTime: z.coerce.number().min(0),
  servings: z.coerce.number().positive("Bazowa liczba porcji musi być większa od 0").default(1),
  preparationType: z.enum(["INDIVIDUAL", "BATCH"]).default("INDIVIDUAL"),
  imageUrl: z.string().optional().or(z.literal("")),
  suggestedRecipes: z.array(z.object({ recipeId: z.coerce.number(), servings: z.coerce.number().min(0.01) })).optional().default([]),
  ingredients: z.array(z.object({
    ingredientId: z.coerce.number(),
    groupName: z.string().max(100).optional(),
    amount: localizedNumber(z.number().positive("Ilość musi być większa od 0")).optional().default(0),
    baseAmount: localizedNumber(z.number().positive("Ilość musi być większa od 0")).optional(),
    unit: z.string().min(1).default("g"),
    alternativeAmount: localizedNumber(z.number().min(0)).optional(),
    alternativeUnit: z.string().optional(),
    scalingType: z.enum(["LINEAR", "FIXED", "STEP", "FORMULA"]).default("LINEAR"),
    scalingFormula: z.string().optional(),
    stepThresholds: z.array(z.object({
      minServings: z.coerce.number().min(0),
      maxServings: z.coerce.number().min(0).nullable().optional(),
      amount: localizedNumber(z.number().min(0)),
    })).optional().default([]),
    mealPrep: z.boolean().optional().default(false),
    mealPrepMaxDaysBefore: z.coerce.number().int().min(1).max(30).optional().default(1),
    mealPrepNotes: z.string().optional(),
  })).min(1, "Add at least one ingredient"),
  frequentAddons: z.array(z.object({
    ingredientId: z.coerce.number(),
    amount: localizedNumber(z.number().min(0)),
    baseAmount: localizedNumber(z.number().min(0)).optional(),
    defaultAmountA: localizedNumber(z.number().min(0)).optional(),
    defaultAmountB: localizedNumber(z.number().min(0)).optional(),
    unit: z.string().min(1).default("g"),
    alternativeAmount: localizedNumber(z.number().min(0)).optional(),
    alternativeUnit: z.string().optional(),
    scalingType: z.enum(["LINEAR", "FIXED", "STEP", "FORMULA"]).default("LINEAR"),
    scalingFormula: z.string().optional(),
    stepThresholds: z.array(z.object({
      minServings: z.coerce.number().min(0),
      maxServings: z.coerce.number().min(0).nullable().optional(),
      amount: localizedNumber(z.number().min(0)),
    })).optional().default([]),
  })).optional().default([]),
});

type RecipeFormData = z.infer<typeof createRecipeSchema>;

import { RecipeView } from "@/components/RecipeView";

export default function Recipes() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [recipePage, setRecipePage] = useState(1);
  const recipesPerPage = 50;
  const [viewMode, setViewMode] = useState<"cards" | "horizontal">("cards");

  useEffect(() => {
    setRecipePage(1);
  }, [debouncedSearch, search]);

  // Pobieramy pełną listę raz, a wyszukiwanie po nazwach i składnikach robimy lokalnie.
  // Dzięki temu wpisywanie kolejnych liter nie odpala serii kosztownych zapytań do API
  // i można poprawnie sortować wyniki po liczbie trafionych składników z wpisanej listy.
  const { data: recipes, isLoading } = useRecipeSearchIndex();
  const recipePagination = (recipes as any)?.pagination;
  const recipeTotal = recipePagination?.total ?? recipes?.length ?? 0;
  const { data: availableIngredients } = useAllIngredients();
  const { mutate: deleteRecipe } = useDeleteRecipe();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [pricedIngredientsOnly, setPricedIngredientsOnly] = useState(false);
  const [sortBy, setSortBy] = useState<string>("frequency");
  const [instructionLinks, setInstructionLinks] = useState<InstructionLink[]>([]);
  const [newInstructionLink, setNewInstructionLink] = useState<InstructionLink>({ stepIndex: 0, text: "", ingredientId: 0, ingredientSource: "ingredient", multiplier: 1 });
  const [newInstructionLinkMultiplierInput, setNewInstructionLinkMultiplierInput] = useState("1");

  const parsePositiveMultiplier = (value: string) => {
    const normalized = value.replace(",", ".").trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  };

  const allTags = Array.from(new Set(recipes?.flatMap(r => r.tags || []) || [])) as string[];

  function getIngredientAmount(ri: any) {
    return Number(ri?.baseAmount ?? ri?.amount ?? 0);
  }

  const resolveSuggestedRecipes = (recipe: any) => {
    const structured = (recipe?.suggestedRecipes || [])
      .map((item: any) => ({ recipeId: Number(item?.recipeId), servings: Number(item?.servings) || 1 }))
      .filter((item: any) => Number.isFinite(item.recipeId) && item.recipeId > 0);

    if (structured.length > 0) return structured;

    return (recipe?.suggestedRecipeIds || [])
      .map((id: any) => ({ recipeId: Number(id), servings: 1 }))
      .filter((item: any) => Number.isFinite(item.recipeId) && item.recipeId > 0);
  };

  const sumRecipeNutritionTotals = (
    recipe: any,
    recipeById: Map<number, any>,
    visited: Set<number> = new Set<number>(),
  ) => {
    const recipeId = Number(recipe?.id);
    if (Number.isFinite(recipeId) && visited.has(recipeId)) {
      return { calories: 0, protein: 0, carbs: 0, fat: 0, price: 0 };
    }

    if (Number.isFinite(recipeId)) visited.add(recipeId);

    const baseTotal = (recipe?.ingredients || []).reduce((sum: any, item: any) => {
      if (!item?.ingredient) return sum;
      const amount = getIngredientAmount(item);
      const nutritionAmount = calculateNutritionAmount(amount, item.ingredient);
      const purchaseAmount = calculatePurchaseAmount(amount, item.ingredient);
      return {
        calories: sum.calories + (Number(item.ingredient.calories) || 0) * nutritionAmount / 100,
        protein: sum.protein + (Number(item.ingredient.protein) || 0) * nutritionAmount / 100,
        carbs: sum.carbs + (Number(item.ingredient.carbs) || 0) * nutritionAmount / 100,
        fat: sum.fat + (Number(item.ingredient.fat) || 0) * nutritionAmount / 100,
        price: sum.price + (Number(item.ingredient.price) || 0) * purchaseAmount / 100,
      };
    }, { calories: 0, protein: 0, carbs: 0, fat: 0, price: 0 });

    const suggestedTotals = resolveSuggestedRecipes(recipe).reduce((sum: any, linked: any) => {
      const linkedRecipe = recipeById.get(Number(linked.recipeId));
      if (!linkedRecipe) return sum;

      const linkedServings = Math.max(0.1, Number(linked.servings) || 1);
      const linkedRecipeServings = Math.max(0.1, Number(linkedRecipe?.servings) || 1);
      const linkedScale = linkedServings / linkedRecipeServings;
      const linkedTotals = sumRecipeNutritionTotals(linkedRecipe, recipeById, visited);

      return {
        calories: sum.calories + (linkedTotals.calories * linkedScale),
        protein: sum.protein + (linkedTotals.protein * linkedScale),
        carbs: sum.carbs + (linkedTotals.carbs * linkedScale),
        fat: sum.fat + (linkedTotals.fat * linkedScale),
        price: sum.price + (linkedTotals.price * linkedScale),
      };
    }, { calories: 0, protein: 0, carbs: 0, fat: 0, price: 0 });

    if (Number.isFinite(recipeId)) visited.delete(recipeId);

    return {
      calories: baseTotal.calories + suggestedTotals.calories,
      protein: baseTotal.protein + suggestedTotals.protein,
      carbs: baseTotal.carbs + suggestedTotals.carbs,
      fat: baseTotal.fat + suggestedTotals.fat,
      price: baseTotal.price + suggestedTotals.price,
    };
  };

  const getRecipeTotals = (recipe: any) => {
    const recipeById = new Map<number, any>((recipes || []).map((item: any) => [Number(item?.id), item]));
    return sumRecipeNutritionTotals(recipe, recipeById);
  };

  const getPerServingNutrient = (recipe: any, nutrient: "calories" | "protein" | "carbs" | "fat" | "price") => {
    const servings = Math.max(0.1, Number(recipe?.servings) || 1);
    const totals = getRecipeTotals(recipe);

    return (Number(totals?.[nutrient]) || 0) / servings;
  };

  const hasPriceForEveryIngredient = (recipe: any, recipeById: Map<number, any>, visited: Set<number> = new Set<number>()): boolean => {
    const recipeId = Number(recipe?.id);
    if (Number.isFinite(recipeId) && visited.has(recipeId)) return true;
    if (Number.isFinite(recipeId)) visited.add(recipeId);

    const allDirectIngredients = [
      ...(recipe?.ingredients || []),
      ...(recipe?.frequentAddons || []),
    ];
    const directIngredientsArePriced = allDirectIngredients.every((item: any) => Number(item?.ingredient?.price) > 0);
    if (!directIngredientsArePriced) return false;

    const linkedRecipesArePriced = resolveSuggestedRecipes(recipe).every((linked: any) => {
      const linkedRecipe = recipeById.get(Number(linked.recipeId));
      return linkedRecipe ? hasPriceForEveryIngredient(linkedRecipe, recipeById, visited) : false;
    });

    if (Number.isFinite(recipeId)) visited.delete(recipeId);
    return linkedRecipesArePriced;
  };

  const formatLocalizedNumber = (value: number) => {
    if (!Number.isFinite(value)) return "0";
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(".", ",");
  };

  const formatRange = (base: number, withAddons: number, suffix = "") => {
    const baseFormatted = formatLocalizedNumber(base);
    const withAddonsFormatted = formatLocalizedNumber(withAddons);
    return base !== withAddons
      ? `${baseFormatted}-${withAddonsFormatted}${suffix}`
      : `${baseFormatted}${suffix}`;
  };

  const toPercentageOfRecipe = (servings: number, baseServings: number) => {
    if (!Number.isFinite(servings) || !Number.isFinite(baseServings) || baseServings <= 0) return 0;
    return Math.round((servings / baseServings) * 10000) / 100;
  };

  const fromPercentageToServings = (percentage: number, baseServings: number) => {
    if (!Number.isFinite(percentage) || !Number.isFinite(baseServings) || baseServings <= 0) return 0.01;
    return Math.max(0.01, (percentage / 100) * baseServings);
  };


  const sortedAndFilteredRecipes = useMemo(() => {
    const normalizedSearch = normalizeSearchText(search);
    const ingredientSearchTerms = search
      .split(",")
      .map((term) => normalizeSearchText(term))
      .filter(Boolean);
    const isMultiIngredientSearch = ingredientSearchTerms.length > 1;

    const getIngredientSearchScore = (recipe: any) => {
      if (!isMultiIngredientSearch) return 0;
      const ingredientNames = [
        ...(recipe.ingredients || []).map((ri: any) => normalizeSearchText(ri.ingredient?.name)),
        ...(recipe.frequentAddons || []).map((ri: any) => normalizeSearchText(ri.ingredient?.name)),
      ].filter(Boolean);

      return ingredientSearchTerms.filter((term) =>
        ingredientNames.some((name: string) => name.includes(term))
      ).length;
    };

    const recipeById = new Map<number, any>((recipes || []).map((item: any) => [Number(item?.id), item]));

    return (recipes || [])
      .map((recipe) => ({ recipe, ingredientSearchScore: getIngredientSearchScore(recipe) }))
      .filter(({ recipe, ingredientSearchScore }) => {
        const matchesTag = selectedTag === "all" || recipe.tags?.includes(selectedTag);
        if (!matchesTag) return false;

        const matchesFavorite = sortBy !== "favorites" || !!recipe.isFavorite;
        if (!matchesFavorite) return false;

        if (pricedIngredientsOnly && !hasPriceForEveryIngredient(recipe, recipeById)) return false;

        if (isMultiIngredientSearch) return ingredientSearchScore > 0;
        if (!normalizedSearch) return true;

        const matchesName = normalizeSearchText(recipe.name).includes(normalizedSearch);
        const matchesTags = (recipe.tags || []).some((tag: string) => normalizeSearchText(tag).includes(normalizedSearch));
        const matchesIngredients = (recipe.ingredients || []).some((ri: any) =>
          normalizeSearchText(ri.ingredient?.name).includes(normalizedSearch)
        );
        const matchesAddons = (recipe.frequentAddons || []).some((ri: any) =>
          normalizeSearchText(ri.ingredient?.name).includes(normalizedSearch)
        );

        return matchesName || matchesTags || matchesIngredients || matchesAddons;
      })
      .sort((aEntry, bEntry) => {
        const a = aEntry.recipe;
        const b = bEntry.recipe;
        if (isMultiIngredientSearch && aEntry.ingredientSearchScore !== bEntry.ingredientSearchScore) {
          return bEntry.ingredientSearchScore - aEntry.ingredientSearchScore;
        }

        switch (sortBy) {
          case "frequency":
            return (b.stats?.eatCount || 0) - (a.stats?.eatCount || 0);
          case "alphabetical":
            return a.name.localeCompare(b.name);
          case "calories":
            return getPerServingNutrient(b, "calories") - getPerServingNutrient(a, "calories");
          case "pricePerServing":
            return getPerServingNutrient(a, "price") - getPerServingNutrient(b, "price");
          case "totalPrice":
            return getRecipeTotals(a).price - getRecipeTotals(b).price;
          case "value": {
            const getPrice = (r: any) => (r.ingredients || []).reduce((sum: number, ri: any) =>
              sum + (ri.ingredient ? (ri.ingredient.price * calculatePurchaseAmount(getIngredientAmount(ri), ri.ingredient) / 100) : 0), 0) / (r.servings || 1);
            const valA = (a.stats?.calories || 0) / (getPrice(a) || 1);
            const valB = (b.stats?.calories || 0) / (getPrice(b) || 1);
            return valB - valA;
          }
          case "time":
            return (a.prepTime || 0) - (b.prepTime || 0);
          case "protein":
            return getPerServingNutrient(b, "protein") - getPerServingNutrient(a, "protein");
          case "carbs":
            return getPerServingNutrient(b, "carbs") - getPerServingNutrient(a, "carbs");
          case "fat":
            return getPerServingNutrient(b, "fat") - getPerServingNutrient(a, "fat");
          default:
            return 0;
        }
      })
      .map(({ recipe }) => recipe);
  }, [recipes, search, selectedTag, pricedIngredientsOnly, sortBy]);

  const visibleRecipes = sortedAndFilteredRecipes.slice((recipePage - 1) * recipesPerPage, recipePage * recipesPerPage);
  const filteredRecipeTotal = sortedAndFilteredRecipes.length;
  const recipeTotalPages = Math.max(1, Math.ceil(filteredRecipeTotal / recipesPerPage));

  useEffect(() => {
    setRecipePage(1);
  }, [selectedTag, pricedIngredientsOnly, sortBy]);

  useEffect(() => {
    if (recipePage > recipeTotalPages) setRecipePage(recipeTotalPages);
  }, [recipePage, recipeTotalPages]);

  // New state for "Add to Meal Plan"
  const [isAddToPlanOpen, setIsAddToPlanOpen] = useState(false);
  const [recipeToPlan, setRecipeToPlan] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedMealType, setSelectedMealType] = useState("lunch");
  const [selectedPerson, setSelectedPerson] = useState<"A" | "B">("A");
  const [addForBothPeople, setAddForBothPeople] = useState(false);
  const [addToSharedBatches, setAddToSharedBatches] = useState(false);
  const [selectedFrequentAddons, setSelectedFrequentAddons] = useState<Record<"A" | "B", Record<string, number>>>({ A: {}, B: {} });
  const [selectedRecipeServings, setSelectedRecipeServings] = useState(1);
  const [portionMode, setPortionMode] = useState<PortionMode>("SCALED");
  const [batchAllocations, setBatchAllocations] = useState({ A: 50, B: 50 });
  const [selectedSuggestedRecipes, setSelectedSuggestedRecipes] = useState<Record<string, number>>({});
  const [suggestedRecipeSearch, setSuggestedRecipeSearch] = useState("");
  const [openIngredientPopoverIndex, setOpenIngredientPopoverIndex] = useState<number | null>(null);
  const [openFrequentAddonPopoverIndex, setOpenFrequentAddonPopoverIndex] = useState<number | null>(null);
  const personName: Record<"A" | "B", string> = { A: "Tysia", B: "Mati" };
  const getRecipeDefaultServingsForPerson = (recipe: any, person: "A" | "B") => {
    const fallback = Number(recipe?.servings) || 1;
    const value = person === "A" ? Number(recipe?.defaultServingsA) : Number(recipe?.defaultServingsB);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };

  const { data: userSettings } = useQuery<any>({
    queryKey: ["/api/user-settings"],
  });

  const getAddonSelectionKey = (addon: any, index: number) => String(addon?.id ?? `${addon?.ingredientId}-${index}`);
  const getDefaultFrequentAddonsSelection = (recipe: any): Record<"A" | "B", Record<string, number>> => {
    const next: Record<"A" | "B", Record<string, number>> = { A: {}, B: {} };
    (recipe?.frequentAddons || []).forEach((addon: any, index: number) => {
      const key = getAddonSelectionKey(addon, index);
      next.A[key] = Math.max(0, Math.round(Number(addon?.defaultAmountA) || 0));
      const fallbackB = Number(addon?.baseAmount ?? addon?.amount) || 0;
      next.B[key] = Math.max(0, Math.round(Number(addon?.defaultAmountB ?? fallbackB) || 0));
    });
    return next;
  };

  const setAddonAmount = (person: "A" | "B", addonKey: string, amount: number) => {
    const safeAmount = Math.max(0, Math.round(amount));
    setSelectedFrequentAddons((prev) => ({
      ...prev,
      [person]: {
        ...prev[person],
        [addonKey]: safeAmount,
      },
    }));
  };

  const adjustAddonAmount = (person: "A" | "B", addonKey: string, delta: number) => {
    const current = Number(selectedFrequentAddons?.[person]?.[addonKey] || 0);
    setAddonAmount(person, addonKey, current + delta);
  };

  const { data: dayPlan } = useDayPlan(selectedDate);
  const { mutateAsync: addEntry, isPending: isAddingToPlan } = useAddMealEntry();

  const suggestedRecipeOptionsForPlan = useMemo(() => {
    if (!recipeToPlan) return [] as any[];

    const structured = (recipeToPlan?.suggestedRecipes || [])
      .map((item: any) => ({ recipeId: Number(item?.recipeId), servings: Number(item?.servings) || 1 }))
      .filter((item: any) => Number.isFinite(item.recipeId) && item.recipeId > 0);

    const legacy = (recipeToPlan?.suggestedRecipeIds || [])
      .map((id: any) => ({ recipeId: Number(id), servings: 1 }))
      .filter((item: any) => Number.isFinite(item.recipeId) && item.recipeId > 0);

    const entries = structured.length > 0 ? structured : legacy;

    return entries
      .map((entry: any) => (recipes || []).find((candidate: any) => Number(candidate?.id) === Number(entry.recipeId)))
      .filter((entry: any) => !!entry);
  }, [recipeToPlan, recipes]);

  const handleAddToPlan = async () => {
    if (!recipeToPlan) return;

    const isOccupiedA = dayPlan?.entries.some((e: any) => e.mealType === selectedMealType && (e.person || "A") === "A");
    const isOccupiedB = dayPlan?.entries.some((e: any) => e.mealType === selectedMealType && (e.person || "A") === "B");
    const targetPeople = (portionMode === "BATCH_ALLOCATION" || addForBothPeople) ? (["A", "B"] as const) : ([selectedPerson] as const);
    const hasCollision = targetPeople.some((person) => person === "A" ? isOccupiedA : isOccupiedB);
    if (hasCollision) {
      toast({
        variant: "destructive",
        title: "Błąd",
        description: "Ten posiłek jest już zajęty dla wybranej osoby w wybranym dniu.",
      });
      return;
    }

    const getAddonAmountForPerson = (person: "A" | "B", addon: any, index: number) => {
      const addonKey = getAddonSelectionKey(addon, index);
      const directAmount = selectedFrequentAddons?.[person]?.[addonKey];
      if (directAmount !== undefined) return Number(directAmount) || 0;

      if (addForBothPeople) {
        const fallbackAmount = selectedFrequentAddons?.[selectedPerson]?.[addonKey];
        if (fallbackAmount !== undefined) return Number(fallbackAmount) || 0;
      }

      return 0;
    };

    const getSelectedAddonsForPerson = (person: "A" | "B") => (recipeToPlan?.frequentAddons || [])
      .map((addon: any, index: number) => ({
        ...addon,
        amount: getAddonAmountForPerson(person, addon, index),
      }))
      .filter((addon: any) => addon.amount > 0);

    if (portionMode === "BATCH_ALLOCATION" && !validatePercentageAllocations([
      { person: "A", percentage: batchAllocations.A }, { person: "B", percentage: batchAllocations.B },
    ])) {
      toast({ variant: "destructive", title: "Nieprawidłowy podział", description: "Udziały obu osób muszą dawać dokładnie 100%." });
      return;
    }

    try {
      for (const person of targetPeople) {
        const effectiveServings = portionMode === "BATCH_ALLOCATION"
          ? selectedRecipeServings * batchAllocations[person] / 100
          : addForBothPeople
          ? getRecipeDefaultServingsForPerson(recipeToPlan, person)
          : selectedRecipeServings;

        const createdEntry: any = await addEntry({
          date: selectedDate,
          mealType: selectedMealType,
          recipeId: recipeToPlan.id,
          person,
          isEaten: false,
          servings: effectiveServings,
          portionMode,
          allocationPercentage: portionMode === "BATCH_ALLOCATION" ? batchAllocations[person] : null,
          createSharedBatch: portionMode === "BATCH_ALLOCATION" || addToSharedBatches,
          sharedBatchServings: portionMode === "BATCH_ALLOCATION" ? selectedRecipeServings : undefined,
        });

        const selectedAddons = getSelectedAddonsForPerson(person);
        if (selectedAddons.length > 0) {
          const baseIngredients = (recipeToPlan.ingredients || []).map((ri: any) => ({
            ingredientId: ri.ingredientId,
            amount: Number(ri.baseAmount ?? ri.amount) || 0,
            scalingType: ri.scalingType || "LINEAR",
          }));

          const mergedIngredients = [
            ...baseIngredients,
            ...selectedAddons.map((addon: any) => ({
              ingredientId: addon.ingredientId,
              amount: Number(addon.amount) || 0,
              scalingType: "FIXED",
            })),
          ];

          await updateMealEntry.mutateAsync({
            id: createdEntry.id,
            updates: {
              ingredients: mergedIngredients,
              servings: effectiveServings,
            },
          });
        }

        const selectedSuggestions = suggestedRecipeOptionsForPlan
          .filter((entry: any) => Number(selectedSuggestedRecipes[String(entry.id)] || 0) > 0)
          .map((entry: any) => ({
            recipeId: Number(entry.id),
            servings: Number(selectedSuggestedRecipes[String(entry.id)] || 0) || 1,
          }));

        for (const suggestion of selectedSuggestions) {
          await addEntry({
            date: selectedDate,
            mealType: selectedMealType,
            recipeId: suggestion.recipeId,
            person,
            isEaten: false,
            servings: suggestion.servings,
            createSharedBatch: addToSharedBatches,
          });
        }
      }

      setIsAddToPlanOpen(false);
      setRecipeToPlan(null);
      setSelectedFrequentAddons({ A: {}, B: {} });
      setAddForBothPeople(false);
      setAddToSharedBatches(false);
      setSelectedRecipeServings(1);
      setPortionMode("SCALED");
      setBatchAllocations({ A: 50, B: 50 });
      setSelectedSuggestedRecipes({});
      const successMessage = addForBothPeople
        ? "Przepis dodany do planu dla Tysi i Matiego."
        : `Przepis dodany do planu dla ${personName[selectedPerson]}.`;
      const sharedBatchMessage = addToSharedBatches
        ? " Zapisano też partię na później — rozdzielisz ją w zakładce „Wspólne posiłki”."
        : "";
      toast({ title: "Sukces", description: `${successMessage}${sharedBatchMessage}` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Błąd", description: err?.message || "Nie udało się dodać przepisu." });
    }
  };

  const next7Days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(new Date(), i);
    return {
      value: format(d, "yyyy-MM-dd"),
      label: format(d, "EEEE, d MMM", { locale: pl })
    };
  });

  // Form setup
  const form = useForm<RecipeFormData>({
    resolver: zodResolver(createRecipeSchema),
    defaultValues: {
      name: "",
      tags: [] as string[],
      description: "",
      instructions: "",
      comments: "",
      prepTime: 15,
      servings: 1,
      preparationType: "INDIVIDUAL",
      imageUrl: "",
      suggestedRecipes: [],
      ingredients: [{ ingredientId: 0, amount: 100, baseAmount: 100, unit: "g", alternativeAmount: undefined, alternativeUnit: "", scalingType: "LINEAR", scalingFormula: "", stepThresholds: [], mealPrep: false, mealPrepMaxDaysBefore: 1, mealPrepNotes: "" }],
      frequentAddons: [] as { ingredientId: number; amount: number; baseAmount?: number; defaultAmountA?: number; defaultAmountB?: number; unit?: string; alternativeAmount?: number; alternativeUnit?: string; scalingType?: ScalingType; scalingFormula?: string; stepThresholds?: { minServings: number; maxServings?: number | null; amount: number }[] }[],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "ingredients",
  });

  const {
    fields: frequentAddonFields,
    append: appendFrequentAddon,
    remove: removeFrequentAddon,
  } = useFieldArray({
    control: form.control,
    name: "frequentAddons" as const,
  });

  const [editingRecipe, setEditingRecipe] = useState<any>(null);
  const [viewingRecipe, setViewingRecipe] = useState<any>(null);
  const watchedTags = form.watch("tags") || [];
  const tagsTextValue = watchedTags.join(", ");
  const watchedInstructions = form.watch("instructions");
  const watchedRecipeIngredients = form.watch("ingredients");
  const watchedFrequentAddons = form.watch("frequentAddons");
  const instructionLines = useMemo(() => parseInstructionLines(watchedInstructions), [watchedInstructions]);
  const mappableIngredients = useMemo(() => {
    const ingredientDictionary = new Map((availableIngredients || []).map((ingredient: any) => [Number(ingredient.id), ingredient]));

    const recipeIngredientOptions = (watchedRecipeIngredients || [])
      .map((recipeIngredient: any) => {
        const ingredientId = Number(recipeIngredient?.ingredientId);
        const ingredient = ingredientDictionary.get(ingredientId);
        if (!ingredient) return null;

        const amount = Number(recipeIngredient?.baseAmount ?? recipeIngredient?.amount ?? 0);
        const unit = recipeIngredient?.unit || ingredient.unit || "g";

        return {
          id: ingredientId,
          source: "ingredient" as const,
          key: `ingredient-${ingredientId}`,
          label: `${ingredient.name}-${amount}${unit}`,
          name: ingredient.name,
        };
      })
      .filter(Boolean);

    const frequentAddonOptions = (watchedFrequentAddons || [])
      .map((addon: any) => {
        const ingredientId = Number(addon?.ingredientId);
        const ingredient = ingredientDictionary.get(ingredientId);
        if (!ingredient) return null;

        const amount = Number(addon?.baseAmount ?? addon?.amount ?? 0);
        const unit = addon?.unit || ingredient.unit || "g";

        return {
          id: ingredientId,
          source: "frequentAddon" as const,
          key: `frequentAddon-${ingredientId}`,
          label: `[Dodatek] ${ingredient.name}-${amount}${unit}`,
          name: ingredient.name,
        };
      })
      .filter(Boolean);

    return [...recipeIngredientOptions, ...frequentAddonOptions] as { id: number; source: "ingredient" | "frequentAddon"; key: string; label: string; name: string }[];
  }, [availableIngredients, watchedRecipeIngredients, watchedFrequentAddons]);



  const groupedInstructionLinks = useMemo(() => {
    const grouped = new Map<string, InstructionLink[]>();
    instructionLinks.forEach((link) => {
      const multiplier = typeof link.multiplier === "number" ? link.multiplier : 1;
      const key = `${link.stepIndex}__${link.text.trim().toLowerCase()}__${multiplier}__${link.ingredientSource || "ingredient"}`;
      const existing = grouped.get(key) || [];
      grouped.set(key, [...existing, link]);
    });
    return Array.from(grouped.values());
  }, [instructionLinks]);

  const normalizeTagValue = (value: string) => value.trim();

  const setTagsFromText = (value: string) => {
    const tags = value
      .split(",")
      .map(normalizeTagValue)
      .filter((tag) => tag !== "");
    form.setValue("tags", Array.from(new Set(tags)), { shouldDirty: true });
  };

  const addExistingTag = (value: string) => {
    if (value === "__none__") return;
    const normalized = normalizeTagValue(value);
    if (!normalized) return;

    const uniqueTags = Array.from(new Set([...(form.getValues("tags") || []), normalized]));
    form.setValue("tags", uniqueTags, { shouldDirty: true });
  };

  const getRecipeCaloriesPerServing = (recipe: any) => {
    const servings = Number(recipe?.servings) || 1;
    const sumByNutrition = (items: any[]) => items.reduce((sum, item) => {
      if (!item?.ingredient) return sum;
      const amount = getIngredientAmount(item);
      const nutritionAmount = calculateNutritionAmount(amount, item.ingredient);
      const purchaseAmount = calculatePurchaseAmount(amount, item.ingredient);
      return {
        calories: sum.calories + (Number(item.ingredient.calories) || 0) * nutritionAmount / 100,
        protein: sum.protein + (Number(item.ingredient.protein) || 0) * nutritionAmount / 100,
        carbs: sum.carbs + (Number(item.ingredient.carbs) || 0) * nutritionAmount / 100,
        fat: sum.fat + (Number(item.ingredient.fat) || 0) * nutritionAmount / 100,
        price: sum.price + (Number(item.ingredient.price) || 0) * purchaseAmount / 100,
      };
    }, {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      price: 0,
    });

    const recipeById = new Map<number, any>((recipes || []).map((item: any) => [Number(item?.id), item]));
    const baseTotal = sumRecipeNutritionTotals(recipe, recipeById);
    const addonsTotal = sumByNutrition(recipe?.frequentAddons || []);

    const perServing = {
      calories: {
        base: Math.round(baseTotal.calories / servings),
        withAddons: Math.round((baseTotal.calories / servings) + addonsTotal.calories),
      },
      protein: {
        base: Math.round(baseTotal.protein / servings),
        withAddons: Math.round((baseTotal.protein / servings) + addonsTotal.protein),
      },
      carbs: {
        base: Math.round(baseTotal.carbs / servings),
        withAddons: Math.round((baseTotal.carbs / servings) + addonsTotal.carbs),
      },
      fat: {
        base: Math.round(baseTotal.fat / servings),
        withAddons: Math.round((baseTotal.fat / servings) + addonsTotal.fat),
      },
      price: {
        base: baseTotal.price / servings,
        withAddons: (baseTotal.price / servings) + addonsTotal.price,
      },
    };

    return {
      perServing,
      totalPrice: {
        base: baseTotal.price,
        withAddons: baseTotal.price + addonsTotal.price,
      },
    };
  };

  const [isEditingIngredients, setIsEditingIngredients] = useState(false);
  const [editingMealIngredients, setEditingMealIngredients] = useState<any[]>([]);
  const updateMealEntry = useUpdateMealEntry();

  const openEdit = async (recipe: any) => {
    if (!recipe?.instructionSteps && !recipe?.description && recipe?.id) {
      recipe = await fetchRecipeDetails(Number(recipe.id));
    }
    setEditingRecipe(recipe);
    form.reset({
      name: recipe.name,
      tags: recipe.tags || [],
      description: recipe.description || "",
      instructions: recipe.instructions || "",
      comments: recipe.comments || "",
      instructionSteps: recipe.instructionSteps || [],
      prepTime: recipe.prepTime,
      servings: recipe.servings || 1,
      preparationType: recipe.preparationType === "BATCH" ? "BATCH" : "INDIVIDUAL",
      imageUrl: recipe.imageUrl || "",
      suggestedRecipes: ((recipe.suggestedRecipes || []).length > 0 ? recipe.suggestedRecipes : (recipe.suggestedRecipeIds || []).map((id: any) => ({ recipeId: Number(id), servings: 1 })))
        .map((item: any) => ({ recipeId: Number(item.recipeId), servings: Number(item.servings) || 1 }))
        .filter((item: any) => Number.isFinite(item.recipeId) && item.recipeId > 0),
      ingredients: recipe.ingredients.map((ri: any) => ({
        ingredientId: ri.ingredientId,
        groupName: ri.groupName || "",
        amount: Number(ri.baseAmount ?? ri.amount ?? 0),
        baseAmount: Number(ri.baseAmount ?? ri.amount ?? 0),
        unit: ri.unit || ri.ingredient?.unit || "g",
        alternativeAmount: Number(ri.alternativeAmount) || undefined,
        alternativeUnit: ri.alternativeUnit || "",
        scalingType: ri.scalingType || "LINEAR",
        scalingFormula: ri.scalingFormula || "",
        stepThresholds: ri.stepThresholds || [],
        mealPrep: !!ri.mealPrep,
        mealPrepMaxDaysBefore: Number(ri.mealPrepMaxDaysBefore) || 1,
        mealPrepNotes: ri.mealPrepNotes || "",
      })),
      frequentAddons: (recipe.frequentAddons || []).map((addon: any) => ({
        ingredientId: addon.ingredientId,
        amount: Number(addon.baseAmount ?? addon.amount ?? 0),
        baseAmount: Number(addon.baseAmount ?? addon.amount ?? 0),
        defaultAmountA: Number(addon.defaultAmountA) || 0,
        defaultAmountB: Number(addon.defaultAmountB ?? addon.baseAmount ?? addon.amount) || 0,
        unit: addon.unit || addon.ingredient?.unit || "g",
        alternativeAmount: Number(addon.alternativeAmount) || undefined,
        alternativeUnit: addon.alternativeUnit || "",
        scalingType: addon.scalingType || "LINEAR",
        scalingFormula: addon.scalingFormula || "",
        stepThresholds: addon.stepThresholds || [],
      })),
    });
    const initialLinks: InstructionLink[] = (recipe.instructionSteps || []).flatMap((step: any, stepIndex: number) =>
      (step?.segments || [])
        .filter((segment: any) => segment.type === "ingredient")
        .flatMap((segment: any) => {
          const ingredientIds = Array.isArray(segment.ingredientIds) && segment.ingredientIds.length > 0
            ? segment.ingredientIds
            : [segment.ingredientId];

          return ingredientIds.map((ingredientId: number) => ({
            stepIndex,
            text: segment.text,
            ingredientId: Number(ingredientId),
            ingredientSource: segment.ingredientSource === "frequentAddon" ? "frequentAddon" : "ingredient",
            multiplier: typeof segment.multiplier === "number" ? segment.multiplier : 1,
          }));
        })
    );
    setInstructionLinks(initialLinks);
    setSuggestedRecipeSearch("");
    setIsOpen(true);
  };

  const closeDialog = () => {
    setIsOpen(false);
    setEditingRecipe(null);
    setOpenIngredientPopoverIndex(null);
    setOpenFrequentAddonPopoverIndex(null);
    form.reset({
      name: "",
      tags: [],
      description: "",
      instructions: "",
      comments: "",
      instructionSteps: [],
      prepTime: 15,
      servings: 1,
      preparationType: "INDIVIDUAL",
      imageUrl: "",
      suggestedRecipes: [],
      ingredients: [{ ingredientId: 0, amount: 100, baseAmount: 100, unit: "g", alternativeAmount: undefined, alternativeUnit: "", scalingType: "LINEAR", scalingFormula: "", stepThresholds: [], mealPrep: false, mealPrepMaxDaysBefore: 1, mealPrepNotes: "" }],
      frequentAddons: [],
    });
    setInstructionLinks([]);
    setSuggestedRecipeSearch("");
    setNewInstructionLink({ stepIndex: 0, text: "", ingredientId: 0, ingredientSource: "ingredient", multiplier: 1 });
  };

  const { mutate: createRecipeMutation, isPending: isCreating } = useCreateRecipe();
  const { mutate: updateRecipeMutation, isPending: isUpdating } = useUpdateRecipe();

  const toggleRecipeFavorite = async (recipe: any) => {
    if (!recipe?.instructionSteps && !recipe?.description && recipe?.id) {
      recipe = await fetchRecipeDetails(Number(recipe.id));
    }
    const payload = {
      name: recipe.name,
      tags: recipe.tags || [],
      description: recipe.description || "",
      instructions: recipe.instructions || "",
      comments: recipe.comments || "",
      instructionSteps: recipe.instructionSteps || [],
      prepTime: recipe.prepTime || 0,
      imageUrl: recipe.imageUrl || "",
      servings: Number(recipe.servings) || 1,
      preparationType: recipe.preparationType === "BATCH" ? "BATCH" : "INDIVIDUAL",
      suggestedRecipes: ((recipe.suggestedRecipes || []).length > 0 ? recipe.suggestedRecipes : (recipe.suggestedRecipeIds || []).map((id: any) => ({ recipeId: Number(id), servings: 1 })))
        .map((item: any) => ({ recipeId: Number(item.recipeId), servings: Number(item.servings) || 1 }))
        .filter((item: any) => Number.isFinite(item.recipeId) && item.recipeId > 0),
      isFavorite: !recipe.isFavorite,
      ingredients: (recipe.ingredients || []).map((ri: any) => ({
        ingredientId: ri.ingredientId,
        groupName: ri.groupName || undefined,
        amount: Number(ri.baseAmount ?? ri.amount ?? 0),
        baseAmount: Number(ri.baseAmount ?? ri.amount ?? 0),
        unit: ri.unit || ri.ingredient?.unit || "g",
        alternativeAmount: Number(ri.alternativeAmount) || undefined,
        alternativeUnit: ri.alternativeUnit || undefined,
        scalingType: (ri.scalingType || "LINEAR") as ScalingType,
        scalingFormula: ri.scalingType === "FORMULA" ? ri.scalingFormula : undefined,
        stepThresholds: ri.scalingType === "STEP" ? (ri.stepThresholds || []) : undefined,
        mealPrep: !!ri.mealPrep,
        mealPrepMaxDaysBefore: Number(ri.mealPrepMaxDaysBefore) || 1,
        mealPrepNotes: ri.mealPrepNotes || undefined,
      })),
      frequentAddons: (recipe.frequentAddons || []).map((addon: any) => ({
        ingredientId: addon.ingredientId,
        amount: Number(addon.baseAmount ?? addon.amount) || 0,
        baseAmount: Number(addon.baseAmount ?? addon.amount) || 0,
        defaultAmountA: Number(addon.defaultAmountA) || 0,
        defaultAmountB: Number(addon.defaultAmountB ?? addon.baseAmount ?? addon.amount) || 0,
        unit: addon.unit || addon.ingredient?.unit || "g",
        alternativeAmount: Number(addon.alternativeAmount) || undefined,
        alternativeUnit: addon.alternativeUnit || undefined,
        scalingType: (addon.scalingType || "LINEAR") as ScalingType,
        scalingFormula: addon.scalingType === "FORMULA" ? addon.scalingFormula : undefined,
        stepThresholds: addon.scalingType === "STEP" ? (addon.stepThresholds || []) : undefined,
      })),
      prepTasks: (recipe.prepTasks || []).map((task: any) => ({
        title: task.title,
        ingredientId: task.ingredientId ? Number(task.ingredientId) : null,
        ingredientSource: task.ingredientSource || "ingredient",
        maxDaysBefore: Number(task.maxDaysBefore) || 1,
        groupKey: task.groupKey || undefined,
        notes: task.notes || undefined,
      })),
    };

    updateRecipeMutation({ id: recipe.id, data: payload }, {
      onSuccess: () => {
        toast({ title: "Zapisano", description: payload.isFavorite ? "Dodano do ulubionych" : "Usunięto z ulubionych" });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Błąd", description: err.message });
      },
    });
  };

  const onSubmit = (data: any) => {
    const instructionSteps = buildInstructionSteps(data.instructions, instructionLinks);
    const normalizedData = {
      ...data,
      comments: data.comments?.trim() || undefined,
      instructionSteps,
      suggestedRecipes: (data.suggestedRecipes || [])
        .map((item: any) => ({
          recipeId: Number(item.recipeId),
          servings: Math.max(0.1, Number(item.servings) || 1),
        }))
        .filter((item: any) => Number.isFinite(item.recipeId) && item.recipeId > 0),
      suggestedRecipeIds: (data.suggestedRecipes || []).map((item: any) => Number(item.recipeId)).filter((id: number) => Number.isFinite(id) && id > 0),
      ingredients: (data.ingredients || []).map((ingredient: any) => ({
        ...ingredient,
        groupName: ingredient.groupName?.trim() || undefined,
        baseAmount: Number(ingredient.baseAmount ?? ingredient.amount ?? 0),
        amount: Number(ingredient.baseAmount ?? ingredient.amount ?? 0),
        unit: ingredient.unit || "g",
        alternativeAmount: Number(ingredient.alternativeAmount) > 0 ? Number(ingredient.alternativeAmount) : undefined,
        alternativeUnit: ingredient.alternativeUnit?.trim() ? ingredient.alternativeUnit.trim() : undefined,
        scalingType: (ingredient.scalingType || "LINEAR") as ScalingType,
        scalingFormula: ingredient.scalingType === "FORMULA" ? ingredient.scalingFormula : undefined,
        stepThresholds: ingredient.scalingType === "STEP" ? (ingredient.stepThresholds || []) : undefined,
        mealPrep: !!ingredient.mealPrep,
        mealPrepMaxDaysBefore: Math.max(1, Math.round(Number(ingredient.mealPrepMaxDaysBefore) || 1)),
        mealPrepNotes: ingredient.mealPrepNotes?.trim() || undefined,
      })),
      frequentAddons: (data.frequentAddons || []).map((addon: any) => ({
        ...addon,
        baseAmount: Number(addon.baseAmount ?? addon.amount ?? 0),
        amount: Number(addon.baseAmount ?? addon.amount ?? 0),
        defaultAmountA: Number(addon.defaultAmountA) || 0,
        defaultAmountB: Number(addon.defaultAmountB) || 0,
        unit: addon.unit || "g",
        alternativeAmount: Number(addon.alternativeAmount) > 0 ? Number(addon.alternativeAmount) : undefined,
        alternativeUnit: addon.alternativeUnit?.trim() ? addon.alternativeUnit.trim() : undefined,
        scalingType: (addon.scalingType || "LINEAR") as ScalingType,
        scalingFormula: addon.scalingType === "FORMULA" ? addon.scalingFormula : undefined,
        stepThresholds: addon.scalingType === "STEP" ? (addon.stepThresholds || []) : undefined,
      })),
    };

    if (editingRecipe) {
      const submitRecipeUpdate = (resetEditedMealIngredients = false) => {
        updateRecipeMutation({
          id: editingRecipe.id,
          data: {
            ...normalizedData,
            resetEditedMealIngredients,
          },
        }, {
          onSuccess: () => {
            closeDialog();
            toast({ title: "Sukces", description: resetEditedMealIngredients ? "Cofnięto edycje składników w posiłkach i zaktualizowano wspólny przepis." : "Przepis został zaktualizowany" });
          },
          onError: (err: any) => {
            if (err?.code === "EDITED_MEAL_INGREDIENTS_BLOCK_RECIPE_UPDATE") {
              const editedCount = Array.isArray(err.editedMealEntries) ? err.editedMealEntries.length : 0;
              const shouldReset = window.confirm(
                `Nie można teraz edytować wspólnego przepisu, bo składniki ${editedCount === 1 ? "jednego zaplanowanego posiłku zostały zedytowane" : "któregoś z zaplanowanych posiłków zostały zedytowane"}.\n\nCzy cofnąć tamtą edycję składników w posiłkach, żeby móc zedytować wspólny przepis?`
              );
              if (shouldReset) {
                submitRecipeUpdate(true);
              }
              return;
            }

            toast({ variant: "destructive", title: "Błąd", description: err.message });
          },
        });
      };

      submitRecipeUpdate();
    } else {
      createRecipeMutation(normalizedData, {
        onSuccess: () => {
          closeDialog();
          toast({ title: "Success", description: "Recipe created successfully" });
        },
        onError: (err: any) => {
          toast({ variant: "destructive", title: "Error", description: err.message });
        },
      });
    }
  };

  if (isLoading) return <Layout><LoadingSpinner /></Layout>;

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <p className="text-sm text-muted-foreground">Dodane przepisy: {recipeTotal}</p>
        
        <Dialog
          open={isOpen}
          onOpenChange={(open) => {
            if (open) {
              setIsOpen(true);
              return;
            }

            if (!editingRecipe && form.formState.isDirty) {
              const shouldDiscard = window.confirm("Masz niezapisane zmiany. Czy chcesz porzucić dodawanie przepisu?");
              if (!shouldDiscard) return;
            }

            closeDialog();
          }}
        >
          <DialogTrigger asChild>
            <Button data-testid="button-create-recipe" className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 rounded-xl h-12 px-6 shadow-lg shadow-primary/20" onClick={() => { if (!editingRecipe) closeDialog(); setIsOpen(true); }}>
              <Plus className="w-5 h-5" /> Stwórz przepis
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[calc(100vw-1rem)] max-w-[96vw] xl:max-w-[1280px] max-h-[90vh] overflow-y-auto overflow-x-hidden px-2 py-3 sm:max-h-[90vh] sm:px-6 sm:py-6 max-sm:h-[100dvh] max-sm:w-screen max-sm:max-w-none max-sm:rounded-none">
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-2xl font-display">{editingRecipe ? "Edytuj przepis" : "Nowy przepis"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 sm:space-y-6 mt-2 sm:mt-4 text-xs sm:text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="col-span-2">
                  <label className="text-sm font-medium mb-1 block">Nazwa przepisu</label>
                  <Input {...form.register("name")} placeholder="np. Tosty z awokado" />
                  {form.formState.errors.name && <p className="text-red-500 text-xs mt-1">{form.formState.errors.name.message}</p>}
                </div>

                <div className="col-span-2">
                  <label className="text-sm font-medium mb-1 block">Tagi</label>
                  <div className="space-y-2">
                    {allTags.length > 0 && (
                      <Select value="__none__" onValueChange={addExistingTag}>
                        <SelectTrigger className="rounded-md">
                          <SelectValue placeholder="Wybierz istniejący tag" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Wybierz tag</SelectItem>
                          {allTags.map((tag) => (
                            <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Input
                      placeholder="Wpisz nowy tag lub listę tagów, np. szybkie, śniadanie, obiad"
                      value={tagsTextValue}
                      onChange={(e) => setTagsFromText(e.target.value)}
                    />
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-1 block">Czas przygotowania (min)</label>
                  <Input type="number" {...form.register("prepTime")} />
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-1 block">Bazowa liczba porcji</label>
                  <Input type="number" step="0.1" {...form.register("servings")} min="0.1" />
                  {form.formState.errors.servings && <p className="text-red-500 text-xs mt-1">{form.formState.errors.servings.message}</p>}
                </div>

                <div className="col-span-2 space-y-2">
                  <label className="text-sm font-medium block">Sposób przygotowania</label>
                  <RadioGroup
                    value={form.watch("preparationType")}
                    onValueChange={(value) => form.setValue("preparationType", value as "INDIVIDUAL" | "BATCH", { shouldDirty: true })}
                    className="grid gap-2 sm:grid-cols-2"
                  >
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
                      <RadioGroupItem value="INDIVIDUAL" className="mt-0.5" />
                      <span><span className="block font-medium">Porcje przygotowywane osobno</span><span className="block text-muted-foreground">Każda porcja jest przygotowywana osobno.</span></span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
                      <RadioGroupItem value="BATCH" className="mt-0.5" />
                      <span><span className="block font-medium">Przygotowuję całość i dzielę na porcje</span><span className="block text-muted-foreground">Przygotowujesz cały przepis, a potem dzielisz gotowe danie.</span></span>
                    </label>
                  </RadioGroup>
                  {form.watch("preparationType") === "BATCH" && (
                    <p className="rounded-lg bg-muted px-3 py-2 text-muted-foreground">Ten przepis będzie przygotowywany jako jeden batch. Sposób podziału ustawisz podczas dodawania go do mealplanu.</p>
                  )}
                </div>

                <div className="col-span-2">
                  <label className="text-sm font-medium mb-1 block">Zdjęcie przepisu</label>
                  <div className="flex gap-2 items-center">
                    <Input {...form.register("imageUrl")} placeholder="URL obrazka (opcjonalnie)" className="flex-1" />
                    <div className="relative">
                      <Input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        id="recipe-image-upload"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const formData = new FormData();
                            formData.append("image", file);
                            try {
                              const res = await fetch("/api/upload", {
                                method: "POST",
                                body: formData,
                              });
                              if (res.ok) {
                                const data = await res.json();
                                form.setValue("imageUrl", data.imageUrl);
                                toast({ title: "Sukces", description: "Zdjęcie zostało przesłane." });
                              }
                            } catch (err) {
                              toast({ variant: "destructive", title: "Błąd", description: "Nie udało się przesłać zdjęcia." });
                            }
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => document.getElementById("recipe-image-upload")?.click()}
                      >
                        Wgraj plik
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium">Składniki</label>
                </div>
                <div className="space-y-3 mb-3">
                  {fields.map((field, index) => {
                    const selectedId = Number(form.watch(`ingredients.${index}.ingredientId`));
                    return (
                      <div key={field.id} className="bg-secondary/20 p-2 rounded-xl border border-border/50">
                        <div className="mb-2">
                          <Input
                            placeholder="Nazwa bloku, np. Do dekoracji (opcjonalnie)"
                            className="h-8 border-dashed bg-background text-xs font-medium sm:h-9"
                            {...form.register(`ingredients.${index}.groupName` as const)}
                          />
                        </div>
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
                          <div className="flex-1">
                            <Popover
                              open={openIngredientPopoverIndex === index}
                              onOpenChange={(open) => setOpenIngredientPopoverIndex(open ? index : null)}
                            >
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  className={cn(
                                    "w-full justify-between h-8 rounded-lg bg-background font-normal text-xs sm:h-9 sm:text-sm",
                                    !selectedId && "text-muted-foreground"
                                  )}
                                >
                                  {selectedId
                                    ? (availableIngredients || []).find((i: any) => i.id === selectedId)?.name
                                    : "Wybierz składnik"}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[300px] p-0 bg-white border border-border shadow-md" align="start">
                                <Command>
                                  <CommandInput placeholder="Szukaj składnika..." onKeyDown={(event) => event.stopPropagation()} />
                                  <CommandList>
                                    <CommandEmpty>Nie znaleziono składnika.</CommandEmpty>
                                    <CommandGroup>
                                      {(availableIngredients || []).map((i: any) => (
                                        <CommandItem
                                          key={i.id}
                                          value={i.name}
                                          onSelect={() => {
                                            form.setValue(`ingredients.${index}.ingredientId`, i.id);
                                            if (!form.getValues(`ingredients.${index}.unit` as const)) {
                                              form.setValue(`ingredients.${index}.unit` as const, i.unit || "g");
                                            }
                                            setOpenIngredientPopoverIndex(null);
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4",
                                              selectedId === i.id ? "opacity-100" : "opacity-0"
                                            )}
                                          />
                                          <div className="flex flex-col">
                                            <span>{i.name}</span>
                                            <span className="text-[10px] text-muted-foreground">
                                              {i.calories} kcal {i.category ? `[${i.category}]` : ""}
                                            </span>
                                          </div>
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:flex lg:flex-1 lg:gap-2">
                            <div className="col-span-1 lg:w-24">
                              <Input type="text" inputMode="decimal" placeholder="Bazowa" className="h-8 rounded-lg px-2 text-xs sm:h-9 sm:px-3 sm:text-sm" {...form.register(`ingredients.${index}.baseAmount` as const)} />
                            </div>
                            <div className="col-span-1 lg:w-24">
                              <Input placeholder="Jedn." className="h-8 rounded-lg px-2 text-xs sm:h-9 sm:px-3 sm:text-sm" {...form.register(`ingredients.${index}.unit` as const)} />
                            </div>
                            <div className="col-span-1 lg:w-24">
                              <Input type="number" step="0.01" placeholder="np. 1" className="h-8 rounded-lg px-2 text-xs sm:h-9 sm:px-3 sm:text-sm" {...form.register(`ingredients.${index}.alternativeAmount` as const)} />
                            </div>
                            <div className="col-span-1 lg:w-32">
                              <Input placeholder="np. sztuka" className="h-8 rounded-lg px-2 text-xs sm:h-9 sm:px-3 sm:text-sm" {...form.register(`ingredients.${index}.alternativeUnit` as const)} />
                            </div>
                          </div>
                          <div className="w-full lg:w-36">
                            <Select
                              value={form.watch(`ingredients.${index}.scalingType`) || "LINEAR"}
                              onValueChange={(value) => form.setValue(`ingredients.${index}.scalingType`, value as any)}
                            >
                              <SelectTrigger className="h-8 rounded-lg text-xs sm:h-9 sm:text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="LINEAR">LINEAR</SelectItem>
                                <SelectItem value="FIXED">FIXED</SelectItem>
                                <SelectItem value="STEP">STEP</SelectItem>
                                <SelectItem value="FORMULA">FORMULA</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg hover:bg-red-50 hover:text-red-500 self-end sm:self-auto" onClick={() => remove(index)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="mt-2 rounded-lg border border-primary/10 bg-primary/5 p-2">
                          <label className="flex items-center gap-2 text-xs font-medium">
                            <Checkbox
                              checked={!!form.watch(`ingredients.${index}.mealPrep`)}
                              onCheckedChange={(checked) => form.setValue(`ingredients.${index}.mealPrep` as const, checked === true, { shouldDirty: true })}
                            />
                            Przygotuj ten składnik w Meal Prep
                          </label>
                          {form.watch(`ingredients.${index}.mealPrep`) && (
                            <div className="mt-2 grid gap-2 sm:grid-cols-[140px_1fr]">
                              <div>
                                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Dni wcześniej</label>
                                <Input type="number" min="1" max="30" step="1" className="h-8 text-xs" {...form.register(`ingredients.${index}.mealPrepMaxDaysBefore` as const)} />
                              </div>
                              <div>
                                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Notatka</label>
                                <Input placeholder="np. ugotuj i ostudź" className="h-8 text-xs" {...form.register(`ingredients.${index}.mealPrepNotes` as const)} />
                              </div>
                            </div>
                          )}
                        </div>

                        {(() => {
                          const selectedIngredient = (availableIngredients || []).find((i: any) => i.id === selectedId);
                          const unitWeight = Number(selectedIngredient?.unitWeight) || 0;
                          const baseAmount = Number(form.watch(`ingredients.${index}.baseAmount`)) || 0;
                          const alternativeAmount = Number(form.watch(`ingredients.${index}.alternativeAmount`)) || 0;
                          const alternativeUnit = form.watch(`ingredients.${index}.alternativeUnit`) || "";
                          if (alternativeAmount <= 0 || !alternativeUnit.trim()) {
                            if (unitWeight <= 0) return null;
                            return (
                              <p className="mt-2 text-[10px] text-muted-foreground sm:text-xs">
                                Wielkość sztuki: 1 szt. ≈ {formatLocalizedNumber(unitWeight)}g
                              </p>
                            );
                          }
                          return (
                            <p className="mt-2 text-[10px] text-muted-foreground sm:text-xs">
                              Podgląd: {formatLocalizedNumber(baseAmount)}g = {formatLocalizedNumber(alternativeAmount)} {alternativeUnit}
                              {unitWeight > 0 ? ` · baza składnika: 1 szt. ≈ ${formatLocalizedNumber(unitWeight)}g` : ""}
                            </p>
                          );
                        })()}
                        {form.watch(`ingredients.${index}.scalingType`) === "FORMULA" && (
                          <div className="mt-2">
                            <Input placeholder="np. 100 + (scaleFactor - 1) * 50" className="h-9 rounded-lg" {...form.register(`ingredients.${index}.scalingFormula` as const)} />
                          </div>
                        )}
                        {form.watch(`ingredients.${index}.scalingType`) === "STEP" && (
                          <div className="mt-2 space-y-2">
                            {(form.watch(`ingredients.${index}.stepThresholds`) || []).map((_: any, thresholdIndex: number) => (
                              <div key={thresholdIndex} className="grid grid-cols-4 gap-2 items-center">
                                <Input type="number" step="0.5" min="0" inputMode="decimal" placeholder="Od porcji" {...form.register(`ingredients.${index}.stepThresholds.${thresholdIndex}.minServings` as const)} />
                                <Input type="number" step="0.5" min="0" inputMode="decimal" placeholder="Do porcji" {...form.register(`ingredients.${index}.stepThresholds.${thresholdIndex}.maxServings` as const)} />
                                <Input type="text" inputMode="decimal" placeholder="Ilość" {...form.register(`ingredients.${index}.stepThresholds.${thresholdIndex}.amount` as const)} />
                                <Button type="button" variant="ghost" onClick={() => {
                                  const current = form.getValues(`ingredients.${index}.stepThresholds`) || [];
                                  form.setValue(`ingredients.${index}.stepThresholds`, current.filter((_: any, i: number) => i !== thresholdIndex));
                                }}>Usuń</Button>
                              </div>
                            ))}
                            <Button type="button" variant="outline" onClick={() => {
                              const current = form.getValues(`ingredients.${index}.stepThresholds`) || [];
                              form.setValue(`ingredients.${index}.stepThresholds`, [...current, { minServings: 1, maxServings: null, amount: Number(form.getValues(`ingredients.${index}.baseAmount`) || 0) }]);
                            }}>+ Próg</Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <Button type="button" variant="outline" size="sm" className="rounded-lg border-dashed w-full py-3 sm:py-5 border-2 hover:bg-primary/5 hover:border-primary/50 transition-all text-xs sm:text-sm" onClick={() => append({ ingredientId: 0, amount: 100, baseAmount: 100, unit: "g", alternativeAmount: undefined, alternativeUnit: "", scalingType: "LINEAR", scalingFormula: "", stepThresholds: [], mealPrep: false, mealPrepMaxDaysBefore: 1, mealPrepNotes: "" })}>
                  + Dodaj kolejny składnik
                </Button>
                <Button type="button" variant="ghost" size="sm" className="mt-2 w-full rounded-lg text-xs sm:text-sm" onClick={() => append({ ingredientId: 0, groupName: "Nowy blok", amount: 100, baseAmount: 100, unit: "g", alternativeAmount: undefined, alternativeUnit: "", scalingType: "LINEAR", scalingFormula: "", stepThresholds: [], mealPrep: false, mealPrepMaxDaysBefore: 1, mealPrepNotes: "" })}>
                  + Dodaj nowy blok składników
                </Button>
                {form.formState.errors.ingredients && <p className="text-red-500 text-xs mt-1">{form.formState.errors.ingredients.message}</p>}
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium">Najczęste dodatki (opcjonalnie)</label>
                </div>
                <div className="overflow-x-auto pb-1">
                  <div className="mb-1 hidden lg:min-w-[1040px] lg:flex lg:items-end lg:gap-2 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <div className="flex-1">Dodatek</div>
                    <div className="grid grid-cols-6 gap-2 flex-1">
                      <div>Bazowa (g)</div>
                      <div>Tysia</div>
                      <div>Mati</div>
                      <div>Jedn.</div>
                      <div>Zamiennik ilość</div>
                      <div>Zamiennik jedn.</div>
                    </div>
                    <div className="w-36">Skalowanie</div>
                    <div className="w-8" />
                  </div>
                  <div className="mb-3 space-y-3 lg:min-w-[1040px]">
                  {frequentAddonFields.map((field, index) => {
                    const selectedId = Number(form.watch(`frequentAddons.${index}.ingredientId`));
                    return (
                      <div key={field.id} className="bg-emerald-50/60 p-2 rounded-xl border border-emerald-100">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
                          <div className="flex-1">
                            <Popover
                              open={openFrequentAddonPopoverIndex === index}
                              onOpenChange={(open) => setOpenFrequentAddonPopoverIndex(open ? index : null)}
                            >
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  className={cn(
                                    "w-full justify-between h-8 rounded-lg bg-background font-normal text-xs sm:h-9 sm:text-sm",
                                    !selectedId && "text-muted-foreground"
                                  )}
                                >
                                  {selectedId
                                    ? (availableIngredients || []).find((i: any) => i.id === selectedId)?.name
                                    : "Wybierz dodatek"}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[300px] p-0 bg-white border border-border shadow-md" align="start">
                                <Command>
                                  <CommandInput placeholder="Szukaj składnika..." onKeyDown={(event) => event.stopPropagation()} />
                                  <CommandList>
                                    <CommandEmpty>Nie znaleziono składnika.</CommandEmpty>
                                    <CommandGroup>
                                      {(availableIngredients || []).map((i: any) => (
                                        <CommandItem
                                          key={i.id}
                                          value={i.name}
                                          onSelect={() => {
                                            form.setValue(`frequentAddons.${index}.ingredientId`, i.id);
                                            if (!form.getValues(`frequentAddons.${index}.unit` as const)) {
                                              form.setValue(`frequentAddons.${index}.unit` as const, i.unit || "g");
                                            }
                                            setOpenFrequentAddonPopoverIndex(null);
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4",
                                              selectedId === i.id ? "opacity-100" : "opacity-0"
                                            )}
                                          />
                                          <div className="flex flex-col">
                                            <span>{i.name}</span>
                                            <span className="text-[10px] text-muted-foreground">{i.calories} kcal</span>
                                          </div>
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="grid grid-cols-2 gap-2 md:grid-cols-6 lg:flex lg:flex-1 lg:gap-2">
                            <div className="col-span-1 lg:w-24">
                              <Input type="text" inputMode="decimal" placeholder="Bazowa" className="h-8 rounded-lg px-2 text-xs sm:h-9 sm:px-3 sm:text-sm" {...form.register(`frequentAddons.${index}.baseAmount` as const)} />
                            </div>
                            <div className="col-span-1 lg:w-24">
                              <Input type="text" inputMode="decimal" placeholder="Tysia" className="h-8 rounded-lg px-2 text-xs sm:h-9 sm:px-3 sm:text-sm" {...form.register(`frequentAddons.${index}.defaultAmountA` as const)} />
                            </div>
                            <div className="col-span-1 lg:w-24">
                              <Input type="text" inputMode="decimal" placeholder="Mati" className="h-8 rounded-lg px-2 text-xs sm:h-9 sm:px-3 sm:text-sm" {...form.register(`frequentAddons.${index}.defaultAmountB` as const)} />
                            </div>
                            <div className="col-span-1 lg:w-24">
                              <Input placeholder="Jedn." className="h-8 rounded-lg px-2 text-xs sm:h-9 sm:px-3 sm:text-sm" {...form.register(`frequentAddons.${index}.unit` as const)} />
                            </div>
                            <div className="col-span-1 lg:w-24">
                              <Input type="number" step="0.01" placeholder="np. 1" className="h-8 rounded-lg px-2 text-xs sm:h-9 sm:px-3 sm:text-sm" {...form.register(`frequentAddons.${index}.alternativeAmount` as const)} />
                            </div>
                            <div className="col-span-1 lg:w-32">
                              <Input placeholder="np. sztuka" className="h-8 rounded-lg px-2 text-xs sm:h-9 sm:px-3 sm:text-sm" {...form.register(`frequentAddons.${index}.alternativeUnit` as const)} />
                            </div>
                          </div>
                          <div className="w-full lg:w-36">
                            <Select
                              value={form.watch(`frequentAddons.${index}.scalingType`) || "LINEAR"}
                              onValueChange={(value) => form.setValue(`frequentAddons.${index}.scalingType`, value as any)}
                            >
                              <SelectTrigger className="h-8 rounded-lg text-xs sm:h-9 sm:text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="LINEAR">LINEAR</SelectItem>
                                <SelectItem value="FIXED">FIXED</SelectItem>
                                <SelectItem value="STEP">STEP</SelectItem>
                                <SelectItem value="FORMULA">FORMULA</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg hover:bg-red-50 hover:text-red-500 self-end sm:self-auto" onClick={() => removeFrequentAddon(index)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                        {(() => {
                          const baseAmount = Number(form.watch(`frequentAddons.${index}.baseAmount`)) || 0;
                          const alternativeAmount = Number(form.watch(`frequentAddons.${index}.alternativeAmount`)) || 0;
                          const alternativeUnit = form.watch(`frequentAddons.${index}.alternativeUnit`) || "";
                          if (alternativeAmount <= 0 || !alternativeUnit.trim()) return null;
                          return (
                            <p className="mt-2 text-[10px] text-muted-foreground sm:text-xs">
                              Podgląd: {formatLocalizedNumber(baseAmount)}g = {formatLocalizedNumber(alternativeAmount)} {alternativeUnit}
                            </p>
                          );
                        })()}
                        {form.watch(`frequentAddons.${index}.scalingType`) === "FORMULA" && (
                          <div className="mt-2">
                            <Input placeholder="np. 100 + (scaleFactor - 1) * 50" className="h-9 rounded-lg" {...form.register(`frequentAddons.${index}.scalingFormula` as const)} />
                          </div>
                        )}
                        {form.watch(`frequentAddons.${index}.scalingType`) === "STEP" && (
                          <div className="mt-2 space-y-2">
                            {(form.watch(`frequentAddons.${index}.stepThresholds`) || []).map((_: any, thresholdIndex: number) => (
                              <div key={thresholdIndex} className="grid grid-cols-4 gap-2 items-center">
                                <Input type="number" step="0.5" min="0" inputMode="decimal" placeholder="Od porcji" {...form.register(`frequentAddons.${index}.stepThresholds.${thresholdIndex}.minServings` as const)} />
                                <Input type="number" step="0.5" min="0" inputMode="decimal" placeholder="Do porcji" {...form.register(`frequentAddons.${index}.stepThresholds.${thresholdIndex}.maxServings` as const)} />
                                <Input type="text" inputMode="decimal" placeholder="Ilość" {...form.register(`frequentAddons.${index}.stepThresholds.${thresholdIndex}.amount` as const)} />
                                <Button type="button" variant="ghost" onClick={() => {
                                  const current = form.getValues(`frequentAddons.${index}.stepThresholds`) || [];
                                  form.setValue(`frequentAddons.${index}.stepThresholds`, current.filter((_: any, i: number) => i !== thresholdIndex));
                                }}>Usuń</Button>
                              </div>
                            ))}
                            <Button type="button" variant="outline" onClick={() => {
                              const current = form.getValues(`frequentAddons.${index}.stepThresholds`) || [];
                              form.setValue(`frequentAddons.${index}.stepThresholds`, [...current, { minServings: 1, maxServings: null, amount: Number(form.getValues(`frequentAddons.${index}.baseAmount`) || 0) }]);
                            }}>+ Próg</Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" className="rounded-lg border-dashed w-full py-3 sm:py-5 border-2 hover:bg-emerald-50 hover:border-emerald-300 transition-all text-xs sm:text-sm" onClick={() => appendFrequentAddon({ ingredientId: 0, amount: 50, baseAmount: 50, defaultAmountA: 0, defaultAmountB: 50, unit: "g", alternativeAmount: undefined, alternativeUnit: "", scalingType: "LINEAR", scalingFormula: "", stepThresholds: [] })}>
                  + Dodaj najczęsty dodatek
                </Button>
              </div>


              <div>
                <label className="text-sm font-medium mb-1 block">Kroki wykonania (1 krok w linii)</label>
                <textarea 
                  {...form.register("instructions")} 
                  className="w-full min-h-[140px] p-3 rounded-xl border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" 
                  placeholder={"1. Pokrój warzywa\n2. Smaż 8 minut [timer:Patelnia]\n3. Duś 1 godzinę [timer:Garnek|60]"}
                />
                <p className="text-xs text-muted-foreground mt-1">Timer pojawi się tylko gdy krok zawiera czas (np. minut/godzin). Nazwę timera dodasz jako [timer:Nazwa] lub [timer:Nazwa|liczba_minut].</p>

                <div className="mt-3">
                  <label className="text-sm font-medium mb-1 block">Komentarz do przepisu</label>
                  <textarea
                    {...form.register("comments")}
                    className="w-full min-h-[90px] p-3 rounded-xl border border-amber-200 bg-amber-50/70 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-300"
                    placeholder="Np. następnym razem daj mniej soli albo piecz 2 minuty krócej"
                  />
                </div>

                <div className="mt-3 rounded-xl border p-3 space-y-2 bg-secondary/20">
                  <p className="text-xs font-semibold">Mapowanie fragmentów na składniki (Cooking Mode)</p>
                  <div className="grid sm:grid-cols-4 gap-2">
                    <Select value={String(newInstructionLink.stepIndex)} onValueChange={(v) => setNewInstructionLink((prev) => ({ ...prev, stepIndex: Number(v) }))}>
                      <SelectTrigger><SelectValue placeholder="Krok" /></SelectTrigger>
                      <SelectContent>
                        {instructionLines.map((line, idx) => (<SelectItem key={idx} value={String(idx)}>Krok {idx + 1}: {line.slice(0, 24)}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <Input placeholder="Fragment tekstu" value={newInstructionLink.text} onChange={(e) => setNewInstructionLink((prev) => ({ ...prev, text: e.target.value }))} />
                    <Input
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]*[.,]?[0-9]+"
                      placeholder="Mnożnik"
                      value={newInstructionLinkMultiplierInput}
                      onChange={(e) => {
                        const rawValue = e.target.value;
                        setNewInstructionLinkMultiplierInput(rawValue);
                        setNewInstructionLink((prev) => ({
                          ...prev,
                          multiplier: parsePositiveMultiplier(rawValue),
                        }));
                      }}
                      onBlur={() => {
                        const parsedMultiplier = parsePositiveMultiplier(newInstructionLinkMultiplierInput);
                        setNewInstructionLink((prev) => ({ ...prev, multiplier: parsedMultiplier }));
                        setNewInstructionLinkMultiplierInput(String(parsedMultiplier));
                      }}
                    />
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Select
                        value={newInstructionLink.ingredientId ? `${newInstructionLink.ingredientSource || "ingredient"}:${newInstructionLink.ingredientId}` : "0"}
                        onValueChange={(v) => {
                          if (v === "0") {
                            setNewInstructionLink((prev) => ({ ...prev, ingredientId: 0, ingredientSource: "ingredient" }));
                            return;
                          }
                          const [source, id] = v.split(":");
                          setNewInstructionLink((prev) => ({
                            ...prev,
                            ingredientId: Number(id),
                            ingredientSource: source === "frequentAddon" ? "frequentAddon" : "ingredient",
                          }));
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Składnik / dodatek" /></SelectTrigger>
                        <SelectContent>
                          {mappableIngredients.map((ingredient) => (
                            <SelectItem key={ingredient.key} value={`${ingredient.source}:${ingredient.id}`}>{ingredient.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          if (!newInstructionLink.text.trim() || !newInstructionLink.ingredientId) return;
                          const multiplier = parsePositiveMultiplier(newInstructionLinkMultiplierInput);
                          setInstructionLinks((prev) => [...prev, { ...newInstructionLink, multiplier }]);
                          setNewInstructionLink((prev) => ({ ...prev, multiplier }));
                        }}
                      >Dodaj</Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {groupedInstructionLinks.map((group, idx) => {
                      const first = group[0];
                      const ingredientNames = group
                        .map((link) => {
                          const ingredientName = (availableIngredients || []).find((ing: any) => ing.id === link.ingredientId)?.name || `#${link.ingredientId}`;
                          return link.ingredientSource === "frequentAddon" ? `[Dodatek] ${ingredientName}` : ingredientName;
                        })
                        .join(", ");
                      return (
                        <div key={`${first.stepIndex}-${first.text}-${idx}`} className="flex items-center justify-between text-xs bg-white rounded-md px-2 py-1 border">
                          <span>Krok {first.stepIndex + 1}: <b>{first.text}</b> → {ingredientNames} ×{first.multiplier ?? 1}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setInstructionLinks((prev) =>
                                prev.filter((link) => {
                                  const sameMultiplier = (link.multiplier ?? 1) === (first.multiplier ?? 1);
                                  return !(link.stepIndex === first.stepIndex && link.text === first.text && sameMultiplier && (link.ingredientSource || "ingredient") === (first.ingredientSource || "ingredient"));
                                })
                              )
                            }
                          >
                            Usuń
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>


              <details className="rounded-xl border border-border/70 bg-secondary/20 p-3">
                <summary className="cursor-pointer text-sm font-medium">Sugerowane przepisy (opcjonalnie)</summary>
                <p className="mt-2 text-xs text-muted-foreground">
                  Możesz podać liczbę porcji <b>albo % całego przepisu</b> (np. 20% z przepisu na 5 kotletów = 1 kotlet do kanapki).
                </p>
                <div className="mt-3">
                  <Input
                    value={suggestedRecipeSearch}
                    onChange={(e) => setSuggestedRecipeSearch(e.target.value)}
                    placeholder="Szukaj przepisu..."
                    className="h-9"
                  />
                </div>
                <div className="mt-3 max-h-52 overflow-y-auto rounded-md border bg-white p-2 space-y-2">
                  {(recipes || [])
                    .filter((candidate: any) => Number(candidate.id) !== Number(editingRecipe?.id || 0))
                    .filter((candidate: any) => {
                      const normalizedQuery = normalizeSearchText(suggestedRecipeSearch);
                      if (!normalizedQuery) return true;
                      return normalizeSearchText(candidate?.name).includes(normalizedQuery);
                    })
                    .map((candidate: any) => {
                      const current = form.watch("suggestedRecipes") || [];
                      const selectedItem = current.find((item: any) => Number(item.recipeId) === Number(candidate.id));
                      const selected = !!selectedItem;
                      return (
                        <div key={candidate.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(e) => {
                              const existing = (form.getValues("suggestedRecipes") || []).map((item: any) => ({ recipeId: Number(item.recipeId), servings: 1 }));
                              const next = e.target.checked
                                ? [...existing.filter((item: any) => Number(item.recipeId) !== Number(candidate.id)), { recipeId: Number(candidate.id), servings: 1 }]
                                : existing.filter((item: any) => Number(item.recipeId) !== Number(candidate.id));
                              form.setValue("suggestedRecipes", next, { shouldDirty: true });
                            }}
                          />
                          <span className="flex-1">{candidate.name}</span>
                          {selected && (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min={0.01}
                                step={0.01}
                                className="h-8 w-20"
                                value={Number(selectedItem?.servings) || 1}
                                onChange={(e) => {
                                  const nextServings = Math.max(0.01, Number(e.target.value) || 1);
                                  const existing = (form.getValues("suggestedRecipes") || []).map((item: any) => ({
                                    recipeId: Number(item.recipeId),
                                    servings: Number(item.servings) || 1,
                                  }));
                                  const next = existing.map((item: any) =>
                                    Number(item.recipeId) === Number(candidate.id)
                                      ? { ...item, servings: nextServings }
                                      : item
                                  );
                                  form.setValue("suggestedRecipes", next, { shouldDirty: true });
                                }}
                                title="Liczba porcji z powiązanego przepisu"
                              />
                              <span className="text-xs text-muted-foreground">lub</span>
                              <Input
                                type="number"
                                min={1}
                                step={1}
                                className="h-8 w-20"
                                value={toPercentageOfRecipe(
                                  Number(selectedItem?.servings) || 1,
                                  Math.max(0.01, Number(candidate?.servings) || 1),
                                )}
                                onChange={(e) => {
                                  const percentage = Math.max(1, Number(e.target.value) || 1);
                                  const nextServings = fromPercentageToServings(
                                    percentage,
                                    Math.max(0.01, Number(candidate?.servings) || 1),
                                  );
                                  const existing = (form.getValues("suggestedRecipes") || []).map((item: any) => ({
                                    recipeId: Number(item.recipeId),
                                    servings: Number(item.servings) || 1,
                                  }));
                                  const next = existing.map((item: any) =>
                                    Number(item.recipeId) === Number(candidate.id)
                                      ? { ...item, servings: nextServings }
                                      : item
                                  );
                                  form.setValue("suggestedRecipes", next, { shouldDirty: true });
                                }}
                                title="% całego powiązanego przepisu"
                              />
                              <span className="text-xs text-muted-foreground">%</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  {(recipes || []).filter((candidate: any) => Number(candidate.id) !== Number(editingRecipe?.id || 0)).length === 0 && (
                    <p className="text-xs text-muted-foreground">Brak innych przepisów do powiązania.</p>
                  )}
                </div>
              </details>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 sm:pt-4">
                <Button type="button" variant="ghost" onClick={closeDialog}>Anuluj</Button>
                <Button type="submit" disabled={isCreating || isUpdating}>
                  {isCreating || isUpdating ? "Zapisywanie..." : "Zapisz przepis"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative mb-8 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
          <input 
            type="text" 
            placeholder="Search recipes or ingredients..." 
            className="w-full pl-12 pr-4 py-3 rounded-2xl border border-border bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          <Select value={selectedTag} onValueChange={setSelectedTag}>
            <SelectTrigger className="h-[52px] w-full rounded-2xl border-border bg-white shadow-sm sm:w-[160px]">
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie tagi</SelectItem>
              {allTags.map(tag => (
                <SelectItem key={tag} value={tag}>{tag}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          

          <label className="flex h-[52px] w-full items-center gap-2 rounded-2xl border border-border bg-white px-4 text-sm font-medium shadow-sm sm:w-auto">
            <Checkbox
              checked={pricedIngredientsOnly}
              onCheckedChange={(checked) => setPricedIngredientsOnly(checked === true)}
            />
            <span>Tylko z pełnymi cenami</span>
          </label>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-[52px] w-full rounded-2xl border-border bg-white shadow-sm sm:w-[180px]">
              <SelectValue placeholder="Sortuj według" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="frequency">Najczęściej jedzone</SelectItem>
              <SelectItem value="alphabetical">Alfabetycznie</SelectItem>
              <SelectItem value="calories">Kalorie (max)</SelectItem>
              <SelectItem value="value">Kalorie / Cena (max)</SelectItem>
              <SelectItem value="pricePerServing">Cena porcji (min)</SelectItem>
              <SelectItem value="totalPrice">Cena przepisu (min)</SelectItem>
              <SelectItem value="time">Czas gotowania (min)</SelectItem>
              <SelectItem value="protein">Białko (max)</SelectItem>
              <SelectItem value="carbs">Węglowodany (max)</SelectItem>
              <SelectItem value="fat">Tłuszcze (max)</SelectItem>
              <SelectItem value="favorites">Tylko ulubione</SelectItem>
            </SelectContent>
          </Select>

          <Select value={viewMode} onValueChange={(value) => setViewMode(value as "cards" | "horizontal")}>
            <SelectTrigger className="h-[52px] w-full rounded-2xl border-border bg-white shadow-sm sm:w-[180px]">
              <SelectValue placeholder="Widok listy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cards">Kafelki</SelectItem>
              <SelectItem value="horizontal">Lista pozioma</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className={cn(
        "gap-6",
        viewMode === "cards"
          ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          : "flex flex-col"
      )}>
        {sortedAndFilteredRecipes?.map((recipe: any) => (
          <div
            key={recipe.id}
            className={cn(
              "group bg-white rounded-3xl p-4 shadow-sm hover:shadow-xl transition-all duration-300 border border-border/50",
              viewMode === "cards"
                ? "flex flex-col h-full max-w-[260px] w-full justify-self-center"
                : "flex flex-col md:flex-row md:items-stretch gap-4"
            )}
          >
            <div 
              className={cn(
                "rounded-2xl bg-cover bg-center relative overflow-hidden",
                viewMode === "cards" ? "h-32 mb-3" : "h-48 md:h-auto md:w-56 md:shrink-0"
              )}
              style={{ backgroundImage: `url(${recipe.imageUrl || 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800'})` }} 
            >
              <div className="absolute top-2 right-2 bg-white/90 backdrop-blur px-2 py-1 rounded-lg text-[10px] font-bold shadow-sm">
                Zjedzone: {recipe.stats?.eatCount || 0}x
              </div>
              {/* Healthy green salad */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-wrap content-end items-end p-3 gap-1.5">
                 <button 
                 onClick={async (e) => { 
                    e.preventDefault(); 
                    const fullRecipe = await fetchRecipeDetails(Number(recipe.id));
                    setRecipeToPlan(fullRecipe);
                    setSelectedFrequentAddons(getDefaultFrequentAddonsSelection(fullRecipe));
                    setAddForBothPeople(true);
                    setSelectedPerson("A");
                    setSelectedRecipeServings(1);
            setSelectedSuggestedRecipes({});
          setIsAddToPlanOpen(true);
                  }}
                  className="bg-white/80 p-2 rounded-full text-primary hover:bg-white transition-colors shrink-0"
                  title="Dodaj do planu"
                 >
                   <CalendarPlus className="w-4 h-4" />
                 </button>
                 <button 
                  onClick={async (e) => { e.preventDefault(); setViewingRecipe(await fetchRecipeDetails(Number(recipe.id))); }}
                  className="bg-white/80 p-2 rounded-full text-primary hover:bg-white transition-colors shrink-0"
                 >
                   <Eye className="w-4 h-4" />
                 </button>
                 <button 
                  onClick={(e) => { e.preventDefault(); void openEdit(recipe); }}
                  className="bg-white/80 p-2 rounded-full text-primary hover:bg-white transition-colors shrink-0"
                 >
                   <Edit2 className="w-4 h-4" />
                 </button>
                 <AlertDialog>
                   <AlertDialogTrigger asChild>
                     <button 
                      onClick={(e) => e.stopPropagation()}
                      className="bg-red-500/80 p-2 rounded-full text-white hover:bg-red-600 transition-colors shrink-0"
                     >
                       <Trash2 className="w-4 h-4" />
                     </button>
                   </AlertDialogTrigger>
                   <AlertDialogContent>
                     <AlertDialogHeader>
                       <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                       <AlertDialogDescription>
                         This will permanently delete "{recipe.name}".
                       </AlertDialogDescription>
                     </AlertDialogHeader>
                     <AlertDialogFooter>
                       <AlertDialogCancel>Cancel</AlertDialogCancel>
                       <AlertDialogAction 
                         onClick={() => deleteRecipe(recipe.id)}
                         className="bg-red-500 hover:bg-red-600"
                       >
                         Delete
                       </AlertDialogAction>
                     </AlertDialogFooter>
                   </AlertDialogContent>
                 </AlertDialog>
              </div>
            </div>
            
            <div className="flex-1 flex flex-col">
              {viewMode === "cards" ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold font-display leading-tight line-clamp-2">{recipe.name}</h3>
                    <button
                      type="button"
                      className={cn("rounded-full p-1 transition-colors", recipe.isFavorite ? "text-rose-500 bg-rose-50" : "text-muted-foreground hover:text-rose-500 hover:bg-rose-50")}
                      onClick={() => void toggleRecipeFavorite(recipe)}
                      title={recipe.isFavorite ? "Usuń z ulubionych" : "Dodaj do ulubionych"}
                    >
                      <Heart className={cn("w-4 h-4", recipe.isFavorite && "fill-current")} />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {recipe.tags?.map((tag: string, i: number) => (
                      <span key={i} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-md font-medium">
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-1 rounded-md text-center">
                    {(() => {
                      const nutrition = getRecipeCaloriesPerServing(recipe);
                      return `${formatRange(nutrition.perServing.calories.base, nutrition.perServing.calories.withAddons, " kcal")} / porcja`;
                    })()}
                  </div>

                  <div className="grid grid-cols-3 gap-1 text-[10px] text-center text-muted-foreground">
                    <div className="bg-secondary/50 rounded-sm py-0.5">
                      {(() => {
                        const nutrition = getRecipeCaloriesPerServing(recipe);
                        return `B: ${formatRange(nutrition.perServing.protein.base, nutrition.perServing.protein.withAddons, "g")}`;
                      })()}
                    </div>
                    <div className="bg-secondary/50 rounded-sm py-0.5">
                      {(() => {
                        const nutrition = getRecipeCaloriesPerServing(recipe);
                        return `W: ${formatRange(nutrition.perServing.carbs.base, nutrition.perServing.carbs.withAddons, "g")}`;
                      })()}
                    </div>
                    <div className="bg-secondary/50 rounded-sm py-0.5">
                      {(() => {
                        const nutrition = getRecipeCaloriesPerServing(recipe);
                        return `T: ${formatRange(nutrition.perServing.fat.base, nutrition.perServing.fat.withAddons, "g")}`;
                      })()}
                    </div>
                  </div>
                  <div className="text-[10px] text-center text-muted-foreground font-medium">
                    {`${Number(recipe?.servings) || 1} porcji`}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-xl font-bold font-display leading-tight">{recipe.name}</h3>
                      <div className="flex flex-wrap gap-1">
                        {recipe.tags?.map((tag: string, i: number) => (
                          <span key={i} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-md font-medium">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <button
                        type="button"
                        className={cn("rounded-full p-1 transition-colors", recipe.isFavorite ? "text-rose-500 bg-rose-50" : "text-muted-foreground hover:text-rose-500 hover:bg-rose-50")}
                        onClick={() => void toggleRecipeFavorite(recipe)}
                        title={recipe.isFavorite ? "Usuń z ulubionych" : "Dodaj do ulubionych"}
                      >
                        <Heart className={cn("w-4 h-4", recipe.isFavorite && "fill-current")} />
                      </button>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full mb-1">
                        <Clock className="w-3 h-3" />
                        {recipe.prepTime}m
                      </div>
                      <div className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        {(() => {
                          const nutrition = getRecipeCaloriesPerServing(recipe);
                          return `${formatRange(nutrition.perServing.price.base, nutrition.perServing.price.withAddons, " PLN")} / porcja`;
                        })()}
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-auto pt-4 border-t border-dashed border-border">
                    <div className="flex flex-col gap-2">
                    <div className="flex justify-between text-xs text-muted-foreground font-medium">
                      <span className="flex items-center gap-1"><ChefHat className="w-3 h-3" /> {recipe.ingredients.length} składników ({recipe.servings || 1} porcji)</span>
                      <span>
                          {(() => {
                            const nutrition = getRecipeCaloriesPerServing(recipe);
                            return `${formatRange(nutrition.perServing.calories.base, nutrition.perServing.calories.withAddons, " kcal")} / porcja`;
                          })()}
                        </span>
                    </div>
                    {(() => {
                      const nutrition = getRecipeCaloriesPerServing(recipe);
                      const servings = Number(recipe?.servings) || 1;
                      if (servings <= 1) return null;
                      return (
                        <div className="grid grid-cols-1 gap-1 text-[10px] text-muted-foreground sm:grid-cols-2">
                          <div className="bg-secondary/50 rounded-sm py-0.5 px-2 text-center sm:text-left">
                            Cena porcji (bez/z dodatkami): {formatRange(nutrition.perServing.price.base, nutrition.perServing.price.withAddons, " PLN")}
                          </div>
                          <div className="bg-secondary/50 rounded-sm py-0.5 px-2 text-center sm:text-left">
                            Cena przepisu (bez/z dodatkami): {formatRange(nutrition.totalPrice.base, nutrition.totalPrice.withAddons, " PLN")}
                          </div>
                        </div>
                      );
                    })()}
                      <div className="grid grid-cols-4 gap-1 text-[10px] text-center text-muted-foreground">
                        <div className="bg-secondary/50 rounded-sm py-0.5">
                          {(() => {
                            const nutrition = getRecipeCaloriesPerServing(recipe);
                            return `B: ${formatRange(nutrition.perServing.protein.base, nutrition.perServing.protein.withAddons, "g")}`;
                          })()}
                        </div>
                        <div className="bg-secondary/50 rounded-sm py-0.5">
                          {(() => {
                            const nutrition = getRecipeCaloriesPerServing(recipe);
                            return `W: ${formatRange(nutrition.perServing.carbs.base, nutrition.perServing.carbs.withAddons, "g")}`;
                          })()}
                        </div>
                        <div className="bg-secondary/50 rounded-sm py-0.5">
                          {(() => {
                            const nutrition = getRecipeCaloriesPerServing(recipe);
                            return `T: ${formatRange(nutrition.perServing.fat.base, nutrition.perServing.fat.withAddons, "g")}`;
                          })()}
                        </div>
                        <div className="bg-primary/10 text-primary font-bold rounded-sm py-0.5">
                          {(() => {
                            const nutrition = getRecipeCaloriesPerServing(recipe);
                            return `${formatRange(nutrition.perServing.calories.base, nutrition.perServing.calories.withAddons, " kcal")}`;
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}

        {filteredRecipeTotal === 0 && (
          <div className="col-span-full py-20 text-center">
            <p className="text-muted-foreground">No recipes found. Try searching for something else or create a new one!</p>
          </div>
        )}
      </div>

      {recipeTotalPages > 1 && (
        <div className="mt-6 flex flex-col items-center justify-between gap-3 rounded-2xl border bg-white p-4 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            Strona {recipePage} z {recipeTotalPages} • pokazano {visibleRecipes.length} z {filteredRecipeTotal} pasujących przepisów
          </p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={recipePage === 1 || isLoading} onClick={() => setRecipePage((page) => Math.max(1, page - 1))}>
              Poprzednia
            </Button>
            <Button variant="outline" disabled={isLoading || recipePage >= recipeTotalPages} onClick={() => setRecipePage((page) => page + 1)}>
              Następna
            </Button>
          </div>
        </div>
      )}
      <RecipeView 
        recipe={viewingRecipe}
        isOpen={!!viewingRecipe}
        onClose={() => setViewingRecipe(null)}
        onAddToPlan={(recipe, servingsOverride) => {
          setRecipeToPlan(recipe);
          setViewingRecipe(null);
          setSelectedFrequentAddons(getDefaultFrequentAddonsSelection(recipe));
          setAddForBothPeople(false);
          setAddToSharedBatches(!userSettings?.A?.sharedBatchesManualOnly);
          setSelectedPerson("A");
          setSelectedRecipeServings(Number(servingsOverride) > 0 ? Number(servingsOverride) : 1);
          const initialSuggestions = ((recipe?.suggestedRecipes || []) as any[]).reduce((acc: Record<string, number>, item: any) => {
            const recipeId = Number(item?.recipeId);
            const servings = Number(item?.servings) || 1;
            if (Number.isFinite(recipeId) && recipeId > 0) acc[String(recipeId)] = servings;
            return acc;
          }, {});
          if (Object.keys(initialSuggestions).length === 0) {
            ((recipe?.suggestedRecipeIds || []) as any[]).forEach((id: any) => {
              const recipeId = Number(id);
              if (Number.isFinite(recipeId) && recipeId > 0) initialSuggestions[String(recipeId)] = 1;
            });
          }
          setSelectedSuggestedRecipes(initialSuggestions);
          setIsAddToPlanOpen(true);
        }}
        allRecipes={recipes || []}
      />

      <Dialog
        open={isAddToPlanOpen}
        onOpenChange={(open) => {
          setIsAddToPlanOpen(open);
          if (!open) {
            setSelectedFrequentAddons({ A: {}, B: {} });
            setAddForBothPeople(false);
            setAddToSharedBatches(false);
            setSelectedPerson("A");
            setSelectedRecipeServings(1);
            setPortionMode("SCALED");
            setBatchAllocations({ A: 50, B: 50 });
            setSelectedSuggestedRecipes({});
          }
        }}
      >
        <DialogContent className="max-sm:h-[100dvh] max-sm:max-h-none px-3 py-4 sm:px-6 sm:py-6">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Dodaj do planu: {recipeToPlan?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Wybierz dzień</label>
              <Select value={selectedDate} onValueChange={setSelectedDate}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {next7Days.map((day) => (
                    <SelectItem key={day.value} value={day.value}>
                      {day.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Wybierz posiłek</label>
              <Select value={selectedMealType} onValueChange={setSelectedMealType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="breakfast">Śniadanie</SelectItem>
                  <SelectItem value="lunch">Obiad</SelectItem>
                  <SelectItem value="dinner">Kolacja</SelectItem>
                  <SelectItem value="snack">Drugie śniadanie</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Sposób planowania</label>
              <Select value={portionMode} onValueChange={(value) => setPortionMode(value as PortionMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="SCALED">Porcja</SelectItem><SelectItem value="INDIVIDUAL">Indywidualne ilości</SelectItem><SelectItem value="BATCH_ALLOCATION">Wspólny batch i podział</SelectItem></SelectContent>
              </Select>
              <label className="text-sm font-medium">{portionMode === "BATCH_ALLOCATION" ? "Przygotuj porcji" : "Liczba porcji"}</label>
              <Input type="number" step="any" min="0.25" value={selectedRecipeServings} onChange={(e) => setSelectedRecipeServings(Math.max(0.25, Number(e.target.value) || 1))} />
            </div>
            {portionMode === "BATCH_ALLOCATION" && <div className="grid gap-2 rounded-lg border p-3"><p className="text-sm font-medium">Podział gotowego dania</p>{(["A", "B"] as const).map((person) => <label key={person} className="flex items-center justify-between gap-3 text-sm"><span>{personName[person]}</span><Input className="w-24" type="number" step="any" min="0" max="100" value={batchAllocations[person]} onChange={(e) => setBatchAllocations((current) => ({ ...current, [person]: Number(e.target.value) || 0 }))} /></label>)}<p className={validatePercentageAllocations([{ person: "A", percentage: batchAllocations.A }, { person: "B", percentage: batchAllocations.B }]) ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>Suma: {batchAllocations.A + batchAllocations.B}%</p></div>}

            {suggestedRecipeOptionsForPlan.length > 0 && (
              <div className="grid gap-2">
                <label className="text-sm font-medium">A może dodać też?</label>
                <div className="space-y-2 rounded-xl border border-border/60 bg-secondary/20 p-3">
                  {suggestedRecipeOptionsForPlan.map((entry: any) => {
                    const key = String(entry.id);
                    const amount = Number(selectedSuggestedRecipes[key] ?? 0);
                    return (
                      <div key={entry.id} className="flex items-center gap-2 text-sm">
                        <label className="flex items-center gap-2 flex-1">
                          <input
                            type="checkbox"
                            checked={amount > 0}
                            onChange={(e) => {
                              setSelectedSuggestedRecipes((prev) => ({
                                ...prev,
                                [key]: e.target.checked ? (amount > 0 ? amount : 1) : 0,
                              }));
                            }}
                          />
                          <span>{entry.name}</span>
                        </label>
                        <Input
                          type="number"
                          min={0.25}
                          step={0.25}
                          className="h-8 w-20"
                          disabled={amount <= 0}
                          value={amount > 0 ? amount : 1}
                          onChange={(e) => {
                            const nextAmount = Math.max(0.25, Number(e.target.value) || 1);
                            setSelectedSuggestedRecipes((prev) => ({ ...prev, [key]: nextAmount }));
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="grid gap-2">
              <label className="text-sm font-medium">Dla kogo</label>
              <Select value={selectedPerson} onValueChange={(value) => setSelectedPerson(value as "A" | "B")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Tysia</SelectItem>
                  <SelectItem value="B">Mati</SelectItem>
                </SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={addForBothPeople}
                  onChange={(e) => setAddForBothPeople(e.target.checked)}
                />
                Dodaj od razu dla obu osób
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={addToSharedBatches}
                  onChange={(e) => setAddToSharedBatches(e.target.checked)}
                />
                Zapisz jako wspólną partię (resztki na później)
              </label>
              {addToSharedBatches && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  <p>
                    To najlepszy tryb dla gotowania „na dwa dni” (np. kotlet → kanapka ze schabowym).
                  </p>
                  <p className="mt-1">
                    Po dodaniu przepisu przejdź do{" "}
                    <Link href="/shared-meals">
                      <span className="cursor-pointer font-semibold underline">Wspólnych posiłków</span>
                    </Link>{" "}
                    i rozdziel pozostałe porcje na kolejne dni.
                  </p>
                </div>
              )}
            </div>
            {(recipeToPlan?.frequentAddons || []).length > 0 && (
              <div className="grid gap-2">
                <label className="text-sm font-medium">Sugerowane dodatki</label>
                <div className="space-y-2 rounded-xl border border-border/60 bg-secondary/20 p-3">
                  {(recipeToPlan.frequentAddons || []).map((addon: any, index: number) => {
                    const addonKey = getAddonSelectionKey(addon, index);
                    return (
                    <div key={addonKey} className="space-y-1 rounded-lg border bg-white p-2 text-sm">
                      <div className="font-medium">{addon.ingredient?.name || "Składnik"}</div>
                      <div className="text-xs text-muted-foreground">Krok: +{formatLocalizedNumber(Number(addon.baseAmount ?? addon.amount) || 0)} {addon.unit || "g"}</div>
                      {(["A", "B"] as const).map((person) => (
                        <div key={`${addonKey}-${person}`} className="flex items-center gap-2">
                          <span className="w-12 text-xs text-muted-foreground font-semibold">{personName[person]}</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => adjustAddonAmount(person, addonKey, -(Number(addon.baseAmount ?? addon.amount) || 0))}
                          >
                            -
                          </Button>
                          <Input
                            type="number"
                            min={0}
                            value={selectedFrequentAddons[person][addonKey] || 0}
                            onChange={(e) => {
                              setAddonAmount(person, addonKey, Number(e.target.value) || 0);
                            }}
                            className="h-8 w-24"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => adjustAddonAmount(person, addonKey, Number(addon.baseAmount ?? addon.amount) || 0)}
                          >
                            +
                          </Button>
                          <span className="text-xs text-muted-foreground">{addon.unit || "g"}</span>
                        </div>
                      ))}
                    </div>
                  )})}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsAddToPlanOpen(false)}>Anuluj</Button>
            <Button onClick={handleAddToPlan} disabled={isAddingToPlan}>
              {isAddingToPlan ? "Dodawanie..." : "Dodaj do planu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
