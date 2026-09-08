import assert from "node:assert/strict";
import {
  calculateAllocatedWeight,
  calculateIndividualIngredientAmounts,
  calculateShoppingRequirements,
  validatePercentageAllocations,
} from "../shared/meal-portions.ts";

const ingredients = [
  { ingredientId: 1, baseAmount: 100 },
  { ingredientId: 2, baseAmount: 50 },
];

// Standard scaling: recipe base yield is a denominator, never a people count.
assert.deepEqual(calculateIndividualIngredientAmounts(ingredients, 2, 1), [
  { ingredientId: 1, amount: 200 }, { ingredientId: 2, amount: 100 },
]);

// Individual final override applies after default scaling and only to that person/ingredient.
assert.deepEqual(calculateIndividualIngredientAmounts(ingredients, 1, 1), [{ ingredientId: 1, amount: 100 }, { ingredientId: 2, amount: 50 }]);
assert.deepEqual(calculateIndividualIngredientAmounts([{ ...ingredients[0] }, { ...ingredients[1], overrideAmount: 75 }], 2, 1), [{ ingredientId: 1, amount: 200 }, { ingredientId: 2, amount: 75 }]);

assert.equal(validatePercentageAllocations([{ person: "A", percentage: 40 }, { person: "B", percentage: 60 }]), true);
assert.equal(validatePercentageAllocations([{ person: "A", percentage: 40 }, { person: "B", percentage: 40 }]), false);
assert.equal(validatePercentageAllocations([{ person: "A", percentage: 70 }, { person: "B", percentage: 50 }]), false);
assert.equal(calculateAllocatedWeight(1500, 40), 600);
assert.equal(calculateAllocatedWeight(1500, 60), 900);
assert.equal(calculateAllocatedWeight(100, 33.333), 33.333); // no premature rounding

// A 3-serving batch is one preparation requirement even with two 40/60 recipients.
const batchShopping = calculateShoppingRequirements([
  { mode: "BATCH_ALLOCATION", batchId: 9, preparedServings: 3, recipeBaseServings: 3, ingredients: [{ ingredientId: 3, baseAmount: 600 }, { ingredientId: 4, baseAmount: 300 }] },
  { mode: "BATCH_ALLOCATION", batchId: 9, preparedServings: 3, recipeBaseServings: 3, ingredients: [{ ingredientId: 3, baseAmount: 600 }, { ingredientId: 4, baseAmount: 300 }] },
]);
assert.equal(batchShopping.get(3), 600);
assert.equal(batchShopping.get(4), 300);

const individualShopping = calculateShoppingRequirements([
  { mode: "INDIVIDUAL", preparedServings: 1, recipeBaseServings: 1, ingredients },
  { mode: "INDIVIDUAL", preparedServings: 2, recipeBaseServings: 1, ingredients: [{ ...ingredients[0] }, { ...ingredients[1], overrideAmount: 75 }] },
]);
assert.equal(individualShopping.get(1), 300);
assert.equal(individualShopping.get(2), 125);

console.log("meal-portions tests passed");
