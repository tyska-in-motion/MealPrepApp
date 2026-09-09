
import { db } from "./db";
import {
  ingredients,
  recipes,
  recipeIngredients,
  recipeFrequentAddons,
  recipePrepTasks,
  mealEntries,
  sharedMealBatches,
  sharedMealBatchLogs,
  userSettings,
  userSettingsHistory,
  shoppingListChecks,
  shoppingListExtras,
  shoppingListExcludedItems,
  shoppingListSnapshots,
  shoppingListSnapshotItems,
  shoppingListNotebookItems,
  statsDayExclusions,
  appState,
  bodyMeasurements,
  mealEntryIngredients,
  type Ingredient,
  type Recipe,
  type MealEntry,
  type SharedMealBatch,
  type SharedMealBatchLog,
  type CreateIngredientRequest,
  type CreateRecipeRequest,
  type CreateMealEntryRequest,
  type CreateSharedMealBatchRequest,
  type RecipeWithIngredients,
  type MealEntryWithRecipe,
  type DaySummary,
  type UserSettings,
  type UserSettingsHistory,
  type InstructionStep,
  type BodyMeasurement,
} from "@shared/schema";
import { eq, sql, and, gte, lte, inArray, desc, or, asc } from "drizzle-orm";
import { calculateNutritionAmount, calculateScaledAmount } from "@shared/scaling";

export interface IStorage {
  // Ingredients
  getIngredients(search?: string, limit?: number, offset?: number): Promise<Ingredient[]>;
  countIngredients(search?: string): Promise<number>;
  getIngredient(id: number): Promise<Ingredient | undefined>;
  createIngredient(ingredient: CreateIngredientRequest): Promise<Ingredient>;
  updateIngredient(id: number, updates: Partial<Ingredient>): Promise<Ingredient>;
  deleteIngredient(id: number): Promise<void>;

  // Recipes
  getRecipes(search?: string, ingredientId?: number, limit?: number, offset?: number): Promise<any[]>;
  getRecipeSearchIndex(): Promise<any[]>;
  countRecipes(search?: string, ingredientId?: number): Promise<number>;
  getRecipeEatCounts(): Promise<Map<number, number>>;
  getRecipe(id: number): Promise<RecipeWithIngredients | undefined>;
  createRecipe(recipe: CreateRecipeRequest & { instructionSteps?: InstructionStep[]; ingredients: { ingredientId: number; groupName?: string | null; amount: number; baseAmount?: number; unit?: string; alternativeAmount?: number; alternativeUnit?: string; scalingType?: "LINEAR" | "FIXED" | "STEP" | "FORMULA"; scalingFormula?: string; stepThresholds?: { minServings: number; maxServings?: number | null; amount: number }[]; mealPrep?: boolean; mealPrepMaxDaysBefore?: number; mealPrepNotes?: string | null }[]; frequentAddons?: { ingredientId: number; amount: number; baseAmount?: number; defaultAmountA?: number; defaultAmountB?: number; unit?: string; alternativeAmount?: number; alternativeUnit?: string; scalingType?: "LINEAR" | "FIXED" | "STEP" | "FORMULA"; scalingFormula?: string; stepThresholds?: { minServings: number; maxServings?: number | null; amount: number }[] }[]; prepTasks?: { title: string; ingredientId?: number | null; ingredientSource?: string; maxDaysBefore: number; groupKey?: string | null; notes?: string | null }[] }): Promise<RecipeWithIngredients>;
  updateRecipe(id: number, recipe: CreateRecipeRequest & { resetEditedMealIngredients?: boolean; instructionSteps?: InstructionStep[]; ingredients: { ingredientId: number; groupName?: string | null; amount: number; baseAmount?: number; unit?: string; alternativeAmount?: number; alternativeUnit?: string; scalingType?: "LINEAR" | "FIXED" | "STEP" | "FORMULA"; scalingFormula?: string; stepThresholds?: { minServings: number; maxServings?: number | null; amount: number }[]; mealPrep?: boolean; mealPrepMaxDaysBefore?: number; mealPrepNotes?: string | null }[]; frequentAddons?: { ingredientId: number; amount: number; baseAmount?: number; defaultAmountA?: number; defaultAmountB?: number; unit?: string; alternativeAmount?: number; alternativeUnit?: string; scalingType?: "LINEAR" | "FIXED" | "STEP" | "FORMULA"; scalingFormula?: string; stepThresholds?: { minServings: number; maxServings?: number | null; amount: number }[] }[]; prepTasks?: { title: string; ingredientId?: number | null; ingredientSource?: string; maxDaysBefore: number; groupKey?: string | null; notes?: string | null }[] }): Promise<RecipeWithIngredients>;
  deleteRecipe(id: number): Promise<void>;

  // Meal Plan
  getDayEntries(date: string): Promise<MealEntryWithRecipe[]>;
  getMealEntryById(id: number): Promise<MealEntryWithRecipe | undefined>;
  createMealEntry(entry: CreateMealEntryRequest & { createSharedBatch?: boolean; sharedBatchServings?: number }): Promise<MealEntry>;
  updateMealEntry(id: number, updates: Partial<MealEntry> & { servings?: number }): Promise<MealEntry>;
  deleteMealEntry(id: number): Promise<void>;
  getMealEntriesRange(startDate: string, endDate: string): Promise<MealEntryWithRecipe[]>;
  getStatsDayExclusions(startDate: string, endDate: string): Promise<{ date: string; reason: string; updatedAt: Date | null }[]>;
  setStatsDayExclusion(date: string, reason?: string): Promise<void>;
  getAppState(key: string): Promise<any>;
  setAppState(key: string, data: any): Promise<any>;
  updateMealEntryIngredients(mealEntryId: number, ingredients: { ingredientId: number; amount: number; overrideAmount?: number | null; scalingType?: "LINEAR" | "FIXED" | "STEP" | "FORMULA" }[]): Promise<void>;
  copyDayEntries(sourceDate: string, targetDate: string, replaceTarget?: boolean): Promise<number>;

  // Shared meal batches
  getSharedMealBatches(): Promise<any[]>;
  getArchivedSharedMealBatches(): Promise<any[]>;
  getSharedMealBatchLogs(batchId: number): Promise<SharedMealBatchLog[]>;
  createSharedMealBatch(input: CreateSharedMealBatchRequest): Promise<SharedMealBatch>;
  updateSharedMealBatch(id: number, updates: Partial<Pick<SharedMealBatch, "totalServings" | "note">>): Promise<SharedMealBatch>;
  archiveSharedMealBatch(id: number, isArchived: boolean): Promise<SharedMealBatch>;
  deleteSharedMealBatch(id: number): Promise<void>;

  // Shopping List Checks
  getShoppingListChecks(periodStart: string, periodEnd: string): Promise<Record<number, boolean>>;
  toggleShoppingListCheck(ingredientId: number, periodStart: string, periodEnd: string, isChecked: boolean): Promise<void>;
  getShoppingListExtras(periodStart: string, periodEnd: string): Promise<any[]>;
  addShoppingListExtra(periodStart: string, periodEnd: string, input: { name: string; amount?: number; unit?: string; category?: string }): Promise<any>;
  deleteShoppingListExtra(id: number): Promise<void>;
  toggleShoppingListExtraCheck(id: number, isChecked: boolean): Promise<void>;
  getShoppingListExcludedItems(periodStart: string, periodEnd: string): Promise<number[]>;
  setShoppingListExcludedItem(ingredientId: number, periodStart: string, periodEnd: string, excluded: boolean): Promise<void>;
  createShoppingListSnapshot(input: { name: string; periodStart: string; periodEnd: string; items: { ingredientId?: number | null; name: string; totalAmount: number; unit: string; category?: string | null; status: "BOUGHT" | "AT_HOME" | "NOT_BOUGHT"; price?: number; isExtra?: boolean; }[] }): Promise<any>;
  getShoppingListSnapshots(): Promise<any[]>;
  getActiveShoppingListSnapshots(): Promise<any[]>;
  getShoppingListSnapshotById(snapshotId: number): Promise<any | undefined>;
  completeShoppingListSnapshot(snapshotId: number): Promise<any | undefined>;
  deleteShoppingListSnapshot(snapshotId: number): Promise<void>;
  updateShoppingListSnapshotItem(snapshotItemId: number, input: { status?: "BOUGHT" | "AT_HOME" | "NOT_BOUGHT"; price?: number; name?: string; totalAmount?: number; unit?: string; category?: string }): Promise<any>;
  addShoppingListSnapshotItem(snapshotId: number, input: { name: string; totalAmount: number; unit: string; category?: string; status?: "BOUGHT" | "AT_HOME" | "NOT_BOUGHT"; price?: number }): Promise<any>;
  deleteShoppingListSnapshotItem(snapshotItemId: number): Promise<void>;
  getShoppingListNotebookItems(): Promise<{ id: number; name: string }[]>;
  addShoppingListNotebookItem(name: string): Promise<{ id: number; name: string }>;
  deleteShoppingListNotebookItem(id: number): Promise<void>;

  // User Settings
  getUserSettings(): Promise<Record<"A" | "B", UserSettings>>;
  getUserSettingsHistory(startDate: string, endDate: string): Promise<Record<"A" | "B", UserSettingsHistory[]>>;
  updateUserSettings(person: "A" | "B", settings: Partial<UserSettings>): Promise<UserSettings>;

