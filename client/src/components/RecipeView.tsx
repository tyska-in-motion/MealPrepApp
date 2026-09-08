import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, ChefHat, CalendarPlus, Settings2, Play, Pause, RotateCcw, ChefHatIcon, CalendarClock } from "lucide-react";
import { calculateNutritionAmount, calculateScaledAmount } from "@shared/scaling";
import type { InstructionStep } from "@shared/schema";
import { getDisplayInstructionSteps } from "@/lib/instruction-steps";

const stripTimerTag = (text: string) => text.replace(/\s*\[timer\s*:[^\]]+\]/gi, "").trim();

const parseTimerFromStep = (step: string) => {
  const naturalLanguage = step.match(/(\d+(?:[.,]\d+)?)\s*(minut|minuty|minuta|godzin|godziny|godzina|h)\b/i);
  if (!naturalLanguage) {
    return { durationMinutes: 0, name: "" };
  }

  const parsedValue = Number(String(naturalLanguage[1]).replace(",", "."));
  const unit = naturalLanguage[2].toLowerCase();
  const naturalMinutes = unit.startsWith("godz") || unit === "h" ? parsedValue * 60 : parsedValue;

  const explicitTimer = step.match(/\[timer\s*:\s*([^\]]+)\]/i);
  let explicitDurationMinutes = 0;
  let timerName = "";
  if (explicitTimer?.[1]) {
    const parts = explicitTimer[1]
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);

    parts.forEach((part) => {
      const asNumber = Number(part.replace(",", "."));
      if (Number.isFinite(asNumber) && asNumber > 0) {
        explicitDurationMinutes = asNumber;
      } else if (!timerName) {
        timerName = part;
      }
    });
  }

  return {
    durationMinutes: explicitDurationMinutes > 0 ? explicitDurationMinutes : naturalMinutes,
    name: timerName,
  };
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
  allowIngredientEditing?: boolean;
  usePrecalculatedAmounts?: boolean;
  switchPlannedPersonLabel?: string;
  onSwitchPlannedPerson?: () => void;
  servingsLockedReason?: string;
  onRestoreOriginalIngredients?: () => void;
  compact?: boolean;
}

