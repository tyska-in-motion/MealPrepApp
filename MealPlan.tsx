import { useState, useMemo, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { format, addDays, subDays, eachDayOfInterval } from "date-fns";
import { pl } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, X, CheckCircle2, Circle, Minus, Eye, Carrot, Copy, Trash2 } from "lucide-react";
import { useDayPlan, useAddMealEntry, useDeleteMealEntry, useToggleEaten, useUpdateMealEntry, useCopyDayPlan } from "@/hooks/use-meal-plan";
import { useRecipes } from "@/hooks/use-recipes";
import { useIngredients } from "@/hooks/use-ingredients";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { RecipeView } from "@/components/RecipeView";
import { calculateScaledAmount } from "@shared/scaling";
import { useToast } from "@/hooks/use-toast";
import { Check, ChevronsUpDown, Soup } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "@shared/routes";
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

export default function MealPlan() {
  const [location] = useLocation();
  const [baseDate, setBaseDate] = useState(new Date());

  useEffect(() => {
    const params = new URLSearchParams(location.split("?")[1] || "");
    const dateParam = params.get("date");
    if (!dateParam) return;

    const parsedDate = new Date(`${dateParam}T00:00:00`);
    if (Number.isNaN(parsedDate.getTime())) return;
    setBaseDate(parsedDate);
  }, [location]);
  
  const weekDays = useMemo(() => {
    const start = baseDate;
    return eachDayOfInterval({
      start,
      end: addDays(start, 6)
    });
  }, [baseDate]);

  useEffect(() => {
    const query = location.split("?")[1] || "";
    const hash = location.includes("#") ? location.split("#")[1] : "";
    const params = new URLSearchParams(query.split("#")[0] || "");
    const requestedDate = params.get("date") || format(new Date(), "yyyy-MM-dd");
    const targetId = hash || `day-${requestedDate}`;

    const scrollToTarget = () => {
      const target = document.getElementById(targetId);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const timer = window.setTimeout(scrollToTarget, 120);
    return () => window.clearTimeout(timer);
  }, [location, weekDays]);

  const { data: recipes } = useRecipes(undefined, undefined, 1, 10000);
  const { mutate: addEntry } = useAddMealEntry();
  const { mutate: deleteEntry } = useDeleteMealEntry();
  const { mutate: toggleEaten } = useToggleEaten();
  const { mutate: updateMealEntry, isPending: isSaving } = useUpdateMealEntry();
  const { mutate: copyDayPlan, isPending: isCopyingDay } = useCopyDayPlan();
  const { data: allAvailableIngredients } = useIngredients(undefined, 1, 10000);
  const weekStart = format(weekDays[0], "yyyy-MM-dd");
  const weekEnd = format(weekDays[6], "yyyy-MM-dd");
  const { data: shoppingListExcludedIds = [] } = useQuery<number[]>({
    queryKey: ["/api/shopping-list/exclusions", weekStart, weekEnd],
    queryFn: async () => {
      const response = await fetch(`/api/shopping-list/exclusions?startDate=${weekStart}&endDate=${weekEnd}`);
      if (!response.ok) return [];
      return response.json();
    },
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<"plan" | "shared">("plan");
  const [sharedRecipeId, setSharedRecipeId] = useState<number>(0);
  const [sharedTotalServings, setSharedTotalServings] = useState<number>(6);
  const [sharedNote, setSharedNote] = useState("");
  const [allocationForms, setAllocationForms] = useState<Record<number, { date: string; mealType: string; person: "A" | "B"; servings: number }>>({});
  const [isViewingSharedDayRecipe, setIsViewingSharedDayRecipe] = useState(false);

  const { data: sharedBatches = [] } = useQuery<any[]>({
    queryKey: [api.sharedMeals.list.path],
    queryFn: async () => {
      const res = await fetch(api.sharedMeals.list.path);
      if (!res.ok) throw new Error("Nie udało się pobrać wspólnych posiłków");
      return res.json();
    },
  });

  const createSharedBatch = useMutation({
    mutationFn: async () => {
      const payload = { recipeId: sharedRecipeId, totalServings: sharedTotalServings, note: sharedNote || undefined };
      const res = await fetch(api.sharedMeals.createBatch.path, {
        method: api.sharedMeals.createBatch.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || "Nie udało się utworzyć partii");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.sharedMeals.list.path] });
      setSharedRecipeId(0);
      setSharedTotalServings(6);
      setSharedNote("");
      toast({ title: "Dodano", description: "Nowa partia wspólnego posiłku została zapisana." });
    },
    onError: (error: any) => toast({ title: "Błąd", description: error?.message || "Nie udało się dodać partii", variant: "destructive" }),
  });

  const archiveBatch = useMutation({
    mutationFn: async (id: number) => {
      const path = api.sharedMeals.archiveBatch.path.replace(":id", String(id));
      const res = await fetch(path, {
        method: api.sharedMeals.archiveBatch.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchived: true }),
      });
      if (!res.ok) throw new Error("Nie udało się zarchiwizować partii");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.sharedMeals.list.path] }),
  });
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [isIngredientOpen, setIsIngredientOpen] = useState(false);
  const [selectedMealType, setSelectedMealType] = useState<string | null>(null);
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<"A" | "B">("A");
  const [selectedRecipeToAdd, setSelectedRecipeToAdd] = useState<any>(null);
  const [selectedFrequentAddons, setSelectedFrequentAddons] = useState<Record<"A" | "B", Record<number, number>>>({ A: {}, B: {} });
  const [addRecipeForBothPeople, setAddRecipeForBothPeople] = useState(false);
  const [selectedRecipeServings, setSelectedRecipeServings] = useState(1);
  const [selectedSuggestedRecipes, setSelectedSuggestedRecipes] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  
  const [viewingRecipe, setViewingRecipe] = useState<any>(null);
  const [viewingMeal, setViewingMeal] = useState<any>(null);
  const [viewingServings, setViewingServings] = useState<number | undefined>(undefined);
  const [isSharedRecipeView, setIsSharedRecipeView] = useState(false);

  const [isEditingIngredients, setIsEditingIngredients] = useState(false);
  const [editingMealIngredients, setEditingMealIngredients] = useState<any[]>([]);
  const [originalEditingMealIngredients, setOriginalEditingMealIngredients] = useState<any[]>([]);
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [selectedIngredientId, setSelectedIngredientId] = useState<number | null>(null);
  const [ingredientAmount, setIngredientAmount] = useState(100);
  const [copySourceDate, setCopySourceDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [copyTargetDate, setCopyTargetDate] = useState(format(addDays(new Date(), 1), "yyyy-MM-dd"));
  const personName: Record<"A" | "B", string> = { A: "Tysia", B: "Mati" };

  const frequentAddonDefinitions = viewingRecipe?.frequentAddons || [];
  const getAddonBaseAmount = (addon: any) => Number(addon?.baseAmount ?? addon?.amount) || 0;
  const frequentAddonIngredientIds = useMemo(() => new Set(
    frequentAddonDefinitions.map((addon: any) => addon.ingredientId)
  ), [frequentAddonDefinitions]);

  const availableIngredientIds = useMemo(() => {
    const alwaysAtHomeIds = (allAvailableIngredients || [])
      .filter((ingredient: any) => ingredient.alwaysAtHome)
      .map((ingredient: any) => Number(ingredient.id));

    const manualIds = (shoppingListExcludedIds || []).map((id: number) => Number(id));
    return Array.from(new Set([...alwaysAtHomeIds, ...manualIds]));
  }, [allAvailableIngredients, shoppingListExcludedIds]);

  const getIngredientServingFactor = (ingredientId: number, entryServings: number, recipeServings: number) => {
    if (frequentAddonIngredientIds.has(Number(ingredientId))) return 1;
    return entryServings / recipeServings;
  };

  const resolveRecipeIngredientSource = (ingredientId: number, occurrence: number) => {
    if (!viewingRecipe) return undefined;
    const recipeIngredients = (viewingRecipe.ingredients || []).filter((ri: any) => Number(ri?.ingredientId) === Number(ingredientId));
    const recipeFrequentAddons = (viewingRecipe.frequentAddons || []).filter((ri: any) => Number(ri?.ingredientId) === Number(ingredientId));
    const candidates = [...recipeIngredients, ...recipeFrequentAddons];
    return candidates[occurrence - 1] || candidates[0];
  };

  const startEditing = () => {
    if (!viewingRecipe || !viewingMeal) return;

    const hasMealSpecificIngredients = Boolean(viewingMeal.ingredients && viewingMeal.ingredients.length > 0);
    const currentIngredients = hasMealSpecificIngredients
      ? viewingMeal.ingredients
      : viewingRecipe.ingredients;

    const entryServings = Number(viewingMeal.servings) || 1;
    const recipeServings = Number(viewingRecipe.servings) || 1;
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
        amount: hasMealSpecificIngredients
          ? Number(ri?.amount) || 0
          : Math.round(calculateScaledAmount(ingredientForScaling as any, entryServings, recipeServings)),
        ingredient: ri.ingredient,
        isFrequentAddon,
        scalingType: ingredientForScaling.scalingType,
        scalingFormula: ingredientForScaling.scalingFormula,
        stepThresholds: ingredientForScaling.stepThresholds,
      };
    });

    const sortedIngredients = [
      ...mappedIngredients.filter((item: any) => !item.isFrequentAddon),
      ...mappedIngredients.filter((item: any) => item.isFrequentAddon),
    ];

    setEditingMealIngredients(sortedIngredients);
    setOriginalEditingMealIngredients(sortedIngredients.map((item: any) => ({ ...item })));
    setIsEditingIngredients(true);
  };

  const addIngredientToEdit = () => {
    setEditingMealIngredients([...editingMealIngredients, { ingredientId: 0, amount: 100, ingredient: null }]);
  };

  const addFrequentAddonToEdit = (addon: any) => {
    const addonIngredientId = Number(addon.ingredientId);
    const addonStep = getAddonBaseAmount(addon);
    if (!addonIngredientId || addonStep <= 0) return;

    setEditingMealIngredients((prev) => {
      const existingIndex = prev.findIndex((item: any) => Number(item.ingredientId) === addonIngredientId && item.isFrequentAddon);
      if (existingIndex >= 0) {
        return prev.map((item: any, idx: number) =>
          idx === existingIndex
            ? { ...item, amount: Number(item.amount || 0) + addonStep, isFrequentAddon: true }
            : item
        );
      }

      return [...prev, {
        ingredientId: addonIngredientId,
        amount: addonStep,
        ingredient: addon.ingredient || null,
        isFrequentAddon: true,
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

  const saveIngredients = async () => {
    if (!viewingMeal || !viewingRecipe) return;

    const ingredientsData = editingMealIngredients
      .filter(i => i.ingredientId > 0)
      .map(i => ({
        ingredientId: Number(i.ingredientId),
        amount: Number(i.amount) || 0,
      }));

    if (ingredientsData.length === 0) {
      toast({ title: "Błąd", description: "Dodaj przynajmniej jeden składnik.", variant: "destructive" });
      return;
    }

    const sharedEntryA = viewingMeal.sharedEntryA;
    const sharedEntryB = viewingMeal.sharedEntryB;

    if (sharedEntryA && sharedEntryB) {
      const servingsA = Number(sharedEntryA.servings) || 1;
      const servingsB = Number(sharedEntryB.servings) || 1;
      const totalServings = servingsA + servingsB || 1;
      const changedIngredientKeys = new Set(
        ingredientsData
          .map((ingredient, index) => {
            const original = originalEditingMealIngredients[index];
            const sameIngredient = Number(original?.ingredientId) === Number(ingredient.ingredientId);
            const sameAmount = Math.abs((Number(original?.amount) || 0) - ingredient.amount) < 0.000001;
            return sameIngredient && sameAmount ? null : `${index}:${ingredient.ingredientId}`;
          })
          .filter(Boolean) as string[]
      );

      const splitIngredients = (entry: any, factor: number) => ingredientsData.map((ingredient, index) => {
        const changedKey = `${index}:${ingredient.ingredientId}`;
        if (changedIngredientKeys.has(changedKey)) {
          return {
            ...ingredient,
            amount: Math.round(ingredient.amount * factor * 100) / 100,
          };
        }

        const existingIngredient = (entry?.ingredients || [])[index];
        if (Number(existingIngredient?.ingredientId) === Number(ingredient.ingredientId)) {
          return {
            ingredientId: Number(existingIngredient.ingredientId),
            amount: Number(existingIngredient.amount) || 0,
          };
        }

        return {
          ...ingredient,
          amount: Math.round((Number(originalEditingMealIngredients[index]?.amount) || ingredient.amount) * factor * 100) / 100,
        };
      });

      const updateSharedEntry = async (entry: any, ingredients: any[]) => {
        const response = await fetch(`/api/meal-plan/entry/${entry.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ingredients }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.message || "Nie udało się zapisać wspólnego przepisu");
        }

        return response.json();
      };

      try {
        await Promise.all([
          updateSharedEntry(sharedEntryA, splitIngredients(sharedEntryA, servingsA / totalServings)),
          updateSharedEntry(sharedEntryB, splitIngredients(sharedEntryB, servingsB / totalServings)),
        ]);
        queryClient.invalidateQueries({ queryKey: [api.mealPlan.getDay.path, sharedEntryA.date] });
        queryClient.invalidateQueries({ queryKey: [api.mealPlan.getDay.path, sharedEntryB.date] });
        queryClient.invalidateQueries({ queryKey: [api.mealPlan.getShoppingList.path] });
        queryClient.invalidateQueries({ queryKey: [api.sharedMeals.list.path] });
        toast({ title: "Sukces", description: "Wspólny przepis został rozdzielony na porcje Tysi i Matiego." });
        setIsEditingIngredients(false);
        setViewingRecipe(null);
        setViewingMeal(null);
        setViewingServings(undefined);
        setIsSharedRecipeView(false);
      } catch (error: any) {
        toast({ title: "Błąd", description: error?.message || "Nie udało się zapisać zmian.", variant: "destructive" });
      }
      return;
    }

    const entryServings = Number(viewingMeal.servings) || 1;
    updateMealEntry({
      id: viewingMeal.id,
      updates: { 
        ingredients: ingredientsData, 
        servings: entryServings,
        isEaten: !!viewingMeal.isEaten,
        date: viewingMeal.date,
        mealType: viewingMeal.mealType
      }
    }, {
      onSuccess: () => {
        setIsEditingIngredients(false);
        setViewingRecipe(null);
        setViewingMeal(null);
        setViewingServings(undefined);
      }
    });
  };

  const allTags = useMemo(() => {
    if (!recipes) return [];
    const tags = new Set<string>();
    recipes.forEach(r => r.tags?.forEach((t: string) => tags.add(t)));
    return Array.from(tags).sort();
  }, [recipes]);

  const filteredRecipes = useMemo(() => {
    if (!recipes) return [];
    return recipes.filter(recipe => {
      const matchesSearch = recipe.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTag = !selectedTag || recipe.tags?.includes(selectedTag);
      return matchesSearch && matchesTag;
    });
  }, [recipes, searchQuery, selectedTag]);

  const handleOpenAdd = (mealType: string, dateStr: string, person: "A" | "B") => {
    setSelectedMealType(mealType);
    setSelectedDateStr(dateStr);
    setSearchQuery("");
    setSelectedTag(null);
    setSelectedPerson(person);
    setSelectedRecipeToAdd(null);
    setSelectedFrequentAddons({ A: {}, B: {} });
    setAddRecipeForBothPeople(false);
    setSelectedRecipeServings(1);
    setSelectedSuggestedRecipes({});
    setIsAddOpen(true);
  };

  const handleOpenCustom = (mealType: string, dateStr: string, person: "A" | "B") => {
    setSelectedMealType(mealType);
    setSelectedDateStr(dateStr);
    setSelectedPerson(person);
    setIsCustomOpen(true);
  };

  const handleOpenIngredient = (mealType: string, dateStr: string, person: "A" | "B") => {
    setSelectedMealType(mealType);
    setSelectedDateStr(dateStr);
    setIngredientSearch("");
    setSelectedIngredientId(null);
    setIngredientAmount(100);
    setSelectedPerson(person);
    setIsIngredientOpen(true);
  };

  const closeAddDialog = () => {
    setIsAddOpen(false);
    setSelectedMealType(null);
    setSelectedDateStr(null);
    setSelectedRecipeToAdd(null);
    setSelectedFrequentAddons({ A: {}, B: {} });
    setAddRecipeForBothPeople(false);
    setSelectedRecipeServings(1);
    setSelectedSuggestedRecipes({});
  };

  const getSelectedAddonsForPerson = (recipe: any, person: "A" | "B") => {
    return (recipe?.frequentAddons || [])
      .map((addon: any) => ({
        ...addon,
        amount: Number(selectedFrequentAddons?.[person]?.[addon.ingredientId] || 0),
      }))
      .filter((addon: any) => addon.amount > 0);
  };

  const suggestedRecipeOptionsForAdd = useMemo(() => {
    if (!selectedRecipeToAdd) return [] as { recipe: any; servings: number }[];

    const structured = (selectedRecipeToAdd?.suggestedRecipes || [])
      .map((item: any) => ({ recipeId: Number(item?.recipeId), servings: Number(item?.servings) || 1 }))
      .filter((item: any) => Number.isFinite(item.recipeId) && item.recipeId > 0);

    const legacy = (selectedRecipeToAdd?.suggestedRecipeIds || [])
      .map((id: any) => ({ recipeId: Number(id), servings: 1 }))
      .filter((item: any) => Number.isFinite(item.recipeId) && item.recipeId > 0);

    const entries = structured.length > 0 ? structured : legacy;
    return entries
      .map((entry: any) => ({
        recipe: (recipes || []).find((candidate: any) => Number(candidate?.id) === Number(entry.recipeId)),
        servings: entry.servings,
      }))
      .filter((entry: any) => !!entry.recipe);
  }, [selectedRecipeToAdd, recipes]);

  const handleAdd = (recipeId: number, recipe?: any) => {
    if (!selectedMealType || !selectedDateStr) return;

    const createEntryWithAddons = (person: "A" | "B", onSuccess?: () => void) => addEntry({
      date: selectedDateStr,
      recipeId,
      mealType: selectedMealType,
      person,
      isEaten: false,
      servings: selectedRecipeServings,
    }, {
      onSuccess: async (entry) => {
        const selectedAddons = getSelectedAddonsForPerson(recipe, person);

        if (!recipe || selectedAddons.length === 0) {
          const selectedSuggestions = suggestedRecipeOptionsForAdd
            .filter((item: any) => Number(selectedSuggestedRecipes[String(item.recipe.id)] || 0) > 0)
            .map((item: any) => ({ recipeId: Number(item.recipe.id), servings: Number(selectedSuggestedRecipes[String(item.recipe.id)] || 0) }));
          for (const suggestion of selectedSuggestions) {
            await new Promise<void>((resolve) => {
              addEntry({
                date: selectedDateStr,
                recipeId: suggestion.recipeId,
                mealType: selectedMealType,
                person,
                isEaten: false,
                servings: suggestion.servings,
              }, { onSuccess: () => resolve(), onError: () => resolve() });
            });
          }
          onSuccess?.();
          return;
        }

        const mergedIngredients = (recipe.ingredients || []).map((ri: any) => ({
          ingredientId: ri.ingredientId,
          amount: Number(ri.amount) || 0,
        }));

        selectedAddons.forEach((addon: any) => {
          mergedIngredients.push({
            ingredientId: addon.ingredientId,
            amount: Number(addon.amount) || 0,
          });
        });

        updateMealEntry({
          id: entry.id,
          updates: {
            ingredients: mergedIngredients,
            servings: selectedRecipeServings,
          },
        }, {
          onSuccess: async () => {
            const selectedSuggestions = suggestedRecipeOptionsForAdd
              .filter((item: any) => Number(selectedSuggestedRecipes[String(item.recipe.id)] || 0) > 0)
              .map((item: any) => ({ recipeId: Number(item.recipe.id), servings: Number(selectedSuggestedRecipes[String(item.recipe.id)] || 0) }));
            for (const suggestion of selectedSuggestions) {
              await new Promise<void>((resolve) => {
                addEntry({
                  date: selectedDateStr,
                  recipeId: suggestion.recipeId,
                  mealType: selectedMealType,
                  person,
                  isEaten: false,
                  servings: suggestion.servings,
                }, { onSuccess: () => resolve(), onError: () => resolve() });
              });
            }
            onSuccess?.();
          },
        });
      }
    });

    if (addRecipeForBothPeople) {
      const otherPerson: "A" | "B" = selectedPerson === "A" ? "B" : "A";
      createEntryWithAddons(selectedPerson, () => {
        createEntryWithAddons(otherPerson, closeAddDialog);
      });
      return;
    }

    createEntryWithAddons(selectedPerson, closeAddDialog);
  };



  const increaseAddonAmount = (addon: any, person: "A" | "B") => {
    const addonStep = getAddonBaseAmount(addon);
    if (addonStep <= 0) return;

    setSelectedFrequentAddons((prev) => ({
      ...prev,
      [person]: {
        ...(prev?.[person] || {}),
        [addon.ingredientId]: ((prev?.[person] || {})[addon.ingredientId] || 0) + addonStep,
      },
    }));
  };

  const decreaseAddonAmount = (addon: any, person: "A" | "B") => {
    const addonStep = getAddonBaseAmount(addon);
    if (addonStep <= 0) return;

    setSelectedFrequentAddons((prev) => {
      const personAddons = prev?.[person] || {};
      const current = personAddons[addon.ingredientId] || 0;
      const nextAmount = Math.max(0, current - addonStep);
      if (nextAmount === 0) {
        const { [addon.ingredientId]: _removed, ...rest } = personAddons;
        return {
          ...prev,
          [person]: rest,
        };
      }

      return {
        ...prev,
        [person]: {
          ...personAddons,
          [addon.ingredientId]: nextAmount,
        },
      };
    });
  };

  const setAddonAmount = (ingredientId: number, amount: number, person: "A" | "B") => {
    setSelectedFrequentAddons((prev) => {
      const personAddons = prev?.[person] || {};
      const nextAmount = Math.max(0, Math.round(amount));
      if (nextAmount === 0) {
        const { [ingredientId]: _removed, ...rest } = personAddons;
        return {
          ...prev,
          [person]: rest,
        };
      }

      return {
        ...prev,
        [person]: {
          ...personAddons,
          [ingredientId]: nextAmount,
        },
      };
    });
  };

  const handleAddCustom = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    if (!selectedMealType || !selectedDateStr) return;

    addEntry({
      date: selectedDateStr,
      mealType: selectedMealType,
      person: selectedPerson,
      customName: formData.get("name") as string,
      customCalories: parseInt(formData.get("calories") as string),
      customProtein: parseFloat(formData.get("protein") as string),
      customCarbs: parseFloat(formData.get("carbs") as string),
      customFat: parseFloat(formData.get("fat") as string),
      isEaten: true,
      recipeId: null as any,
    }, {
      onSuccess: () => {
        setIsCustomOpen(false);
        setSelectedMealType(null);
        setSelectedDateStr(null);
      }
    });
  };

  const handleAddIngredient = () => {
    if (!selectedMealType || !selectedDateStr || !selectedIngredientId || ingredientAmount <= 0 || !allAvailableIngredients) return;

    const ingredient = allAvailableIngredients.find((i: any) => i.id === selectedIngredientId);
    if (!ingredient) return;

    const factor = ingredientAmount / 100;

    addEntry({
      date: selectedDateStr,
      mealType: selectedMealType,
      person: selectedPerson,
      customName: ingredient.name,
      customCalories: Math.round((ingredient.calories || 0) * factor),
      customProtein: Number(((ingredient.protein || 0) * factor).toFixed(1)),
      customCarbs: Number(((ingredient.carbs || 0) * factor).toFixed(1)),
      customFat: Number(((ingredient.fat || 0) * factor).toFixed(1)),
      servings: 1,
      isEaten: false,
      recipeId: null as any,
    }, {
      onSuccess: (entry) => {
        updateMealEntry({
          id: entry.id,
          updates: {
            ingredients: [{ ingredientId: selectedIngredientId, amount: Math.round(ingredientAmount) }],
            servings: 1,
          },
        }, {
          onSuccess: () => {
            setIsIngredientOpen(false);
            setSelectedMealType(null);
            setSelectedDateStr(null);
          }
        });
      }
    });
  };

  const handleCopyDay = () => {
    if (!copySourceDate || !copyTargetDate) {
      toast({ title: "Błąd", description: "Wybierz dzień źródłowy i docelowy.", variant: "destructive" });
      return;
    }

    if (copySourceDate === copyTargetDate) {
      toast({ title: "Błąd", description: "Wybierz różne dni.", variant: "destructive" });
      return;
    }

    copyDayPlan({ sourceDate: copySourceDate, targetDate: copyTargetDate });
  };

  const getAllocationForm = (batchId: number) => allocationForms[batchId] || {
    date: format(new Date(), "yyyy-MM-dd"),
    mealType: "lunch",
    person: "A" as "A" | "B",
    servings: 1,
  };

  const updateAllocationForm = (batchId: number, updates: Partial<{ date: string; mealType: string; person: "A" | "B"; servings: number }>) => {
    setAllocationForms((prev) => ({
      ...prev,
      [batchId]: { ...getAllocationForm(batchId), ...updates },
    }));
  };

  const allocateFromBatch = (batch: any) => {
    const form = getAllocationForm(batch.id);
    const person = form.person;
    const servings = Math.max(0.25, Number(form.servings) || 1);
    const addonsForPerson = selectedFrequentAddons[person] || {};

    if (servings > Number(batch.remainingServings || 0)) {
      toast({ title: "Za dużo", description: "Liczba porcji przekracza pulę pozostałych porcji.", variant: "destructive" });
      return;
    }

    addEntry({
      date: form.date,
      recipeId: Number(batch.recipeId),
      mealType: form.mealType,
      person,
      servings,
      cookedBatchId: Number(batch.id),
    } as any, {
      onSuccess: async (entry) => {
        const selectedAddons = (batch?.recipe?.frequentAddons || [])
          .map((addon: any) => ({
            ingredientId: Number(addon.ingredientId),
            amount: Number(addonsForPerson[addon.ingredientId] || 0),
          }))
          .filter((addon: any) => addon.amount > 0);

        if (selectedAddons.length === 0) {
          queryClient.invalidateQueries({ queryKey: [api.sharedMeals.list.path] });
          toast({ title: "Dodano", description: "Porcje zostały dodane do planu." });
          return;
        }

        const baseIngredients = (batch?.recipe?.ingredients || []).map((ri: any) => ({
          ingredientId: Number(ri.ingredientId),
          amount: Number(ri.amount) || 0,
        }));

        updateMealEntry({
          id: entry.id,
          updates: {
            ingredients: [...baseIngredients, ...selectedAddons],
            servings,
          },
        }, {
          onSuccess: () => {
            setSelectedFrequentAddons((prev) => ({
              ...prev,
              [person]: {},
            }));
            queryClient.invalidateQueries({ queryKey: [api.sharedMeals.list.path] });
            toast({ title: "Dodano", description: "Porcje i dodatki zostały dodane do planu." });
          },
        });
      },
    });
  };

  const filteredIngredients = useMemo(() => {
    if (!allAvailableIngredients) return [];
    if (!ingredientSearch.trim()) return allAvailableIngredients;
    return allAvailableIngredients.filter((ingredient: any) =>
      ingredient.name.toLowerCase().includes(ingredientSearch.toLowerCase())
    );
  }, [allAvailableIngredients, ingredientSearch]);

  return (
    <Layout>
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold">Plan Tygodniowy</h1>
        <div className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-white p-2 shadow-sm sm:w-auto sm:justify-start sm:gap-4">
          <button onClick={() => setBaseDate(d => subDays(d, 7))} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="min-w-0 flex-1 text-center text-sm font-semibold tabular-nums sm:w-48 sm:flex-none sm:text-base">
            {format(weekDays[0], "d MMM", { locale: pl })} - {format(weekDays[6], "d MMM, yyyy", { locale: pl })}
          </span>
          <button onClick={() => setBaseDate(d => addDays(d, 7))} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="mb-4 inline-flex rounded-xl border bg-white p-1 shadow-sm">
        <Button variant={activeView === "plan" ? "default" : "ghost"} size="sm" onClick={() => setActiveView("plan")}>Plan tygodniowy</Button>
        <Button variant={activeView === "shared" ? "default" : "ghost"} size="sm" onClick={() => setActiveView("shared")}><Soup className="mr-1 h-4 w-4" />Wspólne posiłki</Button>
      </div>

      {activeView === "plan" && (
      <>
      <section className="mb-6 rounded-2xl border border-border/60 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 flex-1">
            <div className="space-y-1">
              <label className="text-sm font-medium">Kopiuj z dnia</label>
              <Input
                type="date"
                value={copySourceDate}
                onChange={(e) => setCopySourceDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Wklej do dnia</label>
              <Input
                type="date"
                value={copyTargetDate}
                onChange={(e) => setCopyTargetDate(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={handleCopyDay} disabled={isCopyingDay} className="md:min-w-[220px]">
            <Copy className="mr-2 h-4 w-4" />
            {isCopyingDay ? "Kopiowanie..." : "Kopiuj cały dzień"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Skopiowanie zastępuje plan docelowego dnia wpisami z dnia źródłowego dla Tysi i Matiego.
        </p>
      </section>

      <div className="flex flex-col gap-12">
        {weekDays.map((day) => (
          <DaySection 
            key={day.toISOString()} 
            day={day}
            sectionId={`day-${format(day, "yyyy-MM-dd")}`} 
            recipes={recipes}
            onAddMeal={handleOpenAdd}
            onAddCustom={handleOpenCustom}
            onAddIngredient={handleOpenIngredient}
            onDeleteMeal={(params: any) => deleteEntry(params)}
            onToggleEaten={(params: any) => toggleEaten(params)}
            onUpdateEntry={(id: number, updates: any) => updateMealEntry({ id, updates })}
            onViewRecipe={(recipe: any) => setViewingRecipe(recipe)}
            onViewPlannedRecipe={(recipe: any, meal: any, options?: { shared?: boolean }) => {
              setViewingRecipe(recipe);
              setViewingMeal(meal);
              setViewingServings(meal.servings);
              setIsSharedRecipeView(!!options?.shared);
            }}
          />
        ))}
      </div>
      </>
      )}

      {activeView === "shared" && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-border/60 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold mb-3">Nowe gotowanie wspólnego posiłku</h2>
            <div className="grid gap-3 md:grid-cols-4">
              <select className="h-10 rounded-md border px-3" value={sharedRecipeId || ""} onChange={(e) => setSharedRecipeId(Number(e.target.value) || 0)}>
                <option value="">Wybierz przepis</option>
                {(recipes || []).map((recipe: any) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
              </select>
              <Input type="number" min={0.25} step={0.25} value={sharedTotalServings} onChange={(e) => setSharedTotalServings(Math.max(0.25, Number(e.target.value) || 1))} placeholder="Liczba porcji" />
              <Input value={sharedNote} onChange={(e) => setSharedNote(e.target.value)} placeholder="Notatka (opcjonalnie)" />
              <Button disabled={!sharedRecipeId || createSharedBatch.isPending} onClick={() => createSharedBatch.mutate()}>Dodaj do wspólnych</Button>
            </div>
          </div>

          <div className="space-y-3">
            {sharedBatches.length === 0 && <div className="text-sm text-muted-foreground">Brak aktywnych wspólnych posiłków.</div>}
            {sharedBatches.map((batch: any) => {
              const form = getAllocationForm(batch.id);
              const batchDate = form.date || format(new Date(), "yyyy-MM-dd");
              return (
                <div key={batch.id} className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{batch.recipe?.name}</p>
                      <p className="text-xs text-muted-foreground">Ugotowane: {Number(batch.totalServings) || 0} porcji • W planie: {Number(batch.allocatedServings) || 0} • Pozostało: <span className="font-semibold text-emerald-700">{Number(batch.remainingServings) || 0}</span></p>
                      {batch.note ? <p className="text-xs text-muted-foreground">{batch.note}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setViewingRecipe(batch.recipe);
                          setViewingMeal({
                            servings: Number(batch.totalServings) || 1,
                            ingredients: batch.recipe?.ingredients || [],
                            date: batchDate,
                          });
                          setViewingServings(Number(batch.totalServings) || 1);
                          setIsSharedRecipeView(true);
                          setIsViewingSharedDayRecipe(true);
                        }}
                      >
                        Pokaż przepis dnia
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => archiveBatch.mutate(batch.id)}>Archiwizuj</Button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-5">
                    <Input type="date" value={form.date} onChange={(e) => updateAllocationForm(batch.id, { date: e.target.value })} />
                    <select className="h-10 rounded-md border px-3" value={form.mealType} onChange={(e) => updateAllocationForm(batch.id, { mealType: e.target.value })}>
                      <option value="breakfast">Śniadanie</option><option value="lunch">Obiad</option><option value="dinner">Kolacja</option><option value="snack">Przekąska</option>
                    </select>
                    <select className="h-10 rounded-md border px-3" value={form.person} onChange={(e) => updateAllocationForm(batch.id, { person: (e.target.value as "A" | "B") })}>
                      <option value="A">Tysia</option><option value="B">Mati</option>
                    </select>
                    <Input type="number" min={0.25} step={0.25} value={form.servings} onChange={(e) => updateAllocationForm(batch.id, { servings: Math.max(0.25, Number(e.target.value) || 1) })} />
                    <Button disabled={(Number(batch.remainingServings) || 0) <= 0} onClick={() => allocateFromBatch(batch)}>Dodaj porcje do planu</Button>
                  </div>

                  {(batch?.recipe?.frequentAddons || []).length > 0 && (
                    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Dodatki wspólne dla {personName[form.person]}</p>
                        <button
                          type="button"
                          className="text-xs font-medium text-emerald-700 underline underline-offset-2"
                          onClick={() => setSelectedFrequentAddons((prev) => ({ ...prev, [form.person]: {} }))}
                        >
                          Wyczyść
                        </button>
                      </div>
                      <div className="space-y-2">
                        {(batch.recipe.frequentAddons || []).map((addon: any) => {
                          const addonStep = getAddonBaseAmount(addon);
                          const currentAmount = Number(selectedFrequentAddons[form.person]?.[addon.ingredientId] || 0);
                          return (
                            <div key={`shared-addon-${batch.id}-${form.person}-${addon.ingredientId}`} className="flex items-center justify-between gap-2 rounded-lg border border-emerald-100 bg-white p-2">
                              <span className="text-sm font-medium">{addon.ingredient?.name || "Składnik"}</span>
                              <div className="flex items-center gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAddonAmount(Number(addon.ingredientId), currentAmount - addonStep, form.person)}>
                                  <Minus className="h-3.5 w-3.5" />
                                </Button>
                                <Input
                                  type="number"
                                  min={0}
                                  step={Math.max(1, addonStep)}
                                  value={currentAmount}
                                  onChange={(e) => setAddonAmount(Number(addon.ingredientId), Number(e.target.value) || 0, form.person)}
                                  className="h-8 w-20 text-center"
                                />
                                <span className="text-xs text-muted-foreground">g</span>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAddonAmount(Number(addon.ingredientId), currentAmount + addonStep, form.person)}>
                                  <Plus className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <RecipeView 
        recipe={viewingRecipe}
        isOpen={!!viewingRecipe}
        onClose={() => {
          setViewingRecipe(null);
          setViewingMeal(null);
          setViewingServings(undefined);
          setIsSharedRecipeView(false);
          setIsViewingSharedDayRecipe(false);
        }}
        plannedServings={viewingServings}
        mealEntryIngredients={viewingMeal?.ingredients}
        frequentAddonIds={viewingRecipe?.frequentAddons?.map((addon: any) => addon.ingredientId) || []}
        availableIngredientIds={availableIngredientIds}
        onEditIngredients={viewingMeal ? startEditing : undefined}
        allowIngredientEditing={true}
        usePrecalculatedAmounts={isSharedRecipeView}
        showFooter={!viewingMeal && !isViewingSharedDayRecipe}
        onAddToPlan={(recipe) => {
          setViewingRecipe(null);
          setViewingServings(undefined);
          setIsSharedRecipeView(false);
          handleAdd(recipe.id);
        }}
      />

      <Dialog open={isEditingIngredients} onOpenChange={setIsEditingIngredients}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col bg-white sm:max-h-[90vh] max-sm:h-[100dvh] max-sm:max-h-none">
          <DialogHeader>
            <DialogTitle>Edytuj składniki posiłku</DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto py-4 space-y-4">
            {frequentAddonDefinitions.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Najczęstsze dodatki (opcjonalnie)</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {frequentAddonDefinitions.map((addon: any) => {
                    const isAlreadyAdded = editingMealIngredients.some((item: any) => Number(item.ingredientId) === Number(addon.ingredientId) && item.isFrequentAddon);
                    return (
                      <Button
                        key={`edit-addon-${addon.ingredientId}`}
                        type="button"
                        size="sm"
                        variant={isAlreadyAdded ? "secondary" : "outline"}
                        className={cn("h-8", isAlreadyAdded && "border-emerald-300 bg-emerald-100 text-emerald-900")}
                        onClick={() => addFrequentAddonToEdit(addon)}
                      >
                        + {Math.round(getAddonBaseAmount(addon))}g {addon.ingredient?.name || "Składnik"}
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
                  "flex gap-2 items-start bg-secondary/20 p-3 rounded-xl border border-transparent",
                  item.isFrequentAddon && "border-emerald-300 bg-emerald-50/50"
                )}
              >
                <div className="flex-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className={cn("w-full justify-between bg-white", !item.ingredientId && "text-muted-foreground")}
                      >
                        {item.ingredientId > 0 
                          ? allAvailableIngredients?.find((i: any) => i.id === item.ingredientId)?.name 
                          : "Wybierz składnik..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0">
                      <Command>
                        <CommandInput placeholder="Szukaj składnika..." />
                        <CommandList>
                          <CommandEmpty>Nie znaleziono składnika.</CommandEmpty>
                          <CommandGroup>
                            {allAvailableIngredients?.map((i: any) => (
                              <CommandItem
                                key={i.id}
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
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {item.isFrequentAddon && (
                    <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                      Najczęstszy dodatek
                    </span>
                  )}
                </div>
                
                <div className="w-32">
                  <div className="relative">
                    <Input
                      type="number"
                      value={item.amount}
                      onChange={(e) => updateIngredientInEdit(idx, { amount: e.target.value })}
                      className="bg-white pr-8"
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
                  className="text-destructive hover:text-destructive/80 hover:bg-destructive/10"
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

      <Dialog
        open={isAddOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeAddDialog();
            return;
          }
          setIsAddOpen(true);
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden sm:w-full sm:max-h-[90vh] max-sm:h-[100dvh] max-sm:w-screen max-sm:max-h-none max-sm:max-w-none max-sm:p-3">
          <DialogHeader>
            <DialogTitle className="break-words pr-8 text-base leading-snug sm:text-lg">Dodaj do posiłku: {
              selectedMealType === "breakfast" ? "Śniadanie" : 
              selectedMealType === "lunch" ? "Obiad" : 
              selectedMealType === "dinner" ? "Kolacja" : "Przekąska"
            } ({selectedDateStr}) • {personName[selectedPerson]}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2 sm:mt-4">
            <div className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="Szukaj przepisu..."
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              
              {allTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <Button
                    variant={selectedTag === null ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-[10px] px-2"
                    onClick={() => setSelectedTag(null)}
                  >
                    Wszystkie
                  </Button>
                  {allTags.map(tag => (
                    <Button
                      key={tag}
                      variant={selectedTag === tag ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-[10px] px-2"
                      onClick={() => setSelectedTag(tag)}
                    >
                      {tag}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-2 max-h-[50vh] overflow-y-auto pr-0 sm:pr-2">
              {filteredRecipes.length > 0 ? (
                filteredRecipes.map((recipe: any) => (
                  <button
                    key={recipe.id}
                    onClick={() => {
                      setSelectedRecipeToAdd(recipe);
                      setSelectedFrequentAddons({ A: {}, B: {} });
                      setAddRecipeForBothPeople(false);
                      setSelectedRecipeServings(1);
                      const initialSuggestions = ((recipe?.suggestedRecipes || []) as any[]).reduce((acc: Record<string, number>, item: any) => {
                        const recipeId = Number(item?.recipeId);
                        const servings = Number(item?.servings) || 0;
                        if (Number.isFinite(recipeId) && recipeId > 0 && servings > 0) acc[String(recipeId)] = servings;
                        return acc;
                      }, {});
                      setSelectedSuggestedRecipes(initialSuggestions);
                    }}
                    className="flex items-center gap-2 sm:gap-4 p-2.5 sm:p-3 rounded-xl hover:bg-secondary transition-colors text-left border border-transparent hover:border-border"
                  >
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-cover bg-center bg-muted flex-shrink-0" style={{ backgroundImage: `url(${recipe.imageUrl})` }} />
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{recipe.name}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-[11px] text-muted-foreground">{recipe.prepTime} min</p>
                        {recipe.tags?.map((tag: string) => (
                          <span key={tag} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground uppercase tracking-wider font-medium">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground italic text-sm">
                  Nie znaleziono przepisów spełniających kryteria
                </div>
              )}
            </div>

            {selectedRecipeToAdd && (
              <div className="space-y-3 rounded-xl border border-border/70 bg-secondary/20 p-3">
                <p className="text-sm font-semibold">Wybrany przepis: {selectedRecipeToAdd.name}</p>

                <div className="grid gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Porcje głównego przepisu</label>
                  <Input type="number" step="0.25" min={0.25} value={selectedRecipeServings} onChange={(e) => setSelectedRecipeServings(Math.max(0.25, Number(e.target.value) || 1))} className="h-8 w-28" />
                </div>

                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2 text-xs text-emerald-900">
                  <p className="font-semibold">Tip: gotowanie na kilka dni</p>
                  <p>
                    Ustaw tutaj łączną liczbę porcji, które ugotujesz za jednym razem (np. rosół: 6).
                    Potem rozpisz tę samą potrawę na różne dni i osoby, zmieniając porcje już w planie dnia.
                    Dodatki (np. pieczywo/pomidor) możesz ustawić osobno dla każdego wpisu.
                  </p>
                </div>

                {suggestedRecipeOptionsForAdd.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">A może chcesz dodać też ten przepis?</p>
                    <div className="space-y-2 rounded-xl border border-border/60 bg-white p-2">
                      {suggestedRecipeOptionsForAdd.map((item: any) => {
                        const key = String(item.recipe.id);
                        const amount = Number(selectedSuggestedRecipes[key] ?? 0);
                        return (
                          <div key={item.recipe.id} className="flex items-center gap-2">
                            <label className="flex items-center gap-2 text-sm flex-1">
                              <input
                                type="checkbox"
                                checked={amount > 0}
                                onChange={(e) => setSelectedSuggestedRecipes((prev) => ({
                                  ...prev,
                                  [key]: e.target.checked ? (amount > 0 ? amount : Number(item.servings) || 1) : 0,
                                }))}
                              />
                              <span>{item.recipe.name}</span>
                            </label>
                            <Input
                              type="number"
                              step="0.25"
                              min={0.25}
                              className="h-8 w-24"
                              disabled={amount <= 0}
                              value={amount > 0 ? amount : Number(item.servings) || 1}
                              onChange={(e) => {
                                const nextAmount = Math.max(0.25, Number(e.target.value) || Number(item.servings) || 1);
                                setSelectedSuggestedRecipes((prev) => ({ ...prev, [key]: nextAmount }));
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {(selectedRecipeToAdd.frequentAddons || []).length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground">Opcjonalne dodatki:</p>

                    <div className="flex flex-wrap gap-2">
                      {(selectedRecipeToAdd.frequentAddons || []).map((addon: any) => (
                        <div
                          key={addon.ingredientId}
                          className="flex items-center gap-1 rounded-full border border-border bg-white px-2 py-1"
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full"
                            onClick={() => decreaseAddonAmount(addon, selectedPerson)}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>

                          <button
                            type="button"
                            onClick={() => increaseAddonAmount(addon, selectedPerson)}
                            className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100"
                          >
                            + {Math.round(getAddonBaseAmount(addon))}g {addon.ingredient?.name || "Składnik"}
                          </button>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full"
                            onClick={() => increaseAddonAmount(addon, selectedPerson)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2">
                      {(selectedRecipeToAdd.frequentAddons || []).map((addon: any) => {
                        const selectedAmountA = selectedFrequentAddons.A[addon.ingredientId] || 0;
                        const selectedAmountB = selectedFrequentAddons.B[addon.ingredientId] || 0;
                        const baseAmount = getAddonBaseAmount(addon) || 1;
                        const repeatCountA = Math.round(selectedAmountA / baseAmount);
                        const repeatCountB = Math.round(selectedAmountB / baseAmount);

                        return (
                          <div
                            key={`selected-${addon.ingredientId}`}
                            className={cn(
                              "space-y-2 rounded-lg border bg-white p-2 transition-colors",
                              selectedAmountA > 0 || selectedAmountB > 0 ? "border-emerald-200" : "border-border"
                            )}
                          >
                            <span className="text-sm font-medium sm:min-w-[140px]">
                              {addon.ingredient?.name || "Składnik"}
                            </span>

                            {(["A", "B"] as const).map((person) => {
                              const selectedAmount = person === "A" ? selectedAmountA : selectedAmountB;
                              const repeatCount = person === "A" ? repeatCountA : repeatCountB;
                              return (
                                <div key={`${addon.ingredientId}-${person}`} className="flex flex-wrap items-center gap-2">
                                  <span className="w-12 text-xs font-semibold text-muted-foreground">{personName[person]}</span>

                                  <Button type="button" variant="outline" size="icon" className="h-7 w-7 sm:h-8 sm:w-8" onClick={() => decreaseAddonAmount(addon, person)}>
                                    <Minus className="h-4 w-4" />
                                  </Button>

                                  <Input
                                    type="number"
                                    min={0}
                                    value={selectedAmount}
                                    onChange={(e) => setAddonAmount(addon.ingredientId, Number(e.target.value) || 0, person)}
                                    className="h-7 sm:h-8 w-20 sm:w-24 text-xs sm:text-sm"
                                  />

                                  <span className="text-[11px] text-muted-foreground">g</span>

                                  <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => increaseAddonAmount(addon, person)}>
                                    <Plus className="h-4 w-4" />
                                  </Button>

                                  <span className="text-[11px] text-muted-foreground">x{Math.max(0, repeatCount)}</span>

                                  {selectedAmount > 0 && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground"
                                      onClick={() => setAddonAmount(addon.ingredientId, 0, person)}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={addRecipeForBothPeople}
                    onChange={(e) => setAddRecipeForBothPeople(e.target.checked)}
                  />
                  Dodaj ten przepis od razu dla obu osób
                </label>

                <DialogFooter>
                  <Button variant="ghost" onClick={closeAddDialog}>Anuluj</Button>
                  <Button onClick={() => handleAdd(selectedRecipeToAdd.id, selectedRecipeToAdd)}>
                    Dodaj do planu
                  </Button>
                </DialogFooter>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCustomOpen} onOpenChange={setIsCustomOpen}>
        <DialogContent className="max-sm:h-[100dvh] max-sm:w-screen max-sm:max-h-none max-sm:max-w-none max-sm:overflow-x-hidden max-sm:p-3">
          <DialogHeader>
            <DialogTitle>Dodaj własny produkt • {personName[selectedPerson]}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddCustom} className="grid gap-4 mt-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Nazwa</label>
              <input name="name" required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" placeholder="np. Przekąska na mieście" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Kalorie (kcal)</label>
                <input name="calories" type="number" required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Białko (g)</label>
                <input name="protein" type="number" step="0.1" required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Węglowodany (g)</label>
                <input name="carbs" type="number" step="0.1" required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Tłuszcze (g)</label>
                <input name="fat" type="number" step="0.1" required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
            </div>
            <Button type="submit">Dodaj własny produkt</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isIngredientOpen} onOpenChange={setIsIngredientOpen}>
        <DialogContent className="max-sm:h-[100dvh] max-sm:w-screen max-sm:max-h-none max-sm:max-w-none max-sm:overflow-x-hidden max-sm:p-3">
          <DialogHeader>
            <DialogTitle>Dodaj składnik do posiłku</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <Input
              value={ingredientSearch}
              onChange={(e) => setIngredientSearch(e.target.value)}
              placeholder="Szukaj składnika..."
            />

            <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
              {filteredIngredients.map((ingredient: any) => (
                <button
                  key={ingredient.id}
                  onClick={() => setSelectedIngredientId(ingredient.id)}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors",
                    selectedIngredientId === ingredient.id && "bg-primary/10 text-primary font-medium"
                  )}
                >
                  {ingredient.name}
                </button>
              ))}
              {filteredIngredients.length === 0 && (
                <p className="text-sm text-muted-foreground p-3">Brak składników.</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Ilość (g)</label>
              <Input
                type="number"
                min={1}
                value={ingredientAmount}
                onChange={(e) => setIngredientAmount(Number(e.target.value) || 0)}
              />
            </div>

            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              onClick={handleAddIngredient}
              disabled={!selectedIngredientId || ingredientAmount <= 0}
            >
              Dodaj składnik
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function DaySection({ day, sectionId, recipes, onAddMeal, onAddCustom, onAddIngredient, onDeleteMeal, onToggleEaten, onUpdateEntry, onViewRecipe, onViewPlannedRecipe }: any) {
  const [servingInputs, setServingInputs] = useState<Record<number, string>>({});
  const [selectedEntries, setSelectedEntries] = useState<Record<number, boolean>>({});
  const [draggedEntryId, setDraggedEntryId] = useState<number | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const dateStr = format(day, "yyyy-MM-dd");
  const { data: dayPlan, isLoading } = useDayPlan(dateStr);
  const isToday = dateStr === format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    setSelectedEntries({});
  }, [dateStr]);

  const getEffectiveIngredientAmount = (ri: any, entry: any) => {
    if (typeof ri?.calculatedAmount === "number") return ri.calculatedAmount;
    const entryServings = Number(entry?.servings) || 1;
    const recipeServings = Number(entry?.recipe?.servings) || 1;
    return calculateScaledAmount(ri, entryServings, recipeServings);
  };

  const calculateSummary = (entries: any[]) => {
    let calories = 0;
    let protein = 0;
    let carbs = 0;
    let fat = 0;
    let price = 0;

    entries.forEach((entry: any) => {
      const entryServings = Number(entry.servings) || 1;
      const ingredientsToUse = entry.ingredients?.length > 0 ? entry.ingredients : (entry.recipe?.ingredients || []);

      if (ingredientsToUse.length > 0) {
        const entryServings = Number(entry?.servings) || 1;
        const recipeServings = Number(entry?.recipe?.servings) || 1;
        const frequentAddonIds = new Set<number>(((entry?.recipe?.frequentAddons) || []).map((addon: any) => Number(addon.ingredientId)));
        const recipeIngredientCounts = (entry?.recipe?.ingredients || []).reduce((acc: Map<number, number>, ingredient: any) => {
          const id = Number(ingredient?.ingredientId);
          if (!Number.isFinite(id)) return acc;
          acc.set(id, (acc.get(id) || 0) + 1);
          return acc;
        }, new Map<number, number>());
        const occurrenceMap = new Map<number, number>();

        ingredientsToUse.forEach((ri: any) => {
          if (!ri.ingredient) return;
          const ingredientId = Number(ri.ingredientId);
          const occurrence = (occurrenceMap.get(ingredientId) || 0) + 1;
          occurrenceMap.set(ingredientId, occurrence);
          const recipeCount = recipeIngredientCounts.get(ingredientId) || 0;
          const isFrequentAddon = frequentAddonIds.has(ingredientId) && occurrence > recipeCount;
          const effectiveAmount = getEffectiveIngredientAmount(ri, entry);
          const multiplier = effectiveAmount / 100;
          calories += (ri.ingredient.calories || 0) * multiplier;
          protein += (ri.ingredient.protein || 0) * multiplier;
          carbs += (ri.ingredient.carbs || 0) * multiplier;
          fat += (ri.ingredient.fat || 0) * multiplier;
          price += (ri.ingredient.price || 0) * multiplier;
        });
      } else {
        calories += (entry.customCalories || 0) * entryServings;
        protein += (entry.customProtein || 0) * entryServings;
        carbs += (entry.customCarbs || 0) * entryServings;
        fat += (entry.customFat || 0) * entryServings;
        price += (entry.customPrice || 0) * entryServings;
      }
    });

    return {
      calories: Math.round(calories),
      protein: Math.round(protein),
      carbs: Math.round(carbs),
      fat: Math.round(fat),
      price: Math.round(price * 100) / 100,
    };
  };

  const people = ["A", "B"] as const;
  const personName: Record<"A" | "B", string> = { A: "Tysia", B: "Mati" };
  const personEntries = useMemo(() => ({
    A: dayPlan?.entries.filter((e: any) => (e.person || "A") === "A") || [],
    B: dayPlan?.entries.filter((e: any) => (e.person || "A") === "B") || [],
  }), [dayPlan]);

  const personSummary = useMemo(() => ({
    A: calculateSummary(personEntries.A),
    B: calculateSummary(personEntries.B),
  }), [personEntries]);

  const sharedEntries = useMemo(() => {
    const collectFrequentAddonAmounts = (entry: any) => {
      const addonTotals = new Map<number, { amount: number; ingredient: any }>();
      const ingredientsToUse = entry?.ingredients?.length > 0 ? entry.ingredients : [];
      if (ingredientsToUse.length === 0) return addonTotals;

      const frequentAddonIds = new Set<number>(((entry?.recipe?.frequentAddons) || []).map((addon: any) => Number(addon.ingredientId)));
      const recipeIngredientCounts = (entry?.recipe?.ingredients || []).reduce((acc: Map<number, number>, ingredient: any) => {
        const id = Number(ingredient?.ingredientId);
        if (!Number.isFinite(id)) return acc;
        acc.set(id, (acc.get(id) || 0) + 1);
        return acc;
      }, new Map<number, number>());
      const occurrenceMap = new Map<number, number>();

      ingredientsToUse.forEach((ri: any) => {
        const ingredientId = Number(ri?.ingredientId);
        if (!Number.isFinite(ingredientId)) return;

        const occurrence = (occurrenceMap.get(ingredientId) || 0) + 1;
        occurrenceMap.set(ingredientId, occurrence);

        const recipeCount = recipeIngredientCounts.get(ingredientId) || 0;
        const isFrequentAddon = frequentAddonIds.has(ingredientId) && occurrence > recipeCount;
        if (!isFrequentAddon) return;

        const effectiveAmount = getEffectiveIngredientAmount(ri, entry);
        if (effectiveAmount <= 0) return;

        const current = addonTotals.get(ingredientId);
        addonTotals.set(ingredientId, {
          amount: (current?.amount || 0) + effectiveAmount,
          ingredient: ri?.ingredient || current?.ingredient || null,
        });
      });

      return addonTotals;
    };

    const collectFixedRecipeIngredientAmounts = (entry: any) => {
      const totals = new Map<number, { amount: number; ingredient: any }>();
      const ingredientsToUse = entry?.ingredients?.length > 0 ? entry.ingredients : [];
      if (ingredientsToUse.length === 0) return totals;

      const recipeIngredientCounts = (entry?.recipe?.ingredients || []).reduce((acc: Map<number, number>, ingredient: any) => {
        const id = Number(ingredient?.ingredientId);
        if (!Number.isFinite(id)) return acc;
        acc.set(id, (acc.get(id) || 0) + 1);
        return acc;
      }, new Map<number, number>());
      const occurrenceMap = new Map<number, number>();

      ingredientsToUse.forEach((ri: any) => {
        const ingredientId = Number(ri?.ingredientId);
        if (!Number.isFinite(ingredientId)) return;

        const occurrence = (occurrenceMap.get(ingredientId) || 0) + 1;
        occurrenceMap.set(ingredientId, occurrence);

        const recipeCount = recipeIngredientCounts.get(ingredientId) || 0;
        if (occurrence > recipeCount) return;

        const sourceIngredients = (entry?.recipe?.ingredients || []).filter((source: any) => Number(source?.ingredientId) === ingredientId);
        const source = sourceIngredients[occurrence - 1] || sourceIngredients[0];
        if ((source?.scalingType || "LINEAR") !== "FIXED") return;

        const effectiveAmount = getEffectiveIngredientAmount(ri, entry);
        if (effectiveAmount <= 0) return;

        const current = totals.get(ingredientId);
        totals.set(ingredientId, {
          amount: (current?.amount || 0) + effectiveAmount,
          ingredient: ri?.ingredient || current?.ingredient || null,
        });
      });

      return totals;
    };

    const sharedMap = new Map<string, { A: any; B: any }>();

    personEntries.A.forEach((entry: any) => {
      if (!entry.recipeId) return;
      const key = `${entry.mealType}__${entry.recipeId}`;
      sharedMap.set(key, { A: entry, B: null as any });
    });

    personEntries.B.forEach((entry: any) => {
      if (!entry.recipeId) return;
      const key = `${entry.mealType}__${entry.recipeId}`;
      const current = sharedMap.get(key);
      if (current?.A) {
        current.B = entry;
        sharedMap.set(key, current);
      }
    });

    return Array.from(sharedMap.values())
      .filter((pair) => pair.A && pair.B)
      .map((pair) => {
        const recipeServings = Number(pair.A?.recipe?.servings) || 1;
        const totalServings = (Number(pair.A?.servings) || 1) + (Number(pair.B?.servings) || 1);
        const sourceIngredients = pair.A?.recipe?.ingredients || [];

        const scaledIngredients = sourceIngredients.map((ri: any) => {
          const scaledAmount = calculateScaledAmount(ri, totalServings, recipeServings);
          return {
            ...ri,
            amount: scaledAmount,
            calculatedAmount: scaledAmount,
          };
        });

        if (Math.abs(recipeServings - 1) < 0.000001) {
          const fixedTotals = collectFixedRecipeIngredientAmounts(pair.A);
          collectFixedRecipeIngredientAmounts(pair.B).forEach((fixed, ingredientId) => {
            const existing = fixedTotals.get(ingredientId);
            fixedTotals.set(ingredientId, {
              amount: (existing?.amount || 0) + fixed.amount,
              ingredient: existing?.ingredient || fixed.ingredient || null,
            });
          });

          scaledIngredients.forEach((ri: any) => {
            if ((ri?.scalingType || "LINEAR") !== "FIXED") return;
            const fixed = fixedTotals.get(Number(ri.ingredientId));
            if (!fixed) return;
            ri.amount = fixed.amount;
            ri.calculatedAmount = fixed.amount;
            if (!ri.ingredient && fixed.ingredient) {
              ri.ingredient = fixed.ingredient;
            }
          });
        }

        const addonsA = collectFrequentAddonAmounts(pair.A);
        const addonsB = collectFrequentAddonAmounts(pair.B);
        const addonTotals = new Map<number, { amount: number; ingredient: any; byPerson: { A: number; B: number } }>();

        addonsA.forEach((addon, ingredientId) => {
          addonTotals.set(ingredientId, {
            amount: addon.amount,
            ingredient: addon.ingredient || null,
            byPerson: { A: addon.amount, B: 0 },
          });
        });

        addonsB.forEach((addon, ingredientId) => {
          const existing = addonTotals.get(ingredientId);
          addonTotals.set(ingredientId, {
            amount: (existing?.amount || 0) + addon.amount,
            ingredient: existing?.ingredient || addon.ingredient || null,
            byPerson: {
              A: existing?.byPerson?.A || 0,
              B: (existing?.byPerson?.B || 0) + addon.amount,
            },
          });
        });

        addonTotals.forEach((addon, ingredientId) => {
          const existingIngredient = scaledIngredients.find((ri: any) => Number(ri.ingredientId) === ingredientId);
          if (existingIngredient) {
            const nextAmount = (Number(existingIngredient.amount) || 0) + addon.amount;
            existingIngredient.amount = nextAmount;
            existingIngredient.calculatedAmount = nextAmount;
            existingIngredient.sharedAddonAmounts = addon.byPerson;
            if (!existingIngredient.ingredient && addon.ingredient) {
              existingIngredient.ingredient = addon.ingredient;
            }
            return;
          }

          scaledIngredients.push({
            ingredientId,
            amount: addon.amount,
            calculatedAmount: addon.amount,
            ingredient: addon.ingredient,
            scalingType: "FIXED",
            baseAmount: addon.amount,
            sharedAddonAmounts: addon.byPerson,
          });
        });

        return {
          mealType: pair.A.mealType,
          recipe: pair.A.recipe,
          servings: totalServings,
          ingredients: scaledIngredients,
          entryA: pair.A,
          entryB: pair.B,
        };
      });
  }, [personEntries]);

  const applyServingInput = (entry: any) => {
    const rawValue = servingInputs[entry.id];
    if (rawValue === undefined) return;

    const parsed = Number(rawValue.replace(",", "."));
    if (!parsed || parsed <= 0) {
      setServingInputs((prev) => {
        const next = { ...prev };
        delete next[entry.id];
        return next;
      });
      return;
    }

    const rounded = Math.round(parsed * 100) / 100;
    onUpdateEntry(entry.id, { servings: rounded });
    setServingInputs((prev) => {
      const next = { ...prev };
      delete next[entry.id];
      return next;
    });
  };

  const dayEntries = dayPlan?.entries || [];
  const selectedEntryIds = Object.entries(selectedEntries)
    .filter(([, checked]) => checked)
    .map(([id]) => Number(id))
    .filter((id) => Number.isFinite(id));

  const deleteEntries = (entryIds: number[]) => {
    entryIds.forEach((id) => onDeleteMeal({ id, date: dateStr }));
    setSelectedEntries((prev) => {
      const next = { ...prev };
      entryIds.forEach((id) => {
        delete next[id];
      });
      return next;
    });
  };

  const clearPersonDay = (person: "A" | "B") => {
    const ids = dayEntries
      .filter((entry: any) => (entry.person || "A") === person)
      .map((entry: any) => Number(entry.id))
      .filter((id: number) => Number.isFinite(id));
    deleteEntries(ids);
  };

  const clearWholeDay = () => {
    const ids = dayEntries
      .map((entry: any) => Number(entry.id))
      .filter((id: number) => Number.isFinite(id));
    deleteEntries(ids);
  };

  const handleDropEntry = (targetMealType: string, targetPerson: "A" | "B") => {
    if (!draggedEntryId) return;
    onUpdateEntry(draggedEntryId, { date: dateStr, mealType: targetMealType, person: targetPerson });
    setDraggedEntryId(null);
    setDragOverSlot(null);
  };

  return (
    <div id={sectionId} className={cn("space-y-6", isToday && "bg-primary/5 -mx-4 px-4 py-8 rounded-3xl border border-primary/10")}>
      <div className="flex flex-col md:flex-row md:items-baseline gap-4 mb-4">
        <div className="flex flex-wrap items-baseline gap-2 sm:gap-4">
          <h2 className="text-2xl font-bold font-display">{format(day, "EEEE", { locale: pl })}</h2>
          <span className="text-muted-foreground">{format(day, "d MMMM", { locale: pl })}</span>
          {isToday && <span className="text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-1 rounded-full">Dzisiaj</span>}
        </div>

        {dayEntries.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={selectedEntryIds.length === 0}
              onClick={() => deleteEntries(selectedEntryIds)}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Usuń zaznaczone ({selectedEntryIds.length})
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={() => clearPersonDay("A")}>Wyczyść dzień Tysi</Button>
            <Button variant="outline" size="sm" className="h-8" onClick={() => clearPersonDay("B")}>Wyczyść dzień Matiego</Button>
            <Button variant="destructive" size="sm" className="h-8" onClick={clearWholeDay}>Wyczyść cały dzień</Button>
          </div>
        )}

        {dayPlan && (
          <div className="w-full grid grid-cols-1 xl:grid-cols-2 gap-4">
            {people.map((person) => (
              <div key={person} className="rounded-2xl border border-border/60 bg-white/60 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold">{personName[person]}</span>
                  <span className="text-[11px] text-muted-foreground">Koszt dnia: {personSummary[person].price.toFixed(2)} PLN</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="flex flex-col items-center bg-white px-3 py-1 rounded-xl border border-border shadow-sm min-w-[70px]">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">kcal</span>
                    <span className="text-sm font-bold text-primary">{personSummary[person].calories}</span>
                  </div>
                  <div className="flex flex-col items-center bg-white px-3 py-1 rounded-xl border border-border shadow-sm min-w-[60px]">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">P</span>
                    <span className="text-sm font-bold text-blue-600">{personSummary[person].protein}g</span>
                  </div>
                  <div className="flex flex-col items-center bg-white px-3 py-1 rounded-xl border border-border shadow-sm min-w-[60px]">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">C</span>
                    <span className="text-sm font-bold text-amber-600">{personSummary[person].carbs}g</span>
                  </div>
                  <div className="flex flex-col items-center bg-white px-3 py-1 rounded-xl border border-border shadow-sm min-w-[60px]">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">F</span>
                    <span className="text-sm font-bold text-rose-600">{personSummary[person].fat}g</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stabilized render tree for dual-person meal plan layout */}
      {isLoading ? <LoadingSpinner /> : (
        <div className="space-y-5">
          {sharedEntries.length > 0 && (
            <div id="shared-meals" className="space-y-2 rounded-2xl border border-emerald-200/70 bg-emerald-50/40 p-3">
              <div className="text-sm font-bold text-emerald-800 uppercase tracking-wider">Wspólne posiłki (Tysia + Mati)</div>
              <div className="space-y-1.5">
                {sharedEntries.map((shared: any, idx: number) => (
                  <div key={`shared-${shared.mealType}-${shared.recipe?.id}-${idx}`} className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm truncate">{shared.recipe?.name}</p>
                      <button
                        onClick={() => {
                          const hasModifiedPortions = [shared.entryA, shared.entryB].some((entry: any) => (entry?.ingredients || []).length > 0);
                          if (hasModifiedPortions && !window.confirm("Porcje Tysi lub Matiego mają już własne zmiany składników. Edycja wspólnego przepisu nadpisze te zmiany po rozdzieleniu ilości na osoby. Kontynuować?")) {
                            return;
                          }
                          onViewPlannedRecipe(shared.recipe, { ...shared.entryA, servings: shared.servings, ingredients: shared.ingredients, sharedEntryA: shared.entryA, sharedEntryB: shared.entryB }, { shared: true });
                        }}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title="Podgląd wspólny"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {people.map((person) => (
            <div key={person} className="space-y-2">
              <div className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{personName[person]}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {["breakfast", "lunch", "dinner", "snack"].map((mealType) => {
                  const entries = dayPlan?.entries.filter((e: any) => e.mealType === mealType && (e.person || "A") === person) || [];

                  return (
                    <div
                      key={`${person}-${mealType}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverSlot(`${person}-${mealType}`);
                      }}
                      onDragLeave={() => setDragOverSlot((prev) => (prev === `${person}-${mealType}` ? null : prev))}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDropEntry(mealType, person);
                      }}
                      className={cn(
                        "bg-white rounded-2xl p-4 shadow-sm border border-border/50 flex flex-col min-h-[200px] transition-colors",
                        dragOverSlot === `${person}-${mealType}` && "border-primary/60 bg-primary/5"
                      )}
                    >
                      <div className="flex items-center justify-between mb-4 border-b border-border/50 pb-2">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                          {mealType === "breakfast" ? "Śniadanie" : mealType === "lunch" ? "Obiad" : mealType === "dinner" ? "Kolacja" : "Przekąska"}
                        </h3>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => onAddIngredient(mealType, dateStr, person)} title="Dodaj składnik">
                            <Carrot className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={() => onAddCustom(mealType, dateStr, person)} title="Add Custom">
                            <Plus className="w-3 h-3 border rounded-full p-0.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={() => onAddMeal(mealType, dateStr, person)} title="Add Recipe">
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-3 flex-1">
                        {entries.map((entry: any) => (
                          <div
                            key={entry.id}
                            draggable
                            onDragStart={() => setDraggedEntryId(Number(entry.id))}
                            onDragEnd={() => {
                              setDraggedEntryId(null);
                              setDragOverSlot(null);
                            }}
                            className={cn(
                              "group relative flex items-center gap-3 bg-background p-2 rounded-xl border border-border cursor-grab active:cursor-grabbing",
                              draggedEntryId === Number(entry.id) && "opacity-60"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={!!selectedEntries[entry.id]}
                              onChange={(e) => setSelectedEntries((prev) => ({ ...prev, [entry.id]: e.target.checked }))}
                              aria-label={`Zaznacz posiłek ${entry.recipe?.name || entry.customName}`}
                              className="h-4 w-4"
                            />
                            {entry.recipe ? (
                              <div className="w-10 h-10 rounded-lg bg-cover bg-center flex-shrink-0" style={{ backgroundImage: `url(${entry.recipe.imageUrl})` }} />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                                <Plus className="w-5 h-5 text-muted-foreground/30" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className={cn("text-sm font-semibold truncate", entry.isEaten && "line-through text-muted-foreground")}>
                                  {entry.recipe?.name || entry.customName}
                                </p>
                                {entry.recipe && (
                                  <button onClick={() => onViewPlannedRecipe(entry.recipe, entry)} className="text-muted-foreground hover:text-primary transition-colors">
                                    <Eye className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                              {!entry.recipe && (
                                <p className="text-[10px] text-muted-foreground">
                                  {entry.ingredients?.length ? `${entry.ingredients[0]?.amount || 0} g` : "Custom Item"}
                                </p>
                              )}
                              <div className="flex items-center gap-1 mt-1">
                                {!entry.recipe && entry.ingredients?.length ? (
                                  <>
                                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => {
                                      const currentAmount = Number(entry.ingredients[0]?.amount) || 0;
                                      const nextAmount = Math.max(1, currentAmount - 10);
                                      onUpdateEntry(entry.id, { ingredients: [{ ingredientId: entry.ingredients[0].ingredientId, amount: nextAmount }] });
                                    }}>
                                      <Minus className="h-3 w-3" />
                                    </Button>
                                    <span className="text-[10px] font-medium text-center min-w-[42px]">{entry.ingredients[0]?.amount || 0} g</span>
                                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => {
                                      const currentAmount = Number(entry.ingredients[0]?.amount) || 0;
                                      onUpdateEntry(entry.id, { ingredients: [{ ingredientId: entry.ingredients[0].ingredientId, amount: currentAmount + 10 }] });
                                    }}>
                                      <Plus className="h-3 w-3" />
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0 rounded-full" onClick={() => onUpdateEntry(entry.id, { servings: Math.max(0.5, (Number(entry.servings) || 1) - 0.5) })}>
                                      <Minus className="h-3 w-3" />
                                    </Button>
                                    <div className="flex items-center gap-1 min-w-0">
                                      <Input
                                        type="number"
                                        inputMode="decimal"
                                        min={0.5}
                                        step={0.5}
                                        className="h-5 w-10 sm:w-12 text-[10px] font-medium px-1 py-0 text-center"
                                        value={servingInputs[entry.id] ?? String(Number(entry.servings) || 1)}
                                        onChange={(e) => setServingInputs((prev) => ({ ...prev, [entry.id]: e.target.value }))}
                                        onBlur={() => applyServingInput(entry)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.currentTarget.blur();
                                          }
                                        }}
                                        aria-label="Liczba porcji"
                                      />
                                      {entry.recipe && (
                                        <span className="text-[8px] sm:text-[9px] font-medium text-muted-foreground whitespace-nowrap">/ {Number(entry.recipe.servings) || 1}</span>
                                      )}
                                    </div>
                                    <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0 rounded-full" onClick={() => onUpdateEntry(entry.id, { servings: (Number(entry.servings) || 1) + 0.5 })}>
                                      <Plus className="h-3 w-3" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center">
                              <button onClick={() => onToggleEaten({ id: entry.id, isEaten: !entry.isEaten })} className={cn("p-1 rounded-md transition-colors", entry.isEaten ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-muted")}>
                                {entry.isEaten ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                              </button>

                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <button className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-all p-1">
                                    <X className="w-4 h-4" />
                                  </button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remove from plan?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Remove "{entry.recipe?.name || entry.customName}" from {format(day, "EEEE", { locale: pl })}'s plan?
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => onDeleteMeal({ id: entry.id, date: dateStr })} className="bg-red-500 hover:bg-red-600">
                                      Remove
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        ))}

                        {entries.length === 0 && (
                          <div className="flex items-center justify-center h-full text-muted-foreground/30 italic text-xs py-4">
                            Empty
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        )}
      {/* End of DaySection content */}
    </div>
  );
}