  // Body measurements
  getBodyMeasurements(input: { person?: "A" | "B"; startDate?: string; endDate?: string }): Promise<BodyMeasurement[]>;
  upsertBodyMeasurement(input: Omit<BodyMeasurement, "id" | "createdAt" | "updatedAt">): Promise<BodyMeasurement>;
  deleteBodyMeasurement(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  private normalizeText(value?: string | null): string {
    return String(value ?? "").trim();
  }

  private normalizeForSearch(value?: string | null): string {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[ąćęłńóśźż]/g, (character) => {
        const map: Record<string, string> = { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" };
        return map[character] ?? character;
      })
      .trim();
  }

  private searchNormalizedSql(value: any) {
    return sql`lower(translate(${value}, 'ĄĆĘŁŃÓŚŹŻąćęłńóśźż', 'ACELNOSZZacelnoszz'))`;
  }


  private normalizeIngredientPricing<T extends Partial<Ingredient> | CreateIngredientRequest>(payload: T): T {
    const hasPackageSize = Object.prototype.hasOwnProperty.call(payload, "packageSize");
    const hasPackagePrice = Object.prototype.hasOwnProperty.call(payload, "packagePrice");
    const hasPrice = Object.prototype.hasOwnProperty.call(payload, "price");

    if (hasPackageSize || hasPackagePrice) {
      const packageSize = Number(payload.packageSize);
      const packagePrice = Number(payload.packagePrice ?? 0);

      if (Number.isFinite(packageSize) && packageSize > 0 && Number.isFinite(packagePrice) && packagePrice >= 0) {
        return {
          ...payload,
          packageSize,
          packagePrice,
          price: Math.round((packagePrice / packageSize) * 10000) / 100,
        };
      }
    }

    if (hasPrice && !hasPackageSize && !hasPackagePrice) {
      const price = Number(payload.price ?? 0);
      if (Number.isFinite(price) && price >= 0) {
        return {
          ...payload,
          packageSize: 100,
          packagePrice: price,
          price,
        };
      }
    }

    return payload;
  }

  private calculateSnapshotTotalCost(items: any[], ingredientPriceMap: Map<number, number>): number {
    return items.reduce((acc, item) => {
      if (item.status !== "BOUGHT") return acc;

      const ingredientId = Number(item.ingredientId);
      if (!Number.isFinite(ingredientId) || ingredientId <= 0) return acc;

      const amountInGrams = Number(item.totalAmount || 0);
      if (!Number.isFinite(amountInGrams) || amountInGrams <= 0) return acc;

      const pricePer100g = Number(ingredientPriceMap.get(ingredientId) || 0);
      if (!Number.isFinite(pricePer100g) || pricePer100g <= 0) return acc;

      return acc + (amountInGrams / 100) * pricePer100g;
    }, 0);
  }
  async getUserSettings(): Promise<Record<"A" | "B", UserSettings>> {
    const allSettings = await db.select().from(userSettings);

    const byPerson = new Map<string, UserSettings>();
    for (const setting of allSettings) {
      byPerson.set(setting.person || "A", setting);
    }

    for (const person of ["A", "B"] as const) {
      if (!byPerson.has(person)) {
        const seed = byPerson.get("A") || byPerson.get("B");
        const [created] = await db.insert(userSettings).values({
          person,
          targetCalories: seed?.targetCalories ?? 2000,
          targetProtein: seed?.targetProtein ?? 150,
          targetCarbs: seed?.targetCarbs ?? 200,
          targetFat: seed?.targetFat ?? 65,
          targetProteinPercentage: seed?.targetProteinPercentage ?? 30,
          targetCarbsPercentage: seed?.targetCarbsPercentage ?? 40,
          targetFatPercentage: seed?.targetFatPercentage ?? 30,
          targetProteinPercentageMin: seed?.targetProteinPercentageMin ?? seed?.targetProteinPercentage ?? 30,
          targetProteinPercentageMax: seed?.targetProteinPercentageMax ?? seed?.targetProteinPercentage ?? 30,
          targetCarbsPercentageMin: seed?.targetCarbsPercentageMin ?? seed?.targetCarbsPercentage ?? 40,
          targetCarbsPercentageMax: seed?.targetCarbsPercentageMax ?? seed?.targetCarbsPercentage ?? 40,
          targetFatPercentageMin: seed?.targetFatPercentageMin ?? seed?.targetFatPercentage ?? 30,
          targetFatPercentageMax: seed?.targetFatPercentageMax ?? seed?.targetFatPercentage ?? 30,
          sharedBatchesManualOnly: seed?.sharedBatchesManualOnly ?? true,
        }).returning();
        byPerson.set(person, created);
      }
    }

    return {
      A: byPerson.get("A") as UserSettings,
      B: byPerson.get("B") as UserSettings,
    };
  }

  private buildRecipeSnapshot(recipe?: RecipeWithIngredients | null): any | null {
    if (!recipe) return null;
    return JSON.parse(JSON.stringify({
      id: recipe.id,
      name: recipe.name,
      isFavorite: recipe.isFavorite,
      suggestedRecipeIds: recipe.suggestedRecipeIds || [],
      suggestedRecipes: (recipe as any).suggestedRecipes || [],
      tags: recipe.tags || [],
      description: recipe.description,
      instructions: recipe.instructions,
      comments: recipe.comments,
      instructionSteps: recipe.instructionSteps,
      prepTime: recipe.prepTime,
      imageUrl: recipe.imageUrl,
      servings: recipe.servings,
      preparationType: recipe.preparationType,
      defaultServingsA: recipe.defaultServingsA,
      defaultServingsB: recipe.defaultServingsB,
      ingredients: (recipe.ingredients || []).map((ingredient: any) => ({ ...ingredient })),
      frequentAddons: ((recipe as any).frequentAddons || []).map((addon: any) => ({ ...addon })),
      prepTasks: ((recipe as any).prepTasks || []).map((task: any) => ({ ...task })),
    }));
  }

  private applyRecipeSnapshotsToEntries<T extends any[]>(entries: T): T {
    return entries.map((entry: any) => ({
      ...entry,
      recipe: entry.recipeSnapshot ? { ...(entry.recipe || {}), ...entry.recipeSnapshot } : entry.recipe,
      cookedBatch: entry.cookedBatch?.recipeSnapshot
        ? { ...entry.cookedBatch, recipe: { ...(entry.cookedBatch.recipe || {}), ...entry.cookedBatch.recipeSnapshot } }
        : entry.cookedBatch,
    })) as T;
  }

  private applyRecipeSnapshotToBatch(batch: any): any {
    return batch?.recipeSnapshot ? { ...batch, recipe: { ...(batch.recipe || {}), ...batch.recipeSnapshot } } : batch;
  }

  private getTodayDateString(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private buildSettingsHistoryPayload(person: "A" | "B", settings: UserSettings, effectiveDate: string) {
    return {
      person,
      effectiveDate,
      targetCalories: Number(settings.targetCalories) || 0,
      targetProtein: Number(settings.targetProtein) || 0,
      targetCarbs: Number(settings.targetCarbs) || 0,
      targetFat: Number(settings.targetFat) || 0,
      targetProteinPercentage: Number(settings.targetProteinPercentage) || 0,
      targetCarbsPercentage: Number(settings.targetCarbsPercentage) || 0,
      targetFatPercentage: Number(settings.targetFatPercentage) || 0,
      targetProteinPercentageMin: Number(settings.targetProteinPercentageMin ?? settings.targetProteinPercentage) || 0,
      targetProteinPercentageMax: Number(settings.targetProteinPercentageMax ?? settings.targetProteinPercentage) || 0,
      targetCarbsPercentageMin: Number(settings.targetCarbsPercentageMin ?? settings.targetCarbsPercentage) || 0,
      targetCarbsPercentageMax: Number(settings.targetCarbsPercentageMax ?? settings.targetCarbsPercentage) || 0,
      targetFatPercentageMin: Number(settings.targetFatPercentageMin ?? settings.targetFatPercentage) || 0,
      targetFatPercentageMax: Number(settings.targetFatPercentageMax ?? settings.targetFatPercentage) || 0,
    };
  }

  async getUserSettingsHistory(startDate: string, endDate: string): Promise<Record<"A" | "B", UserSettingsHistory[]>> {
    const current = await this.getUserSettings();
    const historyRows = await db.select()
      .from(userSettingsHistory)
      .where(lte(userSettingsHistory.effectiveDate, endDate))
      .orderBy(asc(userSettingsHistory.person), asc(userSettingsHistory.effectiveDate));

    const byPerson: Record<"A" | "B", UserSettingsHistory[]> = { A: [], B: [] };
    for (const person of ["A", "B"] as const) {
      const rows = historyRows.filter((row) => row.person === person);
      const hasBaseline = rows.some((row) => String(row.effectiveDate) <= startDate);
      byPerson[person] = hasBaseline
        ? rows
        : [this.buildSettingsHistoryPayload(person, current[person], "0001-01-01") as UserSettingsHistory, ...rows];
    }

    return byPerson;
  }

  async updateUserSettings(person: "A" | "B", updates: Partial<UserSettings>): Promise<UserSettings> {
    const current = await this.getUserSettings();
    const currentPerson = current[person];
    const today = this.getTodayDateString();

    await db.insert(userSettingsHistory)
      .values(this.buildSettingsHistoryPayload(person, currentPerson, "0001-01-01"))
      .onConflictDoNothing({ target: [userSettingsHistory.person, userSettingsHistory.effectiveDate] });

    const [updated] = await db.update(userSettings)
      .set(updates)
      .where(eq(userSettings.id, currentPerson.id))
      .returning();

    await db.insert(userSettingsHistory)
      .values(this.buildSettingsHistoryPayload(person, updated, today))
      .onConflictDoUpdate({
        target: [userSettingsHistory.person, userSettingsHistory.effectiveDate],
        set: this.buildSettingsHistoryPayload(person, updated, today),
      });

    return updated;
  }

  async getIngredients(search?: string, limit = 100, offset = 0): Promise<Ingredient[]> {
    const normalizedSearch = this.normalizeForSearch(search);
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const baseQuery = db.select({
      id: ingredients.id,
      name: ingredients.name,
      category: ingredients.category,
      calories: ingredients.calories,
      protein: ingredients.protein,
      carbs: ingredients.carbs,
      fat: ingredients.fat,
      unit: ingredients.unit,
      unitWeight: ingredients.unitWeight,
      unitDescription: ingredients.unitDescription,
      price: ingredients.price,
      packageSize: ingredients.packageSize,
      packagePrice: ingredients.packagePrice,
      pricingUpdatedAt: ingredients.pricingUpdatedAt,
      imageUrl: ingredients.imageUrl,
      alwaysAtHome: ingredients.alwaysAtHome,
      ediblePercentage: ingredients.ediblePercentage,
      increasePurchaseForWaste: ingredients.increasePurchaseForWaste,
      useSoon: ingredients.useSoon,
    }).from(ingredients);

    const query = normalizedSearch
      ? baseQuery.where(or(
          sql`${this.searchNormalizedSql(ingredients.name)} LIKE ${`%${normalizedSearch}%`}`,
          sql`${this.searchNormalizedSql(ingredients.category)} LIKE ${`%${normalizedSearch}%`}`,
        ))
      : baseQuery;

    return await query.orderBy(ingredients.name).limit(safeLimit).offset(safeOffset) as Ingredient[];
  }

  async countIngredients(search?: string): Promise<number> {
    const normalizedSearch = this.normalizeForSearch(search);
    const baseQuery = db.select({ count: sql<number>`count(*)` }).from(ingredients);
    const query = normalizedSearch
      ? baseQuery.where(or(
          sql`${this.searchNormalizedSql(ingredients.name)} LIKE ${`%${normalizedSearch}%`}`,
          sql`${this.searchNormalizedSql(ingredients.category)} LIKE ${`%${normalizedSearch}%`}`,
        ))
      : baseQuery;
    const [row] = await query;
    return Number(row?.count || 0);
  }

  async getIngredient(id: number): Promise<Ingredient | undefined> {
    const [ingredient] = await db.select().from(ingredients).where(eq(ingredients.id, id));
    return ingredient;
  }

  async createIngredient(ingredient: CreateIngredientRequest): Promise<Ingredient> {
    const payload = this.normalizeIngredientPricing({
      ...ingredient,
      name: this.normalizeText(ingredient.name),
      category: this.normalizeText(ingredient.category),
    });
    const [newIngredient] = await db.insert(ingredients).values({
      ...payload,
      pricingUpdatedAt: payload.pricingUpdatedAt ?? new Date(),
    }).returning();
    return newIngredient;
  }

  async updateIngredient(id: number, updates: Partial<Ingredient>): Promise<Ingredient> {
    const payload = this.normalizeIngredientPricing({
      ...updates,
      ...(Object.prototype.hasOwnProperty.call(updates, "name") ? { name: this.normalizeText(updates.name) } : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, "category") ? { category: this.normalizeText(updates.category) } : {}),
    });

    const pricingFields = ["packageSize", "packagePrice", "price"] as const;
    const hasPricingUpdate = pricingFields.some((field) => Object.prototype.hasOwnProperty.call(payload, field));

    if (hasPricingUpdate && !Object.prototype.hasOwnProperty.call(payload, "pricingUpdatedAt")) {
      const current = await this.getIngredient(id);
      if (!current) throw new Error("Ingredient not found");

      const pricingChanged = pricingFields.some((field) => {
        if (!Object.prototype.hasOwnProperty.call(payload, field)) return false;
        return Number(payload[field] ?? 0) !== Number(current[field] ?? 0);
      });

      if (pricingChanged) {
        Object.assign(payload, { pricingUpdatedAt: new Date() });
      }
    }

    const [updated] = await db.update(ingredients)
      .set(payload)
      .where(eq(ingredients.id, id))
      .returning();
    if (!updated) throw new Error("Ingredient not found");
    return updated;
  }

  async deleteIngredient(id: number): Promise<void> {
    await db.delete(ingredients).where(eq(ingredients.id, id));
  }

  async getRecipes(search?: string, ingredientId?: number, limit = 50, offset = 0): Promise<any[]> {
    const normalizedSearch = this.normalizeForSearch(search);
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    const searchWhere = normalizedSearch
      ? or(
          sql`${this.searchNormalizedSql(recipes.name)} LIKE ${`%${normalizedSearch}%`}`,
          sql`EXISTS (
            SELECT 1 FROM unnest(${recipes.tags}) AS tag
            WHERE lower(translate(tag, 'ĄĆĘŁŃÓŚŹŻąćęłńóśźż', 'ACELNOSZZacelnoszz')) LIKE ${`%${normalizedSearch}%`}
          )`,
          sql`EXISTS (
            SELECT 1
            FROM ${recipeIngredients}
            JOIN ${ingredients} ON ${ingredients.id} = ${recipeIngredients.ingredientId}
            WHERE ${recipeIngredients.recipeId} = ${recipes.id}
              AND ${this.searchNormalizedSql(ingredients.name)} LIKE ${`%${normalizedSearch}%`}
          )`,
        )
      : undefined;
    const ingredientWhere = ingredientId
      ? sql`EXISTS (
          SELECT 1
          FROM ${recipeIngredients}
          WHERE ${recipeIngredients.recipeId} = ${recipes.id}
            AND ${recipeIngredients.ingredientId} = ${Number(ingredientId)}
        )`
      : undefined;
    const recipeWhere = searchWhere && ingredientWhere
      ? and(searchWhere, ingredientWhere)
      : searchWhere || ingredientWhere;

    const rows = await db.query.recipes.findMany({
      where: recipeWhere,
      columns: {
        id: true,
        name: true,
        isFavorite: true,
        tags: true,
        description: true,
        instructions: true,
        comments: true,
        instructionSteps: true,
        prepTime: true,
        imageUrl: true,
        servings: true,
        preparationType: true,
        defaultServingsA: true,
        defaultServingsB: true,
        suggestedRecipeIds: true,
        suggestedRecipes: true,
        createdAt: true,
      },
      with: {
        ingredients: {
          columns: {
            id: true,
            recipeId: true,
            ingredientId: true,
            amount: true,
            baseAmount: true,
            unit: true,
            alternativeAmount: true,
            alternativeUnit: true,
            scalingType: true,
            scalingFormula: true,
            stepThresholds: true,
          },
          with: {
            ingredient: {
              columns: {
                id: true,
                name: true,
                category: true,
                calories: true,
                protein: true,
                carbs: true,
                fat: true,
                unit: true,
                unitWeight: true,
                price: true,
                ediblePercentage: true,
                increasePurchaseForWaste: true,
              }
            }
          }
        },
        prepTasks: {
          with: {
            ingredient: {
              columns: { id: true, name: true, unit: true }
            }
          }
        },
        frequentAddons: {
          columns: {
            id: true,
            recipeId: true,
            ingredientId: true,
            amount: true,
            baseAmount: true,
            defaultAmountA: true,
            defaultAmountB: true,
            unit: true,
            alternativeAmount: true,
            alternativeUnit: true,
            scalingType: true,
            scalingFormula: true,
            stepThresholds: true,
          },
          with: {
            ingredient: {
              columns: { id: true, name: true, unit: true, unitWeight: true, price: true }
            }
          }
        },
      },
      orderBy: (r, { desc }) => [desc(r.createdAt)],
      limit: safeLimit,
      offset: safeOffset,
    });

    return rows;
  }

  async getRecipeSearchIndex(): Promise<any[]> {
    return await db.query.recipes.findMany({
      columns: {
        id: true,
        name: true,
        isFavorite: true,
        tags: true,
        prepTime: true,
        imageUrl: true,
        servings: true,
        preparationType: true,
        defaultServingsA: true,
        defaultServingsB: true,
        suggestedRecipeIds: true,
        suggestedRecipes: true,
        createdAt: true,
      },
      with: {
        ingredients: {
          columns: {
            id: true,
            recipeId: true,
            ingredientId: true,
            amount: true,
            baseAmount: true,
            unit: true,
            scalingType: true,
            scalingFormula: true,
            stepThresholds: true,
          },
          with: {
            ingredient: {
              columns: {
                id: true,
                name: true,
                calories: true,
                protein: true,
                carbs: true,
                fat: true,
                unit: true,
                unitWeight: true,
                price: true,
              }
            }
          }
        },
        frequentAddons: {
          columns: {
            id: true,
            recipeId: true,
            ingredientId: true,
            amount: true,
            baseAmount: true,
            defaultAmountA: true,
            defaultAmountB: true,
            unit: true,
          },
          with: {
            ingredient: {
              columns: { id: true, name: true, unit: true, price: true }
            }
          }
        },
      },
      orderBy: (r, { desc }) => [desc(r.createdAt)],
    });
  }

  async countRecipes(search?: string, ingredientId?: number): Promise<number> {
    const normalizedSearch = this.normalizeForSearch(search);
    const searchWhere = normalizedSearch
      ? or(
          sql`${this.searchNormalizedSql(recipes.name)} LIKE ${`%${normalizedSearch}%`}`,
          sql`EXISTS (
            SELECT 1 FROM unnest(${recipes.tags}) AS tag
            WHERE lower(translate(tag, 'ĄĆĘŁŃÓŚŹŻąćęłńóśźż', 'ACELNOSZZacelnoszz')) LIKE ${`%${normalizedSearch}%`}
          )`,
          sql`EXISTS (
            SELECT 1
            FROM ${recipeIngredients}
            JOIN ${ingredients} ON ${ingredients.id} = ${recipeIngredients.ingredientId}
            WHERE ${recipeIngredients.recipeId} = ${recipes.id}
              AND ${this.searchNormalizedSql(ingredients.name)} LIKE ${`%${normalizedSearch}%`}
          )`,
        )
      : undefined;
    const ingredientWhere = ingredientId
      ? sql`EXISTS (
          SELECT 1
          FROM ${recipeIngredients}
          WHERE ${recipeIngredients.recipeId} = ${recipes.id}
            AND ${recipeIngredients.ingredientId} = ${Number(ingredientId)}
        )`
      : undefined;
    const recipeWhere = searchWhere && ingredientWhere
      ? and(searchWhere, ingredientWhere)
      : searchWhere || ingredientWhere;

    const baseQuery = db.select({ count: sql<number>`count(*)` }).from(recipes);
    const query = recipeWhere ? baseQuery.where(recipeWhere) : baseQuery;
    const [row] = await query;
    return Number(row?.count || 0);
  }

  async getRecipeEatCounts(): Promise<Map<number, number>> {
    const rows = await db.select({
      recipeId: mealEntries.recipeId,
      eventKey: sql<string>`CASE WHEN ${mealEntries.cookedBatchId} IS NOT NULL THEN 'batch:' || ${mealEntries.cookedBatchId}::text ELSE 'day:' || ${mealEntries.date} END`,
    }).from(mealEntries).where(sql`${mealEntries.recipeId} IS NOT NULL`);

    const eventsByRecipe = new Map<number, Set<string>>();
    for (const row of rows) {
      const recipeId = Number(row.recipeId);
      if (!Number.isFinite(recipeId) || recipeId <= 0) continue;
      const events = eventsByRecipe.get(recipeId) || new Set<string>();
      events.add(String(row.eventKey));
      eventsByRecipe.set(recipeId, events);
    }
    return new Map(Array.from(eventsByRecipe.entries()).map(([recipeId, events]) => [recipeId, events.size]));
  }

  async getRecipe(id: number): Promise<RecipeWithIngredients | undefined> {
    const recipe = await db.query.recipes.findFirst({
      where: eq(recipes.id, id),
      with: {
        ingredients: {
          with: {
            ingredient: true
          }
        },
        frequentAddons: {
          with: {
            ingredient: true
          }
        },
        prepTasks: {
          with: {
            ingredient: true
          }
        }
      }
    });
    return recipe as RecipeWithIngredients | undefined;
  }

  async createRecipe(req: CreateRecipeRequest & { instructionSteps?: InstructionStep[]; ingredients: { ingredientId: number; groupName?: string | null; amount: number; baseAmount?: number; unit?: string; alternativeAmount?: number; alternativeUnit?: string; scalingType?: "LINEAR" | "FIXED" | "STEP" | "FORMULA"; scalingFormula?: string; stepThresholds?: { minServings: number; maxServings?: number | null; amount: number }[]; mealPrep?: boolean; mealPrepMaxDaysBefore?: number; mealPrepNotes?: string | null }[]; frequentAddons?: { ingredientId: number; amount: number; baseAmount?: number; defaultAmountA?: number; defaultAmountB?: number; unit?: string; alternativeAmount?: number; alternativeUnit?: string; scalingType?: "LINEAR" | "FIXED" | "STEP" | "FORMULA"; scalingFormula?: string; stepThresholds?: { minServings: number; maxServings?: number | null; amount: number }[] }[]; prepTasks?: { title: string; ingredientId?: number | null; ingredientSource?: string; maxDaysBefore: number; groupKey?: string | null; notes?: string | null }[] }): Promise<RecipeWithIngredients> {
    const [recipe] = await db.insert(recipes).values({
      name: req.name,
      tags: req.tags,
      description: req.description,
      instructions: req.instructions,
      comments: req.comments,
      instructionSteps: req.instructionSteps,
      prepTime: req.prepTime,
      imageUrl: req.imageUrl,
      isFavorite: req.isFavorite ?? false,
      suggestedRecipeIds: req.suggestedRecipeIds || [],
      suggestedRecipes: (req as any).suggestedRecipes || ((req.suggestedRecipeIds || []).map((recipeId: number) => ({ recipeId, servings: 1 }))),
      servings: req.servings || 1,
      preparationType: (req as any).preparationType || "INDIVIDUAL",
    }).returning();

    if (req.ingredients.length > 0) {
      await db.insert(recipeIngredients).values(
        req.ingredients.map(i => ({
          recipeId: recipe.id,
          ingredientId: i.ingredientId,
          groupName: i.groupName?.trim() || null,
          amount: Math.round(i.amount),
          baseAmount: i.baseAmount ?? i.amount,
          unit: i.unit || "g",
          alternativeAmount: i.alternativeAmount,
          alternativeUnit: i.alternativeUnit,
          scalingType: i.scalingType || "LINEAR",
          scalingFormula: i.scalingFormula,
          stepThresholds: i.stepThresholds,
          mealPrep: !!i.mealPrep,
          mealPrepMaxDaysBefore: Math.max(1, Math.round(Number(i.mealPrepMaxDaysBefore) || 1)),
          mealPrepNotes: i.mealPrepNotes?.trim() || null,
        }))
      );
    }

    if (req.frequentAddons && req.frequentAddons.length > 0) {
      await db.insert(recipeFrequentAddons).values(
        req.frequentAddons.map((i) => ({
          recipeId: recipe.id,
          ingredientId: i.ingredientId,
          amount: Math.round(i.amount),
          baseAmount: i.baseAmount ?? i.amount,
          defaultAmountA: i.defaultAmountA ?? 0,
          defaultAmountB: i.defaultAmountB ?? (i.baseAmount ?? i.amount),
          unit: i.unit || "g",
          alternativeAmount: i.alternativeAmount,
          alternativeUnit: i.alternativeUnit,
          scalingType: i.scalingType || "LINEAR",
          scalingFormula: i.scalingFormula,
          stepThresholds: i.stepThresholds,
        }))
      );
    }

    const prepTaskRows = (req.prepTasks || [])
      .filter((task) => task.title?.trim())
      .map((task) => ({
        recipeId: recipe.id,
        title: task.title.trim(),
        ingredientId: task.ingredientId ? Number(task.ingredientId) : null,
        ingredientSource: task.ingredientSource || "ingredient",
        maxDaysBefore: Math.max(1, Math.round(Number(task.maxDaysBefore) || 1)),
        groupKey: task.groupKey?.trim() || null,
        notes: task.notes?.trim() || null,
      }));
    if (prepTaskRows.length > 0) {
      await db.insert(recipePrepTasks).values(prepTaskRows);
    }

    return this.getRecipe(recipe.id) as Promise<RecipeWithIngredients>;
  }

  async updateRecipe(id: number, req: CreateRecipeRequest & { resetEditedMealIngredients?: boolean; instructionSteps?: InstructionStep[]; ingredients: { ingredientId: number; groupName?: string | null; amount: number; baseAmount?: number; unit?: string; alternativeAmount?: number; alternativeUnit?: string; scalingType?: "LINEAR" | "FIXED" | "STEP" | "FORMULA"; scalingFormula?: string; stepThresholds?: { minServings: number; maxServings?: number | null; amount: number }[]; mealPrep?: boolean; mealPrepMaxDaysBefore?: number; mealPrepNotes?: string | null }[]; frequentAddons?: { ingredientId: number; amount: number; baseAmount?: number; defaultAmountA?: number; defaultAmountB?: number; unit?: string; alternativeAmount?: number; alternativeUnit?: string; scalingType?: "LINEAR" | "FIXED" | "STEP" | "FORMULA"; scalingFormula?: string; stepThresholds?: { minServings: number; maxServings?: number | null; amount: number }[] }[]; prepTasks?: { title: string; ingredientId?: number | null; ingredientSource?: string; maxDaysBefore: number; groupKey?: string | null; notes?: string | null }[] }): Promise<RecipeWithIngredients> {
    const existingRecipe = await this.getRecipe(id);
    if (!existingRecipe) throw new Error("Recipe not found");

    // Planned meals and cooked batches keep immutable recipe snapshots, so editing
    // the base recipe only updates the recipe database.

    await db.update(recipes)
      .set({
        name: req.name,
        tags: req.tags,
        description: req.description,
        instructions: req.instructions,
        comments: req.comments,
        instructionSteps: req.instructionSteps,
        prepTime: req.prepTime,
        imageUrl: req.imageUrl,
        isFavorite: req.isFavorite,
        suggestedRecipeIds: req.suggestedRecipeIds || [],
        suggestedRecipes: (req as any).suggestedRecipes || ((req.suggestedRecipeIds || []).map((recipeId: number) => ({ recipeId, servings: 1 }))),
        servings: req.servings || 1,
        preparationType: (req as any).preparationType || existingRecipe.preparationType || "INDIVIDUAL",
      })
      .where(eq(recipes.id, id));

    await db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id));
    await db.delete(recipeFrequentAddons).where(eq(recipeFrequentAddons.recipeId, id));
    await db.delete(recipePrepTasks).where(eq(recipePrepTasks.recipeId, id));