interface CookingStepTimer {
  stepIndex: number;
  name: string;
  initialSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
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
  allowIngredientEditing = true,
  usePrecalculatedAmounts = false,
  switchPlannedPersonLabel,
  onSwitchPlannedPerson,
  servingsLockedReason,
  onRestoreOriginalIngredients,
  compact = false,
}: RecipeViewProps) {
  const [isCookingMode, setIsCookingMode] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepTimers, setStepTimers] = useState<CookingStepTimer[]>([]);

  const instructionSteps = useMemo<InstructionStep[]>(() => getDisplayInstructionSteps(recipe), [recipe?.instructionSteps, recipe?.instructions]);

  const isPlannedView = plannedServings !== undefined;
  const recipeServings = Number(recipe?.servings) || 1;
  const servingsToUse = isPlannedView ? plannedServings : recipeServings;
  
  // Use entry-specific ingredients if provided (for Meal Plan/Dashboard view of a planned meal)
  const baseIngredients = (mealEntryIngredients && mealEntryIngredients.length > 0) 
    ? mealEntryIngredients 
    : (recipe?.ingredients || []);

  const frequentAddonSet = new Set((frequentAddonIds || []).map((id) => Number(id)));
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

      const resolvedIngredient = ri?.ingredient || source?.ingredient || null;
      const resolvedUnit = ri?.unit || source?.unit || resolvedIngredient?.unit || "g";
      const displayIngredient = {
        ...ri,
        groupName: ri?.groupName ?? source?.groupName ?? null,
        ingredient: resolvedIngredient,
        unit: resolvedUnit,
        alternativeAmount: ri?.alternativeAmount ?? source?.alternativeAmount,
        alternativeUnit: ri?.alternativeUnit ?? source?.alternativeUnit,
      };
      const scalingIngredient = {
        ...source,
        ...ri,
        ingredient: resolvedIngredient,
        unit: resolvedUnit,
        baseAmount: Number(ri?.baseAmount ?? ri?.amount ?? source?.baseAmount ?? source?.amount ?? 0) || 0,
        scalingType: ri?.scalingType ?? source?.scalingType ?? "LINEAR",
        scalingFormula: ri?.scalingFormula ?? source?.scalingFormula,
        stepThresholds: ri?.stepThresholds ?? source?.stepThresholds,
      };

      return { ri: displayIngredient, isFrequentAddon, scalingIngredient, sourceIngredient: source };
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
  const recipeComment = (recipe?.comments || "").trim();
  const currentStepText = (currentStep?.segments || []).map((segment: any) => segment.text).join("") || "";
  const currentStepTimerDetails = parseTimerFromStep(currentStepText);
  const currentStepDurationMinutes = currentStepTimerDetails.durationMinutes;
  const currentStepTimerName = currentStepTimerDetails.name || `Krok ${currentStepIndex + 1}`;
  const currentStepTimer = stepTimers.find((timer) => timer.stepIndex === currentStepIndex);
  const hasCurrentStepTimerDefinition = currentStepDurationMinutes > 0;
  const timerRemainingSeconds = currentStepTimer?.remainingSeconds ?? (hasCurrentStepTimerDefinition ? currentStepDurationMinutes * 60 : 0);
  const isTimerRunning = currentStepTimer?.isRunning ?? false;

  useEffect(() => {
    if (!isOpen) {
      setIsCookingMode(false);
      setCurrentStepIndex(0);
      setStepTimers([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isCookingMode) {
      return;
    }

    const interval = window.setInterval(() => {
      setStepTimers((prev) =>
        prev.map((timer) => {
          if (!timer.isRunning) return timer;
          const nextRemaining = Math.max(0, timer.remainingSeconds - 1);
          return {
            ...timer,
            remainingSeconds: nextRemaining,
            isRunning: nextRemaining > 0 ? timer.isRunning : false,
          };
        })
      );
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isCookingMode]);

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
    const hasPrecalculatedAmount = typeof ri?.calculatedAmount === "number" && Number.isFinite(ri.calculatedAmount);
    const hasPerPersonSharedBreakdown = !!ri?.sharedAddonAmounts && typeof ri.sharedAddonAmounts === "object";

    if ((usePrecalculatedAmounts || hasPerPersonSharedBreakdown) && hasPrecalculatedAmount) {
      return ri.calculatedAmount;
    }

    if (!isPlannedView && hasPrecalculatedAmount) {
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
    const source = scalingIngredient || ri;
    const altAmountRaw = Number(source?.alternativeAmount ?? ri?.alternativeAmount);
    const altUnit = String(source?.alternativeUnit ?? ri?.alternativeUnit ?? "").trim();
    const baseAmount = Number(source?.baseAmount ?? ri?.baseAmount ?? source?.amount ?? ri?.amount ?? grams) || grams;
    const unit = source?.unit || ri?.unit || "g";

    if (altAmountRaw > 0 && altUnit) {
      const scaledAlternativeAmount = (altAmountRaw * grams) / (baseAmount || 1);
      return `${formatAmount(scaledAlternativeAmount)} ${altUnit} (${formatAmount(grams)}${unit})`;
    }

    return `${formatAmount(grams)}${unit}`;
  };


  const getSharedAddonPersonInfo = (ri: any) => {
    const ty = Number(ri?.sharedAddonAmounts?.A);
    const ma = Number(ri?.sharedAddonAmounts?.B);
    if (!Number.isFinite(ty) && !Number.isFinite(ma)) return null;

    const unit = ri?.unit || ri?.ingredient?.unit || "g";
    const tyLabel = `${formatAmount(Number.isFinite(ty) ? ty : 0)}${unit}`;
    const maLabel = `${formatAmount(Number.isFinite(ma) ? ma : 0)}${unit}`;

    return `Mati: ${maLabel} • Tysia: ${tyLabel}`;
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
        const source = ingredientRow.scalingIngredient || ingredientRow.ri;
        const sourceIngredient = ingredientRow.sourceIngredient || {};
        const altAmountRaw = Number(
          ingredientRow.ri?.alternativeAmount
          ?? source?.alternativeAmount
          ?? sourceIngredient?.alternativeAmount
        );
        const altUnit = String(
          ingredientRow.ri?.alternativeUnit
          ?? source?.alternativeUnit
          ?? sourceIngredient?.alternativeUnit
          ?? ""
        ).trim();
        const baseAmount = Number(
          ingredientRow.ri?.baseAmount
          ?? source?.baseAmount
          ?? sourceIngredient?.baseAmount
          ?? ingredientRow.ri?.amount
          ?? source?.amount
          ?? sourceIngredient?.amount
          ?? amount
        ) || amount;
        const scaledAlternativeAmount = altAmountRaw > 0 && altUnit
          ? (altAmountRaw * amount) / (baseAmount || 1)
          : null;

        const alternativeLabel = scaledAlternativeAmount !== null
          ? ` (${formatAmount(scaledAlternativeAmount)} ${altUnit})`
          : "";

        return `${ingredientRow.ri.ingredient?.name || segment.text} - ${formatAmount(amount)}${unit}${alternativeLabel}`;
      });

    if (labels.length === 0) return segment.text;
    return labels.join(", ");
  };

  const nutritionTotals = useMemo(() => {
    const totals = ingredientRows.reduce((sum: { calories: number; protein: number; carbs: number; fat: number }, row: any) => {
      const ingredient = row.ri?.ingredient || row.scalingIngredient?.ingredient;
      if (!ingredient) return sum;
      const amount = getScaledAmount(row.ri, row.isFrequentAddon, row.scalingIngredient);
      const nutritionAmount = calculateNutritionAmount(amount, ingredient);
      return {
        calories: sum.calories + ((Number(ingredient.calories) || 0) * nutritionAmount / 100),
        protein: sum.protein + ((Number(ingredient.protein) || 0) * nutritionAmount / 100),
        carbs: sum.carbs + ((Number(ingredient.carbs) || 0) * nutritionAmount / 100),
        fat: sum.fat + ((Number(ingredient.fat) || 0) * nutritionAmount / 100),
      };
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

    const divisor = Number(recipeServings) || 1;
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
  }, [ingredientRows, recipeServings, servingsToUse, usePrecalculatedAmounts]);

  const displayedNutrition = isPlannedView ? nutritionTotals.total : nutritionTotals.perServing;
  const nutritionScopeLabel = isPlannedView ? "łącznie" : "na porcję";

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
      <DialogContent
        className={isCookingMode
          ? "max-w-3xl h-[92vh] overflow-hidden bg-white p-3 sm:p-4 max-sm:left-1/2 max-sm:top-1/2 max-sm:h-[calc(100dvh-1rem)] max-sm:w-[calc(100vw-1rem)] max-sm:max-w-[calc(100vw-1rem)] max-sm:translate-x-[-50%] max-sm:translate-y-[-50%] max-sm:rounded-2xl"
          : compact
            ? "max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden bg-white p-3 sm:p-4 max-sm:left-1/2 max-sm:top-1/2 max-sm:h-[calc(100dvh-1rem)] max-sm:w-[calc(100vw-1rem)] max-sm:max-w-[calc(100vw-1rem)] max-sm:translate-x-[-50%] max-sm:translate-y-[-50%] max-sm:rounded-2xl max-sm:p-2"
            : "max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden bg-white max-sm:left-1/2 max-sm:top-1/2 max-sm:h-[calc(100dvh-1rem)] max-sm:w-[calc(100vw-1rem)] max-sm:max-w-[calc(100vw-1rem)] max-sm:translate-x-[-50%] max-sm:translate-y-[-50%] max-sm:rounded-2xl max-sm:p-3"
        }
      >
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
                    >{stripTimerTag(getCookingModeIngredientLabel(segment))}</span>
                  ) : <span key={`${segment.text}-${idx}`}>{stripTimerTag(segment.text)}</span>
                )) : "Brak kroków. Dodaj instrukcje do przepisu."}
              </p>
              {currentStepDurationMinutes > 0 && (
                <p className="text-xs sm:text-sm text-muted-foreground">Wykryto timer: {currentStepTimerName} ({currentStepDurationMinutes} min)</p>
              )}
            </div>

            {hasCurrentStepTimerDefinition && (
              <div className="rounded-2xl border p-3 sm:p-4 space-y-2">
                <p className="text-3xl sm:text-4xl font-bold text-center tabular-nums">{formatTime(timerRemainingSeconds)}</p>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    className="h-11 sm:h-12 text-sm sm:text-base"
                    onClick={() => {
                      const existingTimer = stepTimers.find((timer) => timer.stepIndex === currentStepIndex);
                      if (existingTimer) {
                        setStepTimers((prev) =>
                          prev.map((timer) =>
                            timer.stepIndex === currentStepIndex
                              ? {
                                  ...timer,
                                  remainingSeconds: timer.remainingSeconds <= 0 ? timer.initialSeconds : timer.remainingSeconds,
                                  isRunning: timer.remainingSeconds <= 0 ? timer.initialSeconds > 0 : !timer.isRunning,
                                }
                              : timer
                          )
                        );
                        return;
                      }

                      if (currentStepDurationMinutes <= 0) return;
                      const initialSeconds = currentStepDurationMinutes * 60;
                      setStepTimers((prev) => [
                        ...prev,
                        {
                          stepIndex: currentStepIndex,
                          name: currentStepTimerName,
                          initialSeconds,
                          remainingSeconds: initialSeconds,
                          isRunning: true,
                        },
                      ]);
                    }}
                  >
                    {isTimerRunning ? <Pause className="w-5 h-5 mr-2" /> : <Play className="w-5 h-5 mr-2" />}
                    {isTimerRunning ? "Pauza" : "Start"}
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11 sm:h-12 text-sm sm:text-base"
                    onClick={() => {
                      const initialSeconds = currentStepTimer?.initialSeconds || (currentStepDurationMinutes * 60);
                      if (initialSeconds <= 0) return;
                      setStepTimers((prev) => {
                        const hasCurrentStepTimer = prev.some((timer) => timer.stepIndex === currentStepIndex);
                        if (!hasCurrentStepTimer) {
                          return [
                            ...prev,
                            {
                              stepIndex: currentStepIndex,
                              name: currentStepTimerName,
                              initialSeconds,
                              remainingSeconds: initialSeconds,
                              isRunning: false,
                            },
                          ];
                        }
                        return prev.map((timer) =>
                          timer.stepIndex === currentStepIndex
                            ? { ...timer, remainingSeconds: initialSeconds, isRunning: false }
                            : timer
                        );
                      });
                    }}
                  >
                    <RotateCcw className="w-5 h-5 mr-2" />
                    Reset
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11 sm:h-12 text-sm sm:text-base"
                    onClick={() => {
                      setStepTimers((prev) => prev.filter((timer) => timer.stepIndex !== currentStepIndex));
                    }}
                    disabled={!currentStepTimer}
                  >
                    Stop
                  </Button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 mt-auto">
              <Button
                variant="outline"
                className="h-12 sm:h-14 text-base sm:text-lg font-semibold"
                onClick={() => {
                  const prevIndex = Math.max(currentStepIndex - 1, 0);
                  setCurrentStepIndex(prevIndex);
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
                }}
                disabled={currentStepIndex >= Math.max(instructionSteps.length - 1, 0)}
              >
                Następny krok
              </Button>
            </div>

            {stepTimers.length > 0 && (
              <div className="border rounded-2xl p-2 sm:p-3">
                <p className="text-[11px] sm:text-xs text-muted-foreground mb-2">Aktywne timery</p>
                <div className="flex flex-wrap gap-2">
                  {stepTimers.map((timer) => (
                    <div key={`timer-${timer.stepIndex}`} className="rounded-xl border px-2 py-1.5 sm:px-3 sm:py-2 min-w-[130px] bg-background">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] sm:text-xs font-medium">{timer.name || `Krok ${timer.stepIndex + 1}`}</span>
                        <span className="text-sm sm:text-base font-bold tabular-nums">{formatTime(timer.remainingSeconds)}</span>
                      </div>
                      <div className="flex gap-1 mt-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[10px] sm:text-xs"
                          onClick={() => {
                            setStepTimers((prev) =>
                              prev.map((item) =>
                                item.stepIndex === timer.stepIndex
                                  ? {
                                      ...item,
                                      remainingSeconds: item.remainingSeconds <= 0 ? item.initialSeconds : item.remainingSeconds,
                                      isRunning: item.remainingSeconds <= 0 ? item.initialSeconds > 0 : !item.isRunning,
                                    }
                                  : item
                              )
                            );
                          }}
                        >
                          {timer.isRunning ? "Pauza" : "Start"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[10px] sm:text-xs"
                          onClick={() => {
                            setStepTimers((prev) =>
                              prev.map((item) =>
                                item.stepIndex === timer.stepIndex
                                  ? { ...item, remainingSeconds: item.initialSeconds, isRunning: false }
                                  : item
                              )
                            );
                          }}
                        >
                          Reset
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[10px] sm:text-xs"
                          onClick={() => {
                            setStepTimers((prev) => prev.filter((item) => item.stepIndex !== timer.stepIndex));
                          }}
                        >
                          Stop
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        ) : (
        <div className={compact ? "space-y-3 overflow-x-hidden text-sm" : "space-y-6 overflow-x-hidden"}>
          {!compact && (
            <div 
              className="h-64 rounded-2xl bg-cover bg-center"
              style={{ backgroundImage: `url(${recipe.imageUrl || 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800'})` }}
            />
          )}
          <div>
            <h2 className={compact ? "text-xl font-bold font-display leading-tight" : "text-3xl font-bold font-display"}>{recipe.name}</h2>
            <div className="flex flex-wrap gap-1 mt-2">
              {recipe.tags?.map((tag: string, i: number) => (
                <span key={i} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-lg font-bold">
                  {tag}
                </span>
              ))}
            </div>
            <div className="flex gap-2 mt-2 text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1 bg-secondary/50 px-2 py-1 rounded-lg text-xs"><Clock className="w-4 h-4" /> {recipe.prepTime} min</span>
              <span className="flex items-center gap-1 bg-secondary/50 px-2 py-1 rounded-lg text-xs"><ChefHat className="w-4 h-4" /> {baseIngredients.length} składników</span>
              <span className="flex items-center gap-1 bg-primary/10 text-primary font-bold px-2 py-1 rounded-lg text-xs">
                {isPlannedView ? `${servingsToUse} zaplanowanych porcji` : `${recipeServings} porcji`}
              </span>
              {isPlannedView && onSwitchPlannedPerson && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-lg px-2 text-xs"
                  onClick={onSwitchPlannedPerson}
                >
                  {switchPlannedPersonLabel || "Pokaż drugą osobę"}
                </Button>
              )}
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
              {isPlannedView && !onPlannedServingsChange && servingsLockedReason && (
                <span className="flex items-center gap-1 border border-amber-400/60 bg-amber-100 text-amber-900 dark:bg-amber-300/20 dark:text-amber-100 dark:border-amber-300/40 font-semibold px-2 py-1 rounded-lg text-xs max-w-full break-words">
                  {servingsLockedReason}
                </span>
              )}
              {!isPlannedView && (
                <span className="flex items-center gap-1 bg-amber-100/60 text-amber-900 font-semibold px-2 py-1 rounded-lg text-xs">
                  {`${Math.round(nutritionTotals.perServing.calories)} kcal / porcja`}
                </span>
              )}
            </div>
          </div>
          
          <div className={compact ? "grid grid-cols-4 gap-1 rounded-xl bg-secondary/30 p-2 text-center" : "grid grid-cols-4 gap-4 p-4 bg-secondary/30 rounded-2xl text-center"}>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Kalorie</p>
              <p className={compact ? "text-base font-bold text-primary" : "text-xl font-bold text-primary"}>
                {Math.round(displayedNutrition.calories)}
              </p>
              <p className="text-[8px] text-muted-foreground">{nutritionScopeLabel}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Białko</p>
              <p className={compact ? "text-base font-bold" : "text-xl font-bold"}>
                {Math.round(displayedNutrition.protein)}g
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Węgle</p>
              <p className={compact ? "text-base font-bold" : "text-xl font-bold"}>
                {Math.round(displayedNutrition.carbs)}g
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Tłuszcz</p>
              <p className={compact ? "text-base font-bold" : "text-xl font-bold"}>
                {Math.round(displayedNutrition.fat)}g
              </p>
            </div>
          </div>
          
          <div className={compact ? "grid gap-3 md:grid-cols-2 md:gap-4" : "grid md:grid-cols-2 gap-8"}>
            <div>
              <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <h3 className={compact ? "text-base font-bold" : "text-lg font-bold"}>Składniki</h3>
                <div className="flex w-full flex-col items-stretch gap-2 md:w-full md:flex-row md:flex-wrap md:items-center">
                  {onEditIngredients && allowIngredientEditing && (
                    <Button variant="ghost" size="sm" onClick={onEditIngredients} className="h-auto min-h-8 justify-start whitespace-normal text-left text-xs leading-tight text-primary hover:text-primary/80 md:justify-center">
                      <Settings2 className="w-3 h-3 mr-1" />
                      Edytuj składniki
                    </Button>
                  )}
                  {onRestoreOriginalIngredients && (
                    <Button variant="outline" size="sm" onClick={onRestoreOriginalIngredients} className="h-auto min-h-8 justify-start whitespace-normal text-left text-xs leading-tight md:justify-center">
                      <RotateCcw className="w-3 h-3 mr-1" />
                      Przywróć składniki z przepisu
                    </Button>
                  )}
                </div>
              </div>
              <ul className={compact ? "space-y-1 text-xs" : "space-y-2"}>
                {ingredientRows.map(({ ri, isFrequentAddon, scalingIngredient }: any, idx: number) => {
                  const ingredientItemClass = isFrequentAddon
                    ? "border-emerald-300 bg-emerald-50/70"
                    : "border-transparent bg-secondary/50";

                  return (
                  <li key={idx} className="list-none">
                    {ri.groupName && (idx === 0 || ingredientRows[idx - 1]?.ri?.groupName !== ri.groupName) && (
                      <h4 className={`${idx > 0 ? "mt-3" : ""} mb-1 px-1 text-xs font-bold uppercase tracking-wide text-primary`}>
                        {ri.groupName}
                      </h4>
                    )}
                    <div className={`${compact ? "p-1.5" : "p-2"} rounded-lg border ${ingredientItemClass}`}>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1">
                      <span className="font-semibold min-w-0 break-words pr-2">
                        {ri.ingredient?.name}
                        {isFrequentAddon && (
                          <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                            Dodatek
                          </span>
                        )}
                      </span>
                      <span className="text-right font-medium whitespace-nowrap pl-2">
                        {getIngredientAmountLabel(ri, isFrequentAddon, scalingIngredient)}
                      </span>
                    </div>
                    {(() => {
                      const sharedInfo = getSharedAddonPersonInfo(ri);
                      if (!sharedInfo) return null;
                      return (
                        <span className="mt-1 block text-[10px] leading-tight text-emerald-700">
                          {sharedInfo}
                        </span>
                      );
                    })()}
                    {Number(ri.ingredient?.unitWeight || 0) > 0 && (
                      <span className="text-[10px] text-muted-foreground italic">
                        ({ri.ingredient.unitDescription ? `${ri.ingredient.unitDescription} - ` : ""}1 sztuka to ok. {ri.ingredient.unitWeight}g)
                      </span>
                    )}
                    </div>
                  </li>
                );
                })}
              </ul>
              {(recipe?.prepTasks || []).length > 0 && (
                <div className="mt-5 rounded-xl border border-primary/15 bg-primary/5 p-3">
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <CalendarClock className="h-4 w-4 text-primary" /> Meal Prep
                  </h4>
                  <ul className={compact ? "space-y-1 text-xs" : "space-y-2"}>
                    {(recipe.prepTasks || []).map((task: any) => (
                      <li key={task.id || `${task.title}-${task.ingredientId}`} className="rounded-lg bg-background/80 p-2 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium">{task.title}</span>
                          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">do {task.maxDaysBefore} dni</span>
                        </div>
                        {(task.ingredient?.name || task.notes) && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {task.ingredient?.name ? `${task.ingredient.name}${task.notes ? " · " : ""}` : ""}{task.notes || ""}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div>
              <h3 className={compact ? "mb-2 text-base font-bold" : "text-lg font-bold mb-3"}>Instrukcje</h3>
              {recipeComment && (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                  <p className="text-xs font-semibold uppercase tracking-wide">Komentarz</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{recipeComment}</p>
                </div>
              )}
              {instructionSteps.length > 0 ? (
                <ol className={compact ? "list-decimal space-y-1 pl-4 text-xs leading-snug text-muted-foreground [overflow-wrap:anywhere]" : "list-decimal pl-5 space-y-2 text-muted-foreground leading-relaxed [overflow-wrap:anywhere]"}>
                  {instructionSteps.map((step: InstructionStep, idx: number) => (
                    <li key={`step-${idx}`} className="[overflow-wrap:anywhere]">
                      {step.segments.map((segment: any, segmentIdx: number) => (
                        segment.type === "ingredient" ? (
                          <span
                            key={`${segment.ingredientId}-${segmentIdx}`}
                            className="inline rounded-full bg-primary/10 text-primary px-2 py-0.5 mx-0.5 [overflow-wrap:anywhere]"
                          >{stripTimerTag(segment.text)}</span>
                        ) : <span key={`${segment.text}-${segmentIdx}`}>{stripTimerTag(segment.text)}</span>
                      ))}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={compact ? "whitespace-pre-wrap text-xs leading-snug text-muted-foreground" : "whitespace-pre-wrap text-muted-foreground leading-relaxed"}>Brak instrukcji.</p>
              )}
              {instructionSteps.length > 0 && (
                <Button size={compact ? "sm" : "default"} className={compact ? "mt-3 h-8 text-xs" : "mt-4"} onClick={() => {
                  setCurrentStepIndex(0);
                  setStepTimers([]);
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
