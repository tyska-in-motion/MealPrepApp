
import { pgTable, text, serial, integer, boolean, timestamp, real, date, jsonb, pgEnum, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export type InstructionSegment =
  | { type: "text"; text: string }
  | { type: "ingredient"; text: string; ingredientId: number; ingredientIds?: number[]; ingredientSource?: "ingredient" | "frequentAddon"; multiplier?: number };

export type InstructionStep = {
  segments: InstructionSegment[];
};

export type SuggestedRecipe = {
  recipeId: number;
  servings: number;
};

export type RecipeSnapshot = Record<string, any>;

// === TABLE DEFINITIONS ===

export const ingredients = pgTable("ingredients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category"), // e.g. "mięso", "nabiał", "owoce"
  calories: integer("calories").notNull(), // per 100g/ml
  protein: real("protein").notNull(),
  carbs: real("carbs").notNull(),
  fat: real("fat").notNull(),
  unit: text("unit").notNull().default("g"), // Always "g" for base calc, but we'll show unitDescription
  unitWeight: real("unit_weight"), // Weight of one "sztuka" in grams
  unitDescription: text("unit_description"), // e.g. "1 sztuka to ok. 150g"
  price: real("price").default(0), // Calculated price per 100g/ml
  packageSize: real("package_size").notNull().default(100), // Package size in grams/ml used to calculate price
  packagePrice: real("package_price").notNull().default(0), // Full package price used to calculate price
  pricingUpdatedAt: timestamp("pricing_updated_at").notNull().defaultNow(), // Last change to package size/price
  imageUrl: text("image_url"),
  alwaysAtHome: boolean("always_at_home").notNull().default(false),
  ediblePercentage: real("edible_percentage").notNull().default(100),
  increasePurchaseForWaste: boolean("increase_purchase_for_waste").notNull().default(false),
  useSoon: boolean("use_soon").notNull().default(false),
});

export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  person: text("person").notNull().default("A"),
  targetCalories: integer("target_calories").notNull().default(2000),
  targetProtein: integer("target_protein").notNull().default(150),
  targetCarbs: integer("target_carbs").notNull().default(200),
  targetFat: integer("target_fat").notNull().default(65),
  targetProteinPercentage: integer("target_protein_percentage").notNull().default(30),
  targetCarbsPercentage: integer("target_carbs_percentage").notNull().default(40),
  targetFatPercentage: integer("target_fat_percentage").notNull().default(30),
  targetProteinPercentageMin: integer("target_protein_percentage_min").notNull().default(30),
  targetProteinPercentageMax: integer("target_protein_percentage_max").notNull().default(30),
  targetCarbsPercentageMin: integer("target_carbs_percentage_min").notNull().default(40),
  targetCarbsPercentageMax: integer("target_carbs_percentage_max").notNull().default(40),
  targetFatPercentageMin: integer("target_fat_percentage_min").notNull().default(30),
  targetFatPercentageMax: integer("target_fat_percentage_max").notNull().default(30),
  sharedBatchesManualOnly: boolean("shared_batches_manual_only").notNull().default(true),
});

export const userSettingsHistory = pgTable("user_settings_history", {
  id: serial("id").primaryKey(),
  person: text("person").notNull(),
  effectiveDate: date("effective_date").notNull(),
  targetCalories: integer("target_calories").notNull(),
  targetProtein: integer("target_protein").notNull(),
  targetCarbs: integer("target_carbs").notNull(),
  targetFat: integer("target_fat").notNull(),
  targetProteinPercentage: integer("target_protein_percentage").notNull().default(30),
  targetCarbsPercentage: integer("target_carbs_percentage").notNull().default(40),
  targetFatPercentage: integer("target_fat_percentage").notNull().default(30),
  targetProteinPercentageMin: integer("target_protein_percentage_min").notNull().default(30),
  targetProteinPercentageMax: integer("target_protein_percentage_max").notNull().default(30),
  targetCarbsPercentageMin: integer("target_carbs_percentage_min").notNull().default(40),
  targetCarbsPercentageMax: integer("target_carbs_percentage_max").notNull().default(40),
  targetFatPercentageMin: integer("target_fat_percentage_min").notNull().default(30),
  targetFatPercentageMax: integer("target_fat_percentage_max").notNull().default(30),
  createdAt: timestamp("created_at").defaultNow(),
});