    if (req.ingredients.length > 0) {
      await db.insert(recipeIngredients).values(
        req.ingredients.map(i => ({
          recipeId: id,
          ingredientId: i.ingredientId,
          groupName: i.groupName?.trim() || null,
          amount: Math.round(i.amount),
          baseAmount: i.baseAmount ?? i.amount,
          unit: i.unit || "g",
          alternativeAmount: i.alternativeAmount,
          alternativeUnit: i.alternativeUnit,
          scalingType: i.scalingType || "LINEAR",
          scalingFormula: i.scalingFormula,
          stepThresholds: i.stepThresholds,
          mealPrep: !!i.mealPrep,
          mealPrepMaxDaysBefore: Math.max(1, Math.round(Number(i.mealPrepMaxDaysBefore) || 1)),
          mealPrepNotes: i.mealPrepNotes?.trim() || null,
        }))
      );
    }

    if (req.frequentAddons && req.frequentAddons.length > 0) {
      await db.insert(recipeFrequentAddons).values(
        req.frequentAddons.map((i) => ({
          recipeId: id,
          ingredientId: i.ingredientId,
          amount: Math.round(i.amount),
          baseAmount: i.baseAmount ?? i.amount,
          defaultAmountA: i.defaultAmountA ?? 0,
          defaultAmountB: i.defaultAmountB ?? (i.baseAmount ?? i.amount),
          unit: i.unit || "g",
          alternativeAmount: i.alternativeAmount,
          alternativeUnit: i.alternativeUnit,
          scalingType: i.scalingType || "LINEAR",
          scalingFormula: i.scalingFormula,
          stepThresholds: i.stepThresholds,
        }))
      );
    }

