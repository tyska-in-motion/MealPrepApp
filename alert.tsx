import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, ChefHat, CalendarPlus, Settings2, Play, Pause, RotateCcw, ChefHatIcon } from "lucide-react";
import { calculateScaledAmount } from "@shared/scaling";
import type { InstructionStep } from "@shared/schema";
import { parseInstructionLines } from "@/lib/instruction-steps";

const parseDurationFromStep = (step: string) => {
  const explicitTimer = step.match(/\[timer\s*:\s*(\d+)\]/i);
  if (explicitTimer) return Number(explicitTimer[1]);

  const naturalLanguage = step.match(/(\d+)\s*(min|minut|minuty|minute|minutes)/i);
  return naturalLanguage ? Number(naturalLanguage[1]) : 0;
};

interface RecipeViewProps {
  recipe: any;
  isOpen: boolean;
  onClose: () => void;
  onAddToPlan: (recipe: any, servingsOverride?: number) => void;
  allRecipes?: any[];
  plannedServings?: number;
  onEditIngredients?: () => void;
  onPlannedServingsChange?: (servings: number) => void;
  showFooter?: boolean;
  mealEntryIngredients?: any[];
  frequentAddonIds?: number[];
  availableIngredientIds?: number[];
  allowIngredientEditing?: boolean;
  usePrecalculatedAmounts?: boolean;
}

