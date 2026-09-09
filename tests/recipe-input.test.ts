import assert from "node:assert/strict";
import { api } from "../shared/routes";

const recipeInput = api.recipes.create.input;

const ingredient = { ingredientId: 1, amount: 100, baseAmount: 100, unit: "g" };

const individual = recipeInput.parse({ name: "Owsianka", ingredients: [ingredient] });
assert.equal(individual.servings, 1);
assert.equal(individual.preparationType, "INDIVIDUAL");
assert.equal("defaultServingsA" in individual, false, "recipe input must not require person-specific servings");
assert.equal("defaultServingsB" in individual, false, "recipe input must not require person-specific servings");

const batch = recipeInput.parse({
  name: "Lasagne",
  servings: 3,
  preparationType: "BATCH",
  ingredients: [ingredient],
});
assert.equal(batch.servings, 3);
assert.equal(batch.preparationType, "BATCH");

const existingRecipe = recipeInput.parse({
  name: "Istniejący przepis",
  servings: 2,
  ingredients: [{ ingredientId: 1, amount: 250, baseAmount: 250, unit: "ml" }],
});
assert.deepEqual(existingRecipe.ingredients, [{ ingredientId: 1, amount: 250, baseAmount: 250, unit: "ml", scalingType: "LINEAR", mealPrep: false, mealPrepMaxDaysBefore: 1 }]);

for (const invalid of [
  { name: "", ingredients: [ingredient] },
  { name: "Bez składników", ingredients: [] },
  { name: "Zero", ingredients: [{ ...ingredient, amount: 0, baseAmount: 0 }] },
  { name: "Ujemny", ingredients: [{ ...ingredient, amount: -50, baseAmount: -50 }] },
  { name: "Złe porcje", servings: 0, ingredients: [ingredient] },
]) {
  assert.throws(() => recipeInput.parse(invalid));
}

console.log("recipe input tests passed");