export const recipes = pgTable("recipes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  isFavorite: boolean("is_favorite").notNull().default(false),
  suggestedRecipeIds: integer("suggested_recipe_ids").array().notNull().default(sql`'{}'::integer[]`),
  suggestedRecipes: jsonb("suggested_recipes").$type<SuggestedRecipe[]>().notNull().default(sql`'[]'::jsonb`),
  tags: text("tags").array(), // e.g. ["szybkie", "śniadanie"]
  description: text("description"),
  instructions: text("instructions"),
  comments: text("comments"),
  instructionSteps: jsonb("instruction_steps").$type<InstructionStep[]>(),
  prepTime: integer("prep_time"), // minutes
  imageUrl: text("image_url"),
  servings: real("servings").notNull().default(1),
  defaultServingsA: real("default_servings_a").notNull().default(1),
  defaultServingsB: real("default_servings_b").notNull().default(1.5),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ingredientScalingTypeEnum = pgEnum("ingredient_scaling_type", ["LINEAR", "FIXED", "STEP", "FORMULA"]);

export const recipeIngredients = pgTable("recipe_ingredients", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").notNull(),
  ingredientId: integer("ingredient_id").notNull(),
  groupName: text("group_name"),
  amount: integer("amount").notNull(), // Legacy amount (kept for backward compatibility)
  baseAmount: real("base_amount").notNull(),
  alternativeAmount: real("alternative_amount"),
  alternativeUnit: text("alternative_unit"),
  unit: text("unit").notNull().default("g"),
  scalingType: ingredientScalingTypeEnum("scaling_type").notNull().default("LINEAR"),
  scalingFormula: text("scaling_formula"),
  stepThresholds: jsonb("step_thresholds").$type<{ minServings: number; maxServings?: number | null; amount: number }[]>(),
  mealPrep: boolean("meal_prep").notNull().default(false),
  mealPrepMaxDaysBefore: integer("meal_prep_max_days_before").notNull().default(1),
  mealPrepNotes: text("meal_prep_notes"),
});

export const recipeFrequentAddons = pgTable("recipe_frequent_addons", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").notNull(),
  ingredientId: integer("ingredient_id").notNull(),
  amount: integer("amount").notNull(), // Legacy amount (kept for backward compatibility)
  baseAmount: real("base_amount").notNull(),
  defaultAmountA: real("default_amount_a").notNull().default(0),
  defaultAmountB: real("default_amount_b").notNull().default(0),
  alternativeAmount: real("alternative_amount"),
  alternativeUnit: text("alternative_unit"),
  unit: text("unit").notNull().default("g"),
  scalingType: ingredientScalingTypeEnum("scaling_type").notNull().default("LINEAR"),
  scalingFormula: text("scaling_formula"),
  stepThresholds: jsonb("step_thresholds").$type<{ minServings: number; maxServings?: number | null; amount: number }[]>(),
});


export const recipePrepTasks = pgTable("recipe_prep_tasks", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").notNull(),
  title: text("title").notNull(),
  ingredientId: integer("ingredient_id"),
  ingredientSource: text("ingredient_source").notNull().default("ingredient"),
  maxDaysBefore: integer("max_days_before").notNull().default(1),
  groupKey: text("group_key"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sharedMealBatches = pgTable("shared_meal_batches", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").notNull(),
  totalServings: real("total_servings").notNull().default(1),
  note: text("note"),
  recipeSnapshot: jsonb("recipe_snapshot").$type<RecipeSnapshot>(),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sharedMealBatchLogs = pgTable("shared_meal_batch_logs", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull(),
  action: text("action").notNull(),
  payload: jsonb("payload").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const mealEntries = pgTable("meal_entries", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(), // YYYY-MM-DD
  recipeId: integer("recipe_id"), // Optional for custom meals
  customName: text("custom_name"),
  customCalories: integer("custom_calories"),
  customProtein: real("custom_protein"),
  customCarbs: real("custom_carbs"),
  customFat: real("custom_fat"),
  mealType: text("meal_type").notNull(), // breakfast, lunch, dinner, snack
  person: text("person").notNull().default("A"), // A or B
  servings: real("servings").notNull().default(1),
  cookedBatchId: integer("cooked_batch_id"),
  recipeSnapshot: jsonb("recipe_snapshot").$type<RecipeSnapshot>(),

  isEaten: boolean("is_eaten").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const mealEntryIngredients = pgTable("meal_entry_ingredients", {
  id: serial("id").primaryKey(),
  mealEntryId: integer("meal_entry_id").notNull(),
  ingredientId: integer("ingredient_id").notNull(),
  amount: integer("amount").notNull(),
  scalingType: ingredientScalingTypeEnum("scaling_type").notNull().default("LINEAR"),
});

// === RELATIONS ===

export const recipesRelations = relations(recipes, ({ many }) => ({
  ingredients: many(recipeIngredients),
  frequentAddons: many(recipeFrequentAddons),
  prepTasks: many(recipePrepTasks),
  mealEntries: many(mealEntries),
  sharedBatches: many(sharedMealBatches),
}));

export const ingredientsRelations = relations(ingredients, ({ many }) => ({
  inRecipes: many(recipeIngredients),
  inRecipeFrequentAddons: many(recipeFrequentAddons),
  inMealEntries: many(mealEntryIngredients),
}));

export const recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeIngredients.recipeId],
    references: [recipes.id],
  }),
  ingredient: one(ingredients, {
    fields: [recipeIngredients.ingredientId],
    references: [ingredients.id],
  }),
}));