export function RecipeView({ 
  recipe, 
  isOpen, 
  onClose, 
  onAddToPlan, 
  allRecipes = [],
  plannedServings, 
  onEditIngredients,
  onPlannedServingsChange,
  showFooter = true,
  mealEntryIngredients,
  frequentAddonIds = [],
  availableIngredientIds = [],
  allowIngredientEditing = true,
  usePrecalculatedAmounts = false,
}: RecipeViewProps) {
  const [isCookingMode, setIsCookingMode] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [timerRemainingSeconds, setTimerRemainingSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  const instructionSteps = useMemo<InstructionStep[]>(() => {
    if (Array.isArray(recipe?.instructionSteps) && recipe.instructionSteps.length > 0) return recipe.instructionSteps;
    return parseInstructionLines(recipe?.instructions).map((step) => ({ segments: [{ type: "text", text: step }] }));
  }, [recipe?.instructionSteps, recipe?.instructions]);

  const isPlannedView = plannedServings !== undefined;
  const recipeServings = Number(recipe?.servings) || 1;
  const servingsToUse = isPlannedView ? plannedServings : recipeServings;
  
  // Use entry-specific ingredients if provided (for Meal Plan/Dashboard view of a planned meal)
  const baseIngredients = (mealEntryIngredients && mealEntryIngredients.length > 0) 
    ? mealEntryIngredients 
    : (recipe?.ingredients || []);

  const frequentAddonSet = new Set((frequentAddonIds || []).map((id) => Number(id)));
  const availableIngredientSet = new Set((availableIngredientIds || []).map((id) => Number(id)));
  const recipeIngredientCounts = useMemo(() => {
    const counts = new Map<number, number>();
    (recipe?.ingredients || []).forEach((ri: any) => {
      const id = Number(ri?.ingredientId);
      if (!Number.isFinite(id)) return;
      counts.set(id, (counts.get(id) || 0) + 1);
    });
    return counts;
  }, [recipe?.ingredients]);

  const ingredientRows = useMemo(() => {
    const seen = new Map<number, number>();
    return baseIngredients.map((ri: any) => {
      const id = Number(ri?.ingredientId);
      const nextOccurrence = (seen.get(id) || 0) + 1;
      seen.set(id, nextOccurrence);
      const isFrequentAddonId = frequentAddonSet.has(id);
      const recipeCount = recipeIngredientCounts.get(id) || 0;
      const isFrequentAddon = isFrequentAddonId && nextOccurrence > recipeCount;

      const matchingRecipeIngredients = (recipe?.ingredients || []).filter((item: any) => Number(item?.ingredientId) === id);
      const matchingFrequentAddons = (recipe?.frequentAddons || []).filter((item: any) => Number(item?.ingredientId) === id);
      const sourceCandidates = [...matchingRecipeIngredients, ...matchingFrequentAddons];
      const source = sourceCandidates[nextOccurrence - 1] || sourceCandidates[0] || {};

      const scalingIngredient = {
        ...source,
        ...ri,
        baseAmount: Number(ri?.baseAmount ?? ri?.amount ?? source?.baseAmount ?? source?.amount ?? 0) || 0,
        scalingType: ri?.scalingType ?? source?.scalingType ?? "LINEAR",
        scalingFormula: ri?.scalingFormula ?? source?.scalingFormula,
        stepThresholds: ri?.stepThresholds ?? source?.stepThresholds,
      };

      return { ri, isFrequentAddon, scalingIngredient };
    });
  }, [baseIngredients, frequentAddonSet, recipeIngredientCounts, recipe?.ingredients, recipe?.frequentAddons]);

  const suggestedRecipes = useMemo(() => {
    const structured = ((recipe?.suggestedRecipes || []) as any[])
      .map((item: any) => ({ recipeId: Number(item?.recipeId), servings: Number(item?.servings) || 1 }))
      .filter((item: any) => Number.isFinite(item.recipeId) && item.recipeId > 0);

    const legacy = (recipe?.suggestedRecipeIds || [])
      .map((id: any) => ({ recipeId: Number(id), servings: 1 }))
      .filter((item: any) => Number.isFinite(item.recipeId) && item.recipeId > 0);

    const candidates = structured.length > 0 ? structured : legacy;

    return candidates
      .map((item: any) => ({
        recipe: (allRecipes || []).find((candidate: any) => Number(candidate?.id) === Number(item.recipeId)),
        servings: item.servings,
      }))
      .filter((entry: any) => !!entry.recipe);
  }, [recipe?.suggestedRecipes, recipe?.suggestedRecipeIds, allRecipes]);

  const currentStep = instructionSteps[currentStepIndex];
  const currentStepText = (currentStep?.segments || []).map((segment: any) => segment.text).join("") || "";
  const currentStepDurationMinutes = parseDurationFromStep(currentStepText);

  useEffect(() => {
    if (!isOpen) {
      setIsCookingMode(false);
      setCurrentStepIndex(0);
      setTimerRemainingSeconds(0);
      setIsTimerRunning(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isCookingMode || !isTimerRunning || timerRemainingSeconds <= 0) {
      if (timerRemainingSeconds <= 0) setIsTimerRunning(false);
      return;
    }

    const interval = window.setInterval(() => {
      setTimerRemainingSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isCookingMode, isTimerRunning, timerRemainingSeconds]);

  useEffect(() => {
    if (!isCookingMode || !("wakeLock" in navigator)) return;

    let wakeLock: any;
    const requestWakeLock = async () => {
      try {
        wakeLock = await (navigator as any).wakeLock.request("screen");
      } catch {
        // Ignore if the browser blocks Wake Lock API.
      }
    };

    requestWakeLock();

    return () => {
      if (wakeLock) {
        wakeLock.release().catch(() => undefined);
      }
    };
  }, [isCookingMode]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
    const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  };

  const getScaledAmount = (ri: any, isFrequentAddon = false, scalingIngredient?: any) => {
    if (usePrecalculatedAmounts && typeof ri?.calculatedAmount === "number" && Number.isFinite(ri.calculatedAmount)) {
      return ri.calculatedAmount;
    }

    if (!isPlannedView && typeof ri?.calculatedAmount === "number" && Number.isFinite(ri.calculatedAmount)) {
      return ri.calculatedAmount;
    }

    const ingredientForScaling = scalingIngredient || ri;
    return calculateScaledAmount(ingredientForScaling, servingsToUse, recipeServings);
  };

  const formatAmount = (value: number) => {
    if (!Number.isFinite(value)) return "0";
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(".", ",");
  };

  const updateServings = (nextValue: number) => {
    if (!isPlannedView || !onPlannedServingsChange) return;
    const safeValue = Math.max(0.5, Math.round(nextValue * 2) / 2);
    onPlannedServingsChange(safeValue);
  };

  const getIngredientAmountLabel = (ri: any, isFrequentAddon = false, scalingIngredient?: any) => {
    const grams = getScaledAmount(ri, isFrequentAddon, scalingIngredient);
    const altAmountRaw = Number(ri?.alternativeAmount);
    const altUnit = (ri?.alternativeUnit || "").trim();

    if (altAmountRaw > 0 && altUnit) {
      const scaledAlternativeAmount = (altAmountRaw * grams) / ((Number(ri?.baseAmount) || Number(ri?.amount) || grams) || 1);
      return `${formatAmount(scaledAlternativeAmount)} ${altUnit} (${formatAmount(grams)}${ri.unit || "g"})`;
    }

    return `${formatAmount(grams)}${ri.unit || "g"}`;
  };


  const getSharedAddonPersonInfo = (ri: any, isFrequentAddon = false) => {
    if (!isFrequentAddon) return null;

    const ty = Number(ri?.sharedAddonAmounts?.A);
    const ma = Number(ri?.sharedAddonAmounts?.B);
    if (!Number.isFinite(ty) && !Number.isFinite(ma)) return null;

    const unit = ri?.unit || ri?.ingredient?.unit || "g";
    const tyLabel = `${formatAmount(Number.isFinite(ty) ? ty : 0)}${unit}`;
    const maLabel = `${formatAmount(Number.isFinite(ma) ? ma : 0)}${unit}`;

    return `Tysia: ${tyLabel} • Mati: ${maLabel}`;
  };


  const getCookingModeIngredientLabel = (segment: { text: string; ingredientId: number; ingredientIds?: number[]; ingredientSource?: "ingredient" | "frequentAddon"; multiplier?: number }) => {
    const multiplier = typeof segment.multiplier === "number" && segment.multiplier > 0 ? segment.multiplier : 1;
    const ingredientIds = (segment.ingredientIds && segment.ingredientIds.length > 0)
      ? segment.ingredientIds
      : [segment.ingredientId];

    const labels = ingredientIds
      .map((id) => ingredientRows.find(({ ri, isFrequentAddon }: any) =>
        Number(ri.ingredientId) === Number(id) &&
        (segment.ingredientSource === "frequentAddon" ? isFrequentAddon : !isFrequentAddon)
      ))
      .filter(Boolean)
      .map((ingredientRow: any) => {
        const amount = getScaledAmount(ingredientRow.ri, segment.ingredientSource === "frequentAddon", ingredientRow.scalingIngredient) * multiplier;
        const unit = ingredientRow.ri.unit || ingredientRow.ri.ingredient?.unit || "g";
        return `${ingredientRow.ri.ingredient?.name || segment.text}-${formatAmount(amount)}${unit}`;
      });

    if (labels.length === 0) return segment.text;
    return labels.join(", ");
  };

  const nutritionTotals = useMemo(() => {
    const totals = ingredientRows.reduce((sum: { calories: number; protein: number; carbs: number; fat: number }, row: any) => {
      if (!row.ri?.ingredient) return sum;
      const amount = getScaledAmount(row.ri, row.isFrequentAddon, row.scalingIngredient);
      return {
        calories: sum.calories + ((Number(row.ri.ingredient.calories) || 0) * amount / 100),
        protein: sum.protein + ((Number(row.ri.ingredient.protein) || 0) * amount / 100),
        carbs: sum.carbs + ((Number(row.ri.ingredient.carbs) || 0) * amount / 100),
        fat: sum.fat + ((Number(row.ri.ingredient.fat) || 0) * amount / 100),
      };
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

    const divisor = isPlannedView ? (Number(servingsToUse) || 1) : (Number(recipeServings) || 1);
    const safeDivisor = divisor > 0 ? divisor : 1;

    return {
      total: totals,
      perServing: {
        calories: totals.calories / safeDivisor,
        protein: totals.protein / safeDivisor,
        carbs: totals.carbs / safeDivisor,
        fat: totals.fat / safeDivisor,
      },
    };
  }, [ingredientRows, isPlannedView, servingsToUse, recipeServings]);

  if (!recipe) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setIsCookingMode(false);
          onClose();
        }
      }}
    >
      <DialogContent className={isCookingMode ? "max-w-3xl h-[92vh] overflow-hidden bg-white p-3 sm:p-4" : "max-w-3xl max-h-[90vh] overflow-y-auto bg-white"}>
        {isCookingMode ? (
          <div className="h-full flex flex-col gap-3">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-base sm:text-lg"><ChefHatIcon className="w-4 h-4 sm:w-5 sm:h-5" /> Tryb gotowania</span>
                <Button size="sm" variant="outline" onClick={() => setIsCookingMode(false)}>Wyjdź</Button>
              </DialogTitle>
            </DialogHeader>

            <div className="rounded-2xl bg-secondary/30 p-3 sm:p-4 text-center space-y-2">
              <p className="text-xs sm:text-sm text-muted-foreground">Krok {Math.min(currentStepIndex + 1, instructionSteps.length)} / {instructionSteps.length || 1}</p>
              <p className="text-lg sm:text-2xl font-bold leading-snug">
                {(currentStep?.segments || []).length > 0 ? currentStep.segments.map((segment: any, idx: number) => (
                  segment.type === "ingredient" ? (
                    <span
                      key={`${segment.ingredientId}-${idx}`}
                      className="inline rounded-full bg-primary/10 text-primary px-2 py-0.5 mx-0.5"
                    >{getCookingModeIngredientLabel(segment)}</span>
                  ) : <span key={`${segment.text}-${idx}`}>{segment.text}</span>
                )) : "Brak kroków. Dodaj instrukcje do przepisu."}
              </p>
              {currentStepDurationMinutes > 0 && (
                <p className="text-xs sm:text-sm text-muted-foreground">Wykryto timer: {currentStepDurationMinutes} min</p>
              )}
            </div>

            <div className="rounded-2xl border p-3 sm:p-4 space-y-2">
              <p className="text-3xl sm:text-4xl font-bold text-center tabular-nums">{formatTime(timerRemainingSeconds)}</p>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  className="h-11 sm:h-12 text-sm sm:text-base"
                  onClick={() => {
                    if (timerRemainingSeconds === 0 && currentStepDurationMinutes > 0) {
                      setTimerRemainingSeconds(currentStepDurationMinutes * 60);
                    }
                    setIsTimerRunning((prev) => !prev);
                  }}
                  disabled={currentStepDurationMinutes <= 0 && timerRemainingSeconds <= 0}
                >
                  {isTimerRunning ? <Pause className="w-5 h-5 mr-2" /> : <Play className="w-5 h-5 mr-2" />}
                  {isTimerRunning ? "Pauza" : "Start"}
                </Button>
                <Button
                  variant="outline"
                  className="h-11 sm:h-12 text-sm sm:text-base"
                  onClick={() => {
                    setIsTimerRunning(false);
                    setTimerRemainingSeconds(currentStepDurationMinutes * 60);
                  }}
                  disabled={currentStepDurationMinutes <= 0}
                >
                  <RotateCcw className="w-5 h-5 mr-2" />
                  Reset
                </Button>
                <Button
                  variant="outline"
                  className="h-11 sm:h-12 text-sm sm:text-base"
                  onClick={() => {
                    setIsTimerRunning(false);
                    setTimerRemainingSeconds(0);
                  }}
                >
                  Stop
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-auto">
              <Button
                variant="outline"
                className="h-12 sm:h-14 text-base sm:text-lg font-semibold"
                onClick={() => {
                  const prevIndex = Math.max(currentStepIndex - 1, 0);
                  setCurrentStepIndex(prevIndex);
                  setIsTimerRunning(false);
                  const prevStepText = (instructionSteps[prevIndex]?.segments || []).map((segment: any) => segment.text).join("");
                  setTimerRemainingSeconds(parseDurationFromStep(prevStepText || "") * 60);
                }}
                disabled={currentStepIndex <= 0}
              >
                Poprzedni krok
              </Button>
              <Button
                className="h-12 sm:h-14 text-base sm:text-lg font-bold"
                onClick={() => {
                  const nextIndex = Math.min(currentStepIndex + 1, Math.max(instructionSteps.length - 1, 0));
                  setCurrentStepIndex(nextIndex);
                  setIsTimerRunning(false);
                  const nextStepText = (instructionSteps[nextIndex]?.segments || []).map((segment: any) => segment.text).join("");
                  setTimerRemainingSeconds(parseDurationFromStep(nextStepText || "") * 60);
                }}
                disabled={currentStepIndex >= Math.max(instructionSteps.length - 1, 0)}
              >
                Następny krok
              </Button>
            </div>

          </div>
        ) : (
        <div className="space-y-6">
          <div 
            className="h-64 rounded-2xl bg-cover bg-center"
            style={{ backgroundImage: `url(${recipe.imageUrl || 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800'})` }}
          />
          <div>
            <h2 className="text-3xl font-bold font-display">{recipe.name}</h2>
            <div className="flex flex-wrap gap-1 mt-2">
              {recipe.tags?.map((tag: string, i: number) => (
                <span key={i} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-lg font-bold">
                  {tag}
                </span>
              ))}
            </div>
            <div className="flex gap-4 mt-2 text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1 bg-secondary/50 px-2 py-1 rounded-lg text-xs"><Clock className="w-4 h-4" /> {recipe.prepTime} min</span>
              <span className="flex items-center gap-1 bg-secondary/50 px-2 py-1 rounded-lg text-xs"><ChefHat className="w-4 h-4" /> {baseIngredients.length} składników</span>
              <span className="flex items-center gap-1 bg-primary/10 text-primary font-bold px-2 py-1 rounded-lg text-xs">
                {isPlannedView ? `${servingsToUse} zaplanowanych porcji` : `${recipeServings} porcji`}
              </span>
              {isPlannedView && onPlannedServingsChange && (
                <div className="flex items-center gap-1 bg-secondary/60 px-2 py-1 rounded-lg text-xs">
                  <button
                    className="h-5 w-5 rounded-full border border-border text-[11px] leading-none"
                    onClick={() => updateServings(servingsToUse - 0.5)}
                    title="Zmniejsz porcje"
                  >
                    −
                  </button>
                  <span className="font-semibold min-w-12 text-center">{formatAmount(servingsToUse)}</span>
                  <button
                    className="h-5 w-5 rounded-full border border-border text-[11px] leading-none"
                    onClick={() => updateServings(servingsToUse + 0.5)}
                    title="Zwiększ porcje"
                  >
                    +
                  </button>
                </div>
              )}
              {!isPlannedView && (
                <span className="flex items-center gap-1 bg-amber-100/60 text-amber-900 font-semibold px-2 py-1 rounded-lg text-xs">
                  {`${Math.round(nutritionTotals.perServing.calories)} kcal / porcja`}
                </span>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-4 gap-4 p-4 bg-secondary/30 rounded-2xl text-center">
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Kalorie</p>
              <p className="text-xl font-bold text-primary">
                {Math.round(nutritionTotals.perServing.calories)}
              </p>
              <p className="text-[8px] text-muted-foreground">na porcję</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Białko</p>
              <p className="text-xl font-bold">
                {Math.round(nutritionTotals.perServing.protein)}g
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Węgle</p>
              <p className="text-xl font-bold">
                {Math.round(nutritionTotals.perServing.carbs)}g
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Tłuszcz</p>
              <p className="text-xl font-bold">
                {Math.round(nutritionTotals.perServing.fat)}g
              </p>
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold">Składniki</h3>
                <div className="flex items-center gap-2">
                  {onEditIngredients && allowIngredientEditing && (
                    <Button variant="ghost" size="sm" onClick={onEditIngredients} className="text-primary hover:text-primary/80 h-7 text-xs">
                      <Settings2 className="w-3 h-3 mr-1" />
                      Edytuj składniki
                    </Button>
                  )}
                </div>
              </div>
              <ul className="space-y-2">
                {ingredientRows.map(({ ri, isFrequentAddon, scalingIngredient }: any, idx: number) => {
                  const isAvailable = availableIngredientSet.has(Number(ri.ingredientId));
                  const ingredientItemClass = isFrequentAddon
                    ? "border-emerald-300 bg-emerald-50/70"
                    : isAvailable
                      ? "border-sky-300 bg-sky-50/80"
                      : "border-transparent bg-secondary/50";

                  return (
                  <li
                    key={idx}
                    className={`flex flex-col p-2 rounded-lg border ${ingredientItemClass}`}
                  >
                    <div className="flex justify-between items-center gap-2">
                      <span className="font-semibold">
                        {ri.ingredient?.name}
                        {isAvailable && !isFrequentAddon && (
                          <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
                            Posiadam
                          </span>
                        )}
                        {isFrequentAddon && (
                          <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                            Dodatek
                          </span>
                        )}
                      </span>
                      <span className="font-medium">
                        {getIngredientAmountLabel(ri, isFrequentAddon, scalingIngredient)}
                      </span>
                    </div>
                    {(() => {
                      const sharedInfo = getSharedAddonPersonInfo(ri, isFrequentAddon);
                      if (!sharedInfo) return null;
                      return (
                        <span className="text-[10px] text-emerald-700">
                          {sharedInfo}
                        </span>
                      );
                    })()}
                    {Number(ri.ingredient?.unitWeight || 0) > 0 && (
                      <span className="text-[10px] text-muted-foreground italic">
                        ({ri.ingredient.unitDescription ? `${ri.ingredient.unitDescription} - ` : ""}1 sztuka to ok. {ri.ingredient.unitWeight}g)
                      </span>
                    )}
                  </li>
                );
                })}
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-bold mb-3">Instrukcje</h3>
              {instructionSteps.length > 0 ? (
                <ol className="list-decimal pl-5 space-y-1 text-muted-foreground leading-relaxed">
                  {instructionSteps.map((step: InstructionStep, idx: number) => (
                    <li key={`step-${idx}`}>
                      {step.segments.map((segment: any, segmentIdx: number) => (
                        segment.type === "ingredient" ? (
                          <span
                            key={`${segment.ingredientId}-${segmentIdx}`}
                            className="inline rounded-full bg-primary/10 text-primary px-2 py-0.5 mx-0.5"
                          >{segment.text}</span>
                        ) : <span key={`${segment.text}-${segmentIdx}`}>{segment.text}</span>
                      ))}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed">Brak instrukcji.</p>
              )}
              {instructionSteps.length > 0 && (
                <Button className="mt-4" onClick={() => {
                  setCurrentStepIndex(0);
                  const firstStepText = (instructionSteps[0]?.segments || []).map((segment: any) => segment.text).join("");
                  setTimerRemainingSeconds(parseDurationFromStep(firstStepText) * 60);
                  setIsTimerRunning(false);
                  setIsCookingMode(true);
                }}>
                  <ChefHatIcon className="w-4 h-4 mr-2" />
                  Uruchom cooking mode
                </Button>
              )}
            </div>
          </div>

          {suggestedRecipes.length > 0 && (
            <div>
              <h3 className="text-lg font-bold mb-3">Sugerowane dodatki (inne przepisy)</h3>
              <div className="flex flex-wrap gap-2">
                {suggestedRecipes.map((suggestion: any) => (
                  <Button
                    key={suggestion.recipe.id}
                    variant="outline"
                    className="h-8"
                    onClick={() => onAddToPlan(suggestion.recipe, suggestion.servings)}
                  >
                    <CalendarPlus className="w-3 h-3 mr-1" />
                    {suggestion.recipe.name} ({formatAmount(suggestion.servings)} por.)
                  </Button>
                ))}
              </div>
            </div>
          )}
          {showFooter && (
            <DialogFooter>
              <Button 
                className="w-full sm:w-auto gap-2"
                onClick={() => onAddToPlan(recipe)}
              >
                <CalendarPlus className="w-4 h-4" />
                Dodaj do planu
              </Button>
            </DialogFooter>
          )}
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