    const prepTaskRows = (req.prepTasks || [])
      .filter((task) => task.title?.trim())
      .map((task) => ({
        recipeId: id,
        title: task.title.trim(),
        ingredientId: task.ingredientId ? Number(task.ingredientId) : null,
        ingredientSource: task.ingredientSource || "ingredient",
        maxDaysBefore: Math.max(1, Math.round(Number(task.maxDaysBefore) || 1)),
        groupKey: task.groupKey?.trim() || null,
        notes: task.notes?.trim() || null,
      }));
    if (prepTaskRows.length > 0) {
      await db.insert(recipePrepTasks).values(prepTaskRows);
    }

    return this.getRecipe(id) as Promise<RecipeWithIngredients>;
  }

  async deleteRecipe(id: number): Promise<void> {
    const entriesToPreserve = await db.query.mealEntries.findMany({
      where: eq(mealEntries.recipeId, id),
      with: {
        recipe: {
          with: {
            ingredients: {
              with: {
                ingredient: true,
              },
            },
          },
        },
        ingredients: {
          with: {
            ingredient: true,
          },
        },
      },
    });

    await db.transaction(async (tx) => {
      for (const entry of entriesToPreserve as MealEntryWithRecipe[]) {
        const servings = Number(entry.servings) || 1;
        const baseServings = Number(entry.recipe?.servings) || 1;
        const ingredientRows = entry.ingredients?.length ? entry.ingredients : (entry.recipe?.ingredients || []);
        const totals = ingredientRows.reduce((sum, row: any) => {
          if (!row?.ingredient) return sum;
          const amount = calculateScaledAmount(row, servings, baseServings);
          const multiplier = calculateNutritionAmount(amount, row.ingredient) / 100;
          return {
            calories: sum.calories + (Number(row.ingredient.calories) || 0) * multiplier,
            protein: sum.protein + (Number(row.ingredient.protein) || 0) * multiplier,
            carbs: sum.carbs + (Number(row.ingredient.carbs) || 0) * multiplier,
            fat: sum.fat + (Number(row.ingredient.fat) || 0) * multiplier,
          };
        }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

        await tx.update(mealEntries)
          .set({
            recipeId: null,
            cookedBatchId: null,
            customName: entry.recipe?.name || entry.customName || "Usunięty przepis",
            customCalories: Math.round(totals.calories),
            customProtein: Number(totals.protein.toFixed(1)),
            customCarbs: Number(totals.carbs.toFixed(1)),
            customFat: Number(totals.fat.toFixed(1)),
            servings: 1,
          })
          .where(eq(mealEntries.id, entry.id));

        await tx.delete(mealEntryIngredients).where(eq(mealEntryIngredients.mealEntryId, entry.id));
      }

      await tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id));
      await tx.delete(recipeFrequentAddons).where(eq(recipeFrequentAddons.recipeId, id));
      await tx.delete(recipePrepTasks).where(eq(recipePrepTasks.recipeId, id));
      await tx.delete(recipes).where(eq(recipes.id, id));
    });
  }

  async getDayEntries(date: string): Promise<MealEntryWithRecipe[]> {
    const entries = await db.query.mealEntries.findMany({
      where: eq(mealEntries.date, date),
      with: {
        recipe: {
          with: {
            ingredients: {
              with: {
                ingredient: true
              }
            },
            frequentAddons: {
              with: {
                ingredient: true
              }
            },
            prepTasks: {
              with: {
                ingredient: true
              }
            }
          }
        },
        cookedBatch: true,
        ingredients: {
          with: {
            ingredient: true
          }
        }
      }
    });
    return this.applyRecipeSnapshotsToEntries(entries) as MealEntryWithRecipe[];
  }

  async getMealEntryById(id: number): Promise<MealEntryWithRecipe | undefined> {
    const entry = await db.query.mealEntries.findFirst({
      where: eq(mealEntries.id, id),
      with: {
        recipe: {
          with: {
            ingredients: {
              with: {
                ingredient: true
              }
            },
            frequentAddons: {
              with: {
                ingredient: true
              }
            },
            prepTasks: {
              with: {
                ingredient: true
              }
            }
          }
        },
        cookedBatch: true,
        ingredients: {
          with: {
            ingredient: true
          }
        }
      }
    });

    return entry ? this.applyRecipeSnapshotsToEntries([entry])[0] as MealEntryWithRecipe : undefined;
  }

  async createMealEntry(entry: CreateMealEntryRequest & { createSharedBatch?: boolean; sharedBatchServings?: number }): Promise<MealEntry> {
    const { createSharedBatch, sharedBatchServings, ...entryData } = entry;
    let cookedBatchId = entryData.cookedBatchId;
    let recipeSnapshot: any | null = null;

    if (entryData.recipeId) {
      if (cookedBatchId) {
        const cookedBatch = await db.query.sharedMealBatches.findFirst({ where: eq(sharedMealBatches.id, Number(cookedBatchId)) });
        recipeSnapshot = (cookedBatch as any)?.recipeSnapshot || null;
      }
      if (!recipeSnapshot) {
        recipeSnapshot = this.buildRecipeSnapshot(await this.getRecipe(Number(entryData.recipeId)));
      }
    }

    const portionMode = entryData.portionMode || "SCALED";
    if (entryData.recipeId && !cookedBatchId) {
      const recipe = await this.getRecipe(Number(entryData.recipeId));
      const recipeServings = Number(recipe?.servings) || 1;
      const requestedServings = Number(entryData.servings) || 1;
      const settings = await this.getUserSettings();
      const manualOnly = !!settings?.A?.sharedBatchesManualOnly;
      const shouldCreateSharedBatch = portionMode === "BATCH_ALLOCATION" || createSharedBatch === true || (!manualOnly && createSharedBatch !== false);

      if (recipe) {
        const activeBatches = await this.getSharedMealBatches();
        const existingBatch = activeBatches.find((batch: any) => (
          Number(batch.recipeId) === Number(entryData.recipeId)
          && (portionMode === "BATCH_ALLOCATION" || Number(batch.remainingServings || 0) >= requestedServings)
        ));

        if (existingBatch) {
          cookedBatchId = Number(existingBatch.id);
        } else if (shouldCreateSharedBatch && recipeServings > 1) {
          const configuredBatchServings = Number(sharedBatchServings);
          const totalServingsToCook = Number.isFinite(configuredBatchServings) && configuredBatchServings > 0 ? configuredBatchServings : recipeServings;

          const [autoBatch] = await db.insert(sharedMealBatches).values({
            recipeId: Number(entryData.recipeId),
            totalServings: totalServingsToCook,
            note: "Auto",
            isArchived: false,
            recipeSnapshot: this.buildRecipeSnapshot(recipe),
          }).returning();
          cookedBatchId = autoBatch.id;
        }
      }
    }

    const [newEntry] = await db.insert(mealEntries).values({
      ...entryData,
      portionMode,
      cookedBatchId,
      recipeSnapshot,
    }).returning();
    
    // If it's a recipe, clone its ingredients to the entry for independent editing
    if (entryData.recipeId) {
      const recipe = await this.getRecipe(entryData.recipeId);
      if (recipe && recipe.ingredients.length > 0) {
        await db.insert(mealEntryIngredients).values(
          recipe.ingredients.map(ri => ({
            mealEntryId: newEntry.id,
            ingredientId: ri.ingredientId,
            amount: Number(ri.baseAmount ?? ri.amount) || 0, // immutable base snapshot; no calculation rounding
            scalingType: ri.scalingType || "LINEAR"
          }))
        );
      }
    }
    
    return newEntry;
  }

  async updateMealEntry(id: number, updates: Partial<MealEntry>): Promise<MealEntry> {
    const [updated] = await db.update(mealEntries)
      .set(updates)
      .where(eq(mealEntries.id, id))
      .returning();
    if (!updated) throw new Error("Meal entry not found");
    
    // Clear relations from cache by refetching
    return updated;
  }

  async updateMealEntryIngredients(mealEntryId: number, ingredientsList: { ingredientId: number; amount: number; overrideAmount?: number | null; scalingType?: "LINEAR" | "FIXED" | "STEP" | "FORMULA" }[]): Promise<void> {
    await db.transaction(async (tx) => {
      // Delete existing and insert new in one transaction
      await tx.delete(mealEntryIngredients).where(eq(mealEntryIngredients.mealEntryId, mealEntryId));
      if (ingredientsList.length > 0) {
        await tx.insert(mealEntryIngredients).values(
          ingredientsList.map(i => ({
            mealEntryId,
            ingredientId: i.ingredientId,
            amount: i.amount,
            overrideAmount: i.overrideAmount ?? null,
            scalingType: i.scalingType || "LINEAR"
          }))
        );
      }
    });
    // Optional: add a small delay or logging to verify
    console.log(`Ingredients updated for meal entry ${mealEntryId}`);
  }


  async getAppState(key: string): Promise<any> {
    const [row] = await db.select().from(appState).where(eq(appState.key, key));
    return row?.data ?? null;
  }

  async setAppState(key: string, data: any): Promise<any> {
    const payload = data ?? {};
    const [row] = await db.insert(appState)
      .values({ key, data: payload, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appState.key,
        set: { data: payload, updatedAt: new Date() },
      })
      .returning();
    return row.data;
  }

  async getStatsDayExclusions(startDate: string, endDate: string): Promise<{ date: string; reason: string; updatedAt: Date | null }[]> {
    const rows = await db.select().from(statsDayExclusions).where(
      and(
        gte(statsDayExclusions.date, startDate),
        lte(statsDayExclusions.date, endDate),
      )
    );

    return rows.map((row) => ({
      date: row.date,
      reason: row.reason,
      updatedAt: row.updatedAt ?? null,
    }));
  }

  async setStatsDayExclusion(date: string, reason?: string): Promise<void> {
    const trimmedReason = String(reason ?? "").trim();

    if (reason !== undefined && !trimmedReason) {
      await db.delete(statsDayExclusions).where(eq(statsDayExclusions.date, date));
      return;
    }

    const savedReason = trimmedReason || "Wykluczony dzień";

    await db.insert(statsDayExclusions)
      .values({ date, reason: savedReason, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: statsDayExclusions.date,
        set: { reason: savedReason, updatedAt: new Date() },
      });
  }

  async getBodyMeasurements(input: { person?: "A" | "B"; startDate?: string; endDate?: string }): Promise<BodyMeasurement[]> {
    const conditions = [];
    if (input.person) conditions.push(eq(bodyMeasurements.person, input.person));
    if (input.startDate) conditions.push(gte(bodyMeasurements.date, input.startDate));
    if (input.endDate) conditions.push(lte(bodyMeasurements.date, input.endDate));

    const query = db.select().from(bodyMeasurements);
    const rows = conditions.length > 0
      ? await query.where(and(...conditions)).orderBy(desc(bodyMeasurements.date), asc(bodyMeasurements.person))
      : await query.orderBy(desc(bodyMeasurements.date), asc(bodyMeasurements.person));
    return rows;
  }

  async upsertBodyMeasurement(input: Omit<BodyMeasurement, "id" | "createdAt" | "updatedAt">): Promise<BodyMeasurement> {
    const payload = { ...input, updatedAt: new Date() };
    const [row] = await db.insert(bodyMeasurements)
      .values(payload)
      .onConflictDoUpdate({
        target: [bodyMeasurements.person, bodyMeasurements.date],
        set: payload,
      })
      .returning();
    return row;
  }

  async deleteBodyMeasurement(id: number): Promise<void> {
    await db.delete(bodyMeasurements).where(eq(bodyMeasurements.id, id));
  }

  async copyDayEntries(sourceDate: string, targetDate: string, replaceTarget = true): Promise<number> {
    if (sourceDate === targetDate) {
      throw new Error("Dzień źródłowy i docelowy muszą się różnić");
    }

    const sourceEntries = await this.getDayEntries(sourceDate);

    await db.transaction(async (tx) => {
      if (replaceTarget) {
        const existingTargetEntries = await tx.select({ id: mealEntries.id })
          .from(mealEntries)
          .where(eq(mealEntries.date, targetDate));

        const targetEntryIds = existingTargetEntries.map((entry) => entry.id);
        if (targetEntryIds.length > 0) {
          await tx.delete(mealEntryIngredients).where(inArray(mealEntryIngredients.mealEntryId, targetEntryIds));
          await tx.delete(mealEntries).where(inArray(mealEntries.id, targetEntryIds));
        }
      }

      for (const sourceEntry of sourceEntries) {
        const [copiedEntry] = await tx.insert(mealEntries).values({
          date: targetDate,
          recipeId: sourceEntry.recipeId,
          customName: sourceEntry.customName,
          customCalories: sourceEntry.customCalories,
          customProtein: sourceEntry.customProtein,
          customCarbs: sourceEntry.customCarbs,
          customFat: sourceEntry.customFat,
          mealType: sourceEntry.mealType,
          person: sourceEntry.person,
          servings: sourceEntry.servings,
          isEaten: sourceEntry.isEaten,
        }).returning();

        const sourceIngredients = sourceEntry.ingredients || [];
        if (sourceIngredients.length > 0) {
          await tx.insert(mealEntryIngredients).values(sourceIngredients.map((ingredient) => ({
            mealEntryId: copiedEntry.id,
            ingredientId: ingredient.ingredientId,
            amount: ingredient.amount,
            scalingType: ingredient.scalingType || "LINEAR",
          })));
        }
      }
    });

    return sourceEntries.length;
  }

  async deleteMealEntry(id: number): Promise<void> {
    await db.delete(mealEntryIngredients).where(eq(mealEntryIngredients.mealEntryId, id));
    await db.delete(mealEntries).where(eq(mealEntries.id, id));
  }

  async getMealEntriesRange(startDate: string, endDate: string): Promise<MealEntryWithRecipe[]> {
    const normalizedStart = String(startDate).slice(0, 10);
    const normalizedEnd = String(endDate).slice(0, 10);

    const entries = await db.query.mealEntries.findMany({
      with: {
        recipe: {
          with: {
            ingredients: {
              with: {
                ingredient: true
              }
            },
            frequentAddons: {
              with: {
                ingredient: true
              }
            },
            prepTasks: {
              with: {
                ingredient: true
              }
            }
          }
        },
        cookedBatch: true,
        ingredients: {
          with: {
            ingredient: true
          }
        }
      }
    });

    const rangedEntries = entries.filter((entry) => {
      const dateOnly = String(entry.date || "").slice(0, 10);
      return dateOnly >= normalizedStart && dateOnly <= normalizedEnd;
    });

    return this.applyRecipeSnapshotsToEntries(rangedEntries) as MealEntryWithRecipe[];
  }

  async getSharedMealBatches(): Promise<any[]> {
    return this.getSharedMealBatchesByArchived(false);
  }

  async getArchivedSharedMealBatches(): Promise<any[]> {
    return this.getSharedMealBatchesByArchived(true);
  }

  private async getSharedMealBatchesByArchived(isArchived: boolean): Promise<any[]> {
    const batches = await db.query.sharedMealBatches.findMany({
      where: eq(sharedMealBatches.isArchived, isArchived),
      with: {
        recipe: {
          with: {
            ingredients: { with: { ingredient: true } },
            frequentAddons: { with: { ingredient: true } },
          },
        },
        mealEntries: true,
        logs: true,
      },
      orderBy: (b, { desc }) => [desc(b.createdAt)],
    });

    return batches.map((rawBatch: any) => {
      const batch = this.applyRecipeSnapshotToBatch(rawBatch);
      const allocatedServings = (batch.mealEntries || []).reduce((sum: number, entry: any) => sum + (Number(entry.servings) || 0), 0);
      return {
        ...batch,
        allocatedServings,
        remainingServings: Math.max(0, (Number(batch.totalServings) || 0) - allocatedServings),
        logs: (batch.logs || []).sort((a: any, b: any) => Number(new Date(b.createdAt)) - Number(new Date(a.createdAt))),
      };
    });
  }

  async getSharedMealBatchLogs(batchId: number): Promise<SharedMealBatchLog[]> {
    return db.query.sharedMealBatchLogs.findMany({
      where: eq(sharedMealBatchLogs.batchId, batchId),
      orderBy: (logs, { desc }) => [desc(logs.createdAt)],
    });
  }

  async createSharedMealBatch(input: CreateSharedMealBatchRequest): Promise<SharedMealBatch> {
    const [created] = await db.insert(sharedMealBatches).values({
      recipeId: input.recipeId,
      totalServings: input.totalServings,
      note: input.note,
      recipeSnapshot: this.buildRecipeSnapshot(await this.getRecipe(Number(input.recipeId))),
      isArchived: input.isArchived ?? false,
    }).returning();
    await db.insert(sharedMealBatchLogs).values({
      batchId: created.id,
      action: "CREATED",
      payload: {
        recipeId: created.recipeId,
        totalServings: created.totalServings,
        note: created.note,
      },
    });
    return created;
  }

  async updateSharedMealBatch(id: number, updates: Partial<Pick<SharedMealBatch, "totalServings" | "note">>): Promise<SharedMealBatch> {
    const previous = await db.query.sharedMealBatches.findFirst({ where: eq(sharedMealBatches.id, id) });
    if (!previous) throw new Error("Shared meal batch not found");

    const payload: Partial<SharedMealBatch> = {};
    if (updates.totalServings !== undefined) payload.totalServings = updates.totalServings;
    if (updates.note !== undefined) payload.note = updates.note;

    const [updated] = await db.update(sharedMealBatches).set(payload).where(eq(sharedMealBatches.id, id)).returning();
    if (!updated) throw new Error("Shared meal batch not found");

    await db.insert(sharedMealBatchLogs).values({
      batchId: id,
      action: "UPDATED",
      payload: {
        before: { totalServings: previous.totalServings, note: previous.note },
        after: { totalServings: updated.totalServings, note: updated.note },
      },
    });

    return updated;
  }

  async archiveSharedMealBatch(id: number, isArchived: boolean): Promise<SharedMealBatch> {
    const [updated] = await db.update(sharedMealBatches).set({ isArchived }).where(eq(sharedMealBatches.id, id)).returning();
    if (!updated) throw new Error("Shared meal batch not found");
    await db.insert(sharedMealBatchLogs).values({
      batchId: id,
      action: isArchived ? "ARCHIVED" : "UNARCHIVED",
      payload: { isArchived },
    });
    return updated;
  }

  async deleteSharedMealBatch(id: number): Promise<void> {
    const existing = await db.query.sharedMealBatches.findFirst({ where: eq(sharedMealBatches.id, id) });
    if (!existing) throw new Error("Shared meal batch not found");

    await db.update(mealEntries).set({ cookedBatchId: null }).where(eq(mealEntries.cookedBatchId, id));
    await db.delete(sharedMealBatchLogs).where(eq(sharedMealBatchLogs.batchId, id));
    await db.delete(sharedMealBatches).where(eq(sharedMealBatches.id, id));
  }

  async getShoppingListChecks(periodStart: string, periodEnd: string): Promise<Record<number, boolean>> {
    const checks = await db.select().from(shoppingListChecks).where(
      and(
        lte(shoppingListChecks.periodStart, periodStart),
        gte(shoppingListChecks.periodEnd, periodEnd),
      )
    );

    const getPeriodLength = (start: string, end: string) => {
      const startDate = new Date(`${start}T00:00:00Z`);
      const endDate = new Date(`${end}T00:00:00Z`);
      const diff = endDate.getTime() - startDate.getTime();
      return Number.isFinite(diff) && diff >= 0 ? diff : Number.POSITIVE_INFINITY;
    };

    const bestByIngredient = new Map<number, (typeof checks)[number] & { isExact: boolean; periodLength: number }>();

    for (const check of checks) {
      const isExact = check.periodStart === periodStart && check.periodEnd === periodEnd;
      const periodLength = getPeriodLength(check.periodStart, check.periodEnd);
      const existing = bestByIngredient.get(check.ingredientId);

      if (!existing) {
        bestByIngredient.set(check.ingredientId, { ...check, isExact, periodLength });
        continue;
      }

      const isBetterMatch =
        // Exact match for selected range should always win.
        (isExact && !existing.isExact)
        // For same exactness, prefer narrower period (closer to requested range).
        || (isExact === existing.isExact && periodLength < existing.periodLength)
        // For ties, prefer the most recently updated status.
        || (isExact === existing.isExact
          && periodLength === existing.periodLength
          && (check.updatedAt?.getTime() ?? 0) > (existing.updatedAt?.getTime() ?? 0));

      if (isBetterMatch) {
        bestByIngredient.set(check.ingredientId, { ...check, isExact, periodLength });
      }
    }

    return Array.from(bestByIngredient.values()).reduce((acc, curr) => {
      acc[curr.ingredientId] = curr.isChecked;
      return acc;
    }, {} as Record<number, boolean>);
  }

  async toggleShoppingListCheck(ingredientId: number, periodStart: string, periodEnd: string, isChecked: boolean): Promise<void> {
    await db.insert(shoppingListChecks)
      .values({ ingredientId, periodStart, periodEnd, isChecked, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [shoppingListChecks.ingredientId, shoppingListChecks.periodStart, shoppingListChecks.periodEnd],
        set: { isChecked, updatedAt: new Date() }
      });
  }

  async getShoppingListExtras(periodStart: string, periodEnd: string): Promise<any[]> {
    return await db.select().from(shoppingListExtras).where(
      and(
        eq(shoppingListExtras.periodStart, periodStart),
        eq(shoppingListExtras.periodEnd, periodEnd),
      )
    );
  }

  async addShoppingListExtra(periodStart: string, periodEnd: string, input: { name: string; amount?: number; unit?: string; category?: string }): Promise<any> {
    const [created] = await db.insert(shoppingListExtras).values({
      periodStart,
      periodEnd,
      name: input.name,
      amount: input.amount ?? 1,
      unit: input.unit || "szt",
      category: input.category || "Dodatkowe",
    }).returning();
    return created;
  }

  async deleteShoppingListExtra(id: number): Promise<void> {
    await db.delete(shoppingListExtras).where(eq(shoppingListExtras.id, id));
  }

  async toggleShoppingListExtraCheck(id: number, isChecked: boolean): Promise<void> {
    await db.update(shoppingListExtras)
      .set({ isChecked })
      .where(eq(shoppingListExtras.id, id));
  }

  async getShoppingListExcludedItems(periodStart: string, periodEnd: string): Promise<number[]> {
    const rows = await db.select().from(shoppingListExcludedItems).where(
      and(
        lte(shoppingListExcludedItems.periodStart, periodStart),
        gte(shoppingListExcludedItems.periodEnd, periodEnd),
      )
    );

    const bestByIngredient = new Map<number, (typeof rows)[number] & { isExact: boolean; periodLength: number }>();

    const getPeriodLength = (start: string, end: string) => {
      const startDate = new Date(`${start}T00:00:00Z`);
      const endDate = new Date(`${end}T00:00:00Z`);
      const diff = endDate.getTime() - startDate.getTime();
      return Number.isFinite(diff) && diff >= 0 ? diff : Number.POSITIVE_INFINITY;
    };

    for (const row of rows) {
      const isExact = row.periodStart === periodStart && row.periodEnd === periodEnd;
      const periodLength = getPeriodLength(row.periodStart, row.periodEnd);
      const existing = bestByIngredient.get(row.ingredientId);

      if (!existing) {
        bestByIngredient.set(row.ingredientId, { ...row, isExact, periodLength });
        continue;
      }

      const isBetterMatch =
        (isExact && !existing.isExact)
        || (isExact === existing.isExact && periodLength < existing.periodLength)
        || (isExact === existing.isExact
          && periodLength === existing.periodLength
          && (row.updatedAt?.getTime() ?? 0) > (existing.updatedAt?.getTime() ?? 0));

      if (isBetterMatch) {
        bestByIngredient.set(row.ingredientId, { ...row, isExact, periodLength });
      }
    }

    return Array.from(bestByIngredient.keys());
  }

  async setShoppingListExcludedItem(ingredientId: number, periodStart: string, periodEnd: string, excluded: boolean): Promise<void> {
    if (excluded) {
      await db.insert(shoppingListExcludedItems)
        .values({ ingredientId, periodStart, periodEnd, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [shoppingListExcludedItems.ingredientId, shoppingListExcludedItems.periodStart, shoppingListExcludedItems.periodEnd],
          set: { updatedAt: new Date() }
        });
      return;
    }

    await db.delete(shoppingListExcludedItems).where(
      and(
        eq(shoppingListExcludedItems.ingredientId, ingredientId),
        lte(shoppingListExcludedItems.periodStart, periodStart),
        gte(shoppingListExcludedItems.periodEnd, periodEnd),
      )
    );
  }

  async createShoppingListSnapshot(input: { name: string; periodStart: string; periodEnd: string; items: { ingredientId?: number | null; name: string; totalAmount: number; unit: string; category?: string | null; status: "BOUGHT" | "AT_HOME" | "NOT_BOUGHT"; price?: number; isExtra?: boolean }[] }): Promise<any> {
    const [snapshot] = await db.insert(shoppingListSnapshots).values({
      name: input.name,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: "ACTIVE",
      completedAt: null,
    }).returning();

    if (input.items.length > 0) {
      await db.insert(shoppingListSnapshotItems).values(
        input.items.map((item) => ({
          snapshotId: snapshot.id,
          ingredientId: item.ingredientId ?? null,
          name: item.name,
          totalAmount: Number(item.totalAmount || 0),
          unit: item.unit || "g",
          category: item.category || "Inne",
          status: item.status,
          price: Number(item.price || 0),
          isExtra: !!item.isExtra,
        }))
      );
    }

    return snapshot;
  }

  async getShoppingListSnapshots(): Promise<any[]> {
    const snapshots = await db.select().from(shoppingListSnapshots).where(eq(shoppingListSnapshots.status, "COMPLETED")).orderBy(desc(shoppingListSnapshots.completedAt), desc(shoppingListSnapshots.createdAt));
    if (snapshots.length === 0) return [];

    const items = await db.select().from(shoppingListSnapshotItems).where(
      inArray(shoppingListSnapshotItems.snapshotId, snapshots.map((s) => s.id))
    );

    const itemsBySnapshot = new Map<number, any[]>();
    for (const item of items) {
      const arr = itemsBySnapshot.get(item.snapshotId) || [];
      arr.push(item);
      itemsBySnapshot.set(item.snapshotId, arr);
    }

    const ingredientIds = Array.from(new Set(
      items
        .map((item) => Number(item.ingredientId))
        .filter((id) => Number.isFinite(id) && id > 0)
    ));

    const ingredientRows = ingredientIds.length > 0
      ? await db.select({ id: ingredients.id, price: ingredients.price }).from(ingredients).where(inArray(ingredients.id, ingredientIds))
      : [];
    const ingredientPriceMap = new Map<number, number>(ingredientRows.map((row) => [row.id, Number(row.price || 0)]));

    return snapshots.map((snapshot) => {
      const snapshotItems = itemsBySnapshot.get(snapshot.id) || [];
      const totalCost = this.calculateSnapshotTotalCost(snapshotItems, ingredientPriceMap);
      const stats = snapshotItems.reduce((acc, item) => {
        if (item.status === "BOUGHT") acc.bought += 1;
        if (item.status === "AT_HOME") acc.atHome += 1;
        if (item.status === "NOT_BOUGHT") acc.notBought += 1;
        return acc;
      }, { bought: 0, atHome: 0, notBought: 0 });

      return {
        ...snapshot,
        itemCount: snapshotItems.length,
        totalCost,
        ...stats,
      };
    });
  }



  async getActiveShoppingListSnapshots(): Promise<any[]> {
    const snapshots = await db.select().from(shoppingListSnapshots).where(eq(shoppingListSnapshots.status, "ACTIVE")).orderBy(desc(shoppingListSnapshots.createdAt));
    if (snapshots.length === 0) return [];

    const items = await db.select().from(shoppingListSnapshotItems).where(
      inArray(shoppingListSnapshotItems.snapshotId, snapshots.map((s) => s.id))
    );

    const itemsBySnapshot = new Map<number, any[]>();
    for (const item of items) {
      const arr = itemsBySnapshot.get(item.snapshotId) || [];
      arr.push(item);
      itemsBySnapshot.set(item.snapshotId, arr);
    }

    const ingredientIds = Array.from(new Set(
      items
        .map((item) => Number(item.ingredientId))
        .filter((id) => Number.isFinite(id) && id > 0)
    ));

    const ingredientRows = ingredientIds.length > 0
      ? await db.select({ id: ingredients.id, price: ingredients.price }).from(ingredients).where(inArray(ingredients.id, ingredientIds))
      : [];
    const ingredientPriceMap = new Map<number, number>(ingredientRows.map((row) => [row.id, Number(row.price || 0)]));

    return snapshots.map((snapshot) => {
      const snapshotItems = itemsBySnapshot.get(snapshot.id) || [];
      const totalCost = this.calculateSnapshotTotalCost(snapshotItems, ingredientPriceMap);
      const stats = snapshotItems.reduce((acc, item) => {
        if (item.status === "BOUGHT") acc.bought += 1;
        if (item.status === "AT_HOME") acc.atHome += 1;
        if (item.status === "NOT_BOUGHT") acc.notBought += 1;
        return acc;
      }, { bought: 0, atHome: 0, notBought: 0 });

      return {
        ...snapshot,
        itemCount: snapshotItems.length,
        totalCost,
        ...stats,
      };
    });
  }

  async getShoppingListSnapshotById(snapshotId: number): Promise<any | undefined> {
    const [snapshot] = await db.select().from(shoppingListSnapshots).where(eq(shoppingListSnapshots.id, snapshotId));
    if (!snapshot) return undefined;

    const items = await db.select().from(shoppingListSnapshotItems).where(eq(shoppingListSnapshotItems.snapshotId, snapshotId));
    const ingredientIds = Array.from(new Set(
      items
        .map((item) => Number(item.ingredientId))
        .filter((id) => Number.isFinite(id) && id > 0)
    ));

    const ingredientWeights = ingredientIds.length > 0
      ? await db.select({ id: ingredients.id, unitWeight: ingredients.unitWeight }).from(ingredients).where(inArray(ingredients.id, ingredientIds))
      : [];

    const weightMap = new Map<number, number | null>(ingredientWeights.map((row) => [row.id, row.unitWeight]));
    const enrichedItems = items.map((item) => ({
      ...item,
      unitWeight: Number(item.ingredientId) > 0 ? (weightMap.get(Number(item.ingredientId)) ?? null) : null,
    }));

    return { ...snapshot, items: enrichedItems };
  }



  async completeShoppingListSnapshot(snapshotId: number): Promise<any | undefined> {
    const [updated] = await db.update(shoppingListSnapshots)
      .set({ status: "COMPLETED", completedAt: new Date() })
      .where(eq(shoppingListSnapshots.id, snapshotId))
      .returning();

    return updated;
  }

  async deleteShoppingListSnapshot(snapshotId: number): Promise<void> {
    await db.delete(shoppingListSnapshots).where(eq(shoppingListSnapshots.id, snapshotId));
  }

  async updateShoppingListSnapshotItem(snapshotItemId: number, input: { status?: "BOUGHT" | "AT_HOME" | "NOT_BOUGHT"; price?: number; name?: string; totalAmount?: number; unit?: string; category?: string }): Promise<any> {
    const payload: any = {};
    if (input.status) payload.status = input.status;
    if (input.price !== undefined) payload.price = input.price;
    if (input.name !== undefined) payload.name = input.name;
    if (input.totalAmount !== undefined) payload.totalAmount = input.totalAmount;
    if (input.unit !== undefined) payload.unit = input.unit;
    if (input.category !== undefined) payload.category = input.category;

    const [updated] = await db.update(shoppingListSnapshotItems).set(payload).where(eq(shoppingListSnapshotItems.id, snapshotItemId)).returning();
    return updated;
  }

  async addShoppingListSnapshotItem(snapshotId: number, input: { name: string; totalAmount: number; unit: string; category?: string; status?: "BOUGHT" | "AT_HOME" | "NOT_BOUGHT"; price?: number }): Promise<any> {
    const [created] = await db.insert(shoppingListSnapshotItems).values({
      snapshotId,
      ingredientId: null,
      name: input.name,
      totalAmount: input.totalAmount,
      unit: input.unit,
      category: input.category || "Inne",
      status: input.status || "NOT_BOUGHT",
      price: Number(input.price || 0),
      isExtra: true,
    }).returning();

    return created;
  }

  async deleteShoppingListSnapshotItem(snapshotItemId: number): Promise<void> {
    await db.delete(shoppingListSnapshotItems).where(eq(shoppingListSnapshotItems.id, snapshotItemId));
  }

  async getShoppingListNotebookItems(): Promise<{ id: number; name: string }[]> {
    const rows = await db.select({
      id: shoppingListNotebookItems.id,
      name: shoppingListNotebookItems.name,
    }).from(shoppingListNotebookItems).orderBy(desc(shoppingListNotebookItems.id));
    return rows;
  }

  async addShoppingListNotebookItem(name: string): Promise<{ id: number; name: string }> {
    const normalizedName = this.normalizeText(name);
    const existing = await db.select({
      id: shoppingListNotebookItems.id,
      name: shoppingListNotebookItems.name,
    }).from(shoppingListNotebookItems);

    const duplicate = existing.find((item) => item.name.toLowerCase() === normalizedName.toLowerCase());
    if (duplicate) return duplicate;

    const [created] = await db.insert(shoppingListNotebookItems).values({
      name: normalizedName,
    }).returning({
      id: shoppingListNotebookItems.id,
      name: shoppingListNotebookItems.name,
    });
    return created;
  }

  async deleteShoppingListNotebookItem(id: number): Promise<void> {
    await db.delete(shoppingListNotebookItems).where(eq(shoppingListNotebookItems.id, id));
  }
}

export const storage = new DatabaseStorage();
