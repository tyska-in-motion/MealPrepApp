import { calculateScaledAmount } from "@shared/scaling";

const normalizeAmount = (value: any) => Math.round(Number(value) || 0);

const getRecipeBaseAmount = (recipeIngredient: any) => (
  Number(recipeIngredient?.baseAmount ?? recipeIngredient?.amount) || 0
);

const getCalculatedRecipeAmount = (recipeIngredient: any, servings: number, recipeServings: number) => calculateScaledAmount({
  baseAmount: getRecipeBaseAmount(recipeIngredient),
  scalingType: recipeIngredient?.scalingType || "LINEAR",
  scalingFormula: recipeIngredient?.scalingFormula,
  stepThresholds: recipeIngredient?.stepThresholds,
}, servings, recipeServings);

const matchesFreshMealEntrySnapshot = (mealIngredient: any, recipeIngredient: any) => {
  const storedAmount = normalizeAmount(mealIngredient?.amount);
  const baseSnapshotAmount = normalizeAmount(getRecipeBaseAmount(recipeIngredient));

  return storedAmount === baseSnapshotAmount;
};

export const hasEditedMealIngredients = (meal: any) => {
  if (!meal?.recipe || !Array.isArray(meal?.ingredients) || meal.ingredients.length === 0) return false;

  const servings = Number(meal?.servings) || 1;
  const recipeServings = Number(meal?.recipe?.servings) || 1;
  const recipeIngredients = Array.isArray(meal?.recipe?.ingredients) ? meal.recipe.ingredients : [];
  if (recipeIngredients.length === 0) return meal.ingredients.length > 0;

  if (meal.ingredients.length !== recipeIngredients.length) return true;

  return meal.ingredients.some((ingredient: any, index: number) => {
    const recipeIngredient = recipeIngredients[index];
    if (!recipeIngredient) return true;

    if (Number(ingredient?.ingredientId) !== Number(recipeIngredient?.ingredientId)) return true;

    // New meal-plan entries get an immutable base snapshot of recipe ingredients.
    // That snapshot is not a user edit, even when the planned servings differ from
    // the recipe's default servings and the displayed amount is scaled in the UI.
    if (matchesFreshMealEntrySnapshot(ingredient, recipeIngredient)) return false;

    const recipeAmount = getCalculatedRecipeAmount(recipeIngredient, servings, recipeServings);

    return normalizeAmount(ingredient?.amount) !== normalizeAmount(recipeAmount);
  });
};