export const recipeFrequentAddonsRelations = relations(recipeFrequentAddons, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeFrequentAddons.recipeId],
    references: [recipes.id],
  }),
  ingredient: one(ingredients, {
    fields: [recipeFrequentAddons.ingredientId],
    references: [ingredients.id],
  }),
}));

export const recipePrepTasksRelations = relations(recipePrepTasks, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipePrepTasks.recipeId],
    references: [recipes.id],
  }),
  ingredient: one(ingredients, {
    fields: [recipePrepTasks.ingredientId],
    references: [ingredients.id],
  }),
}));

export const sharedMealBatchesRelations = relations(sharedMealBatches, ({ one, many }) => ({
  recipe: one(recipes, {
    fields: [sharedMealBatches.recipeId],
    references: [recipes.id],
  }),
  mealEntries: many(mealEntries),
  logs: many(sharedMealBatchLogs),
}));

export const sharedMealBatchLogsRelations = relations(sharedMealBatchLogs, ({ one }) => ({
  batch: one(sharedMealBatches, {
    fields: [sharedMealBatchLogs.batchId],
    references: [sharedMealBatches.id],
  }),
}));
export const mealEntriesRelations = relations(mealEntries, ({ one, many }) => ({
  recipe: one(recipes, {
    fields: [mealEntries.recipeId],
    references: [recipes.id],
  }),
  cookedBatch: one(sharedMealBatches, {
    fields: [mealEntries.cookedBatchId],
    references: [sharedMealBatches.id],
  }),
  ingredients: many(mealEntryIngredients),
}));

export const mealEntryIngredientsRelations = relations(mealEntryIngredients, ({ one }) => ({
  mealEntry: one(mealEntries, {
    fields: [mealEntryIngredients.mealEntryId],
    references: [mealEntries.id],
  }),
  ingredient: one(ingredients, {
    fields: [mealEntryIngredients.ingredientId],
    references: [ingredients.id],
  }),
}));

export const statsDayExclusions = pgTable("stats_day_exclusions", {
  date: date("date").primaryKey(),
  reason: text("reason").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const shoppingListChecks = pgTable("shopping_list_checks", {
  ingredientId: integer("ingredient_id").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  isChecked: boolean("is_checked").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.ingredientId, table.periodStart, table.periodEnd] }),
}));

export const shoppingListExtras = pgTable("shopping_list_extras", {
  id: serial("id").primaryKey(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  name: text("name").notNull(),
  amount: real("amount").notNull().default(1),
  unit: text("unit").notNull().default("szt"),
  category: text("category").notNull().default("Dodatkowe"),
  isChecked: boolean("is_checked").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const shoppingListExcludedItems = pgTable("shopping_list_excluded_items", {
  ingredientId: integer("ingredient_id").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.ingredientId, table.periodStart, table.periodEnd] }),
}));

export const shoppingListSnapshots = pgTable("shopping_list_snapshots", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const shoppingListSnapshotItems = pgTable("shopping_list_snapshot_items", {
  id: serial("id").primaryKey(),
  snapshotId: integer("snapshot_id").notNull().references(() => shoppingListSnapshots.id, { onDelete: "cascade" }),
  ingredientId: integer("ingredient_id"),
  name: text("name").notNull(),
  totalAmount: real("total_amount").notNull().default(0),
  unit: text("unit").notNull().default("g"),
  category: text("category").notNull().default("Inne"),
  status: text("status").notNull().default("NOT_BOUGHT"),
  price: real("price").notNull().default(0),
  isExtra: boolean("is_extra").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const shoppingListNotebookItems = pgTable("shopping_list_notebook_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const appState = pgTable("app_state", {
  key: text("key").primaryKey(),
  data: jsonb("data").$type<any>().notNull().default(sql`'{}'::jsonb`),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const bodyMeasurements = pgTable("body_measurements", {
  id: serial("id").primaryKey(),
  person: text("person").notNull(),
  date: date("date").notNull(),
  weight: real("weight"),
  waist: real("waist"),
  chest: real("chest"),
  arm: real("arm"),
  thigh: real("thigh"),
  calf: real("calf"),
  hips: real("hips"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  personDateIdx: uniqueIndex("body_measurements_person_date_idx").on(table.person, table.date),
}));

// === SCHEMAS & TYPES ===

export const insertIngredientSchema = createInsertSchema(ingredients).omit({ id: true });
export const insertRecipeSchema = createInsertSchema(recipes).omit({ id: true, createdAt: true });
export const insertRecipeIngredientSchema = createInsertSchema(recipeIngredients).omit({ id: true });
export const insertRecipeFrequentAddonSchema = createInsertSchema(recipeFrequentAddons).omit({ id: true });
export const insertRecipePrepTaskSchema = createInsertSchema(recipePrepTasks).omit({ id: true, createdAt: true });
export const insertMealEntrySchema = createInsertSchema(mealEntries).omit({ id: true, createdAt: true });
export const insertSharedMealBatchSchema = createInsertSchema(sharedMealBatches).omit({ id: true, createdAt: true });
export const insertSharedMealBatchLogSchema = createInsertSchema(sharedMealBatchLogs).omit({ id: true, createdAt: true });
export const insertUserSettingsSchema = createInsertSchema(userSettings).omit({ id: true });
export const insertBodyMeasurementSchema = createInsertSchema(bodyMeasurements).omit({ id: true, createdAt: true, updatedAt: true });

export type Ingredient = typeof ingredients.$inferSelect;
export type Recipe = typeof recipes.$inferSelect;
export type RecipeIngredient = typeof recipeIngredients.$inferSelect;
export type RecipeFrequentAddon = typeof recipeFrequentAddons.$inferSelect;
export type RecipePrepTask = typeof recipePrepTasks.$inferSelect;
export type MealEntry = typeof mealEntries.$inferSelect;
export type SharedMealBatch = typeof sharedMealBatches.$inferSelect;
export type SharedMealBatchLog = typeof sharedMealBatchLogs.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
export type UserSettingsHistory = typeof userSettingsHistory.$inferSelect;
export type ShoppingListNotebookItem = typeof shoppingListNotebookItems.$inferSelect;
export type StatsDayExclusion = typeof statsDayExclusions.$inferSelect;
export type AppState = typeof appState.$inferSelect;
export type BodyMeasurement = typeof bodyMeasurements.$inferSelect;

export type CreateIngredientRequest = z.infer<typeof insertIngredientSchema>;
export type CreateRecipeRequest = z.infer<typeof insertRecipeSchema>;
export type CreateMealEntryRequest = z.infer<typeof insertMealEntrySchema>;
export type CreateSharedMealBatchRequest = z.infer<typeof insertSharedMealBatchSchema>;

// Extended types for frontend
export type RecipeWithIngredients = Recipe & {
  ingredients: (RecipeIngredient & { ingredient: Ingredient })[];
  frequentAddons: (RecipeFrequentAddon & { ingredient: Ingredient })[];
  prepTasks: (RecipePrepTask & { ingredient?: Ingredient | null })[];
};

export type MealEntryWithRecipe = MealEntry & {
  recipe?: RecipeWithIngredients;
  ingredients: (typeof mealEntryIngredients.$inferSelect & { ingredient: Ingredient })[];
};

export type ShoppingListItem = {
  ingredientId: number;
  name: string;
  totalAmount: number;
  unit: string;
  isChecked: boolean;
};

export type DaySummary = {
  date: string;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalPrice: number;
  entries: MealEntryWithRecipe[];
};
