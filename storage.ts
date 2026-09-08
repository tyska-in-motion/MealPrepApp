
import { db } from "./db";
import {
  ingredients,
  recipes,
  recipeIngredients,
  mealEntries,
  userSettings,
  type Ingredient,
  type Recipe,
  type MealEntry,
  type CreateIngredientRequest,
  type CreateRecipeRequest,
  type CreateMealEntryRequest,
  type RecipeWithIngredients,
  type MealEntryWithRecipe,
  type DaySummary,
  type UserSettings,
} from "@shared/schema";
import { eq, sql, and, gte, lte, inArray } from "drizzle-orm";

export interface IStorage {
  // Ingredients
  getIngredients(search?: string): Promise<Ingredient[]>;
  getIngredient(id: number): Promise<Ingredient | undefined>;
  createIngredient(ingredient: CreateIngredientRequest): Promise<Ingredient>;
  deleteIngredient(id: number): Promise<void>;

  // Recipes
  getRecipes(search?: string, ingredientId?: number): Promise<RecipeWithIngredients[]>;
  getRecipe(id: number): Promise<RecipeWithIngredients | undefined>;
  createRecipe(recipe: CreateRecipeRequest & { ingredients: { ingredientId: number; amount: number }[] }): Promise<RecipeWithIngredients>;
  updateRecipe(id: number, recipe: CreateRecipeRequest & { ingredients: { ingredientId: number; amount: number }[] }): Promise<RecipeWithIngredients>;
  deleteRecipe(id: number): Promise<void>;

  // Meal Plan
  getDayEntries(date: string): Promise<MealEntryWithRecipe[]>;
  createMealEntry(entry: CreateMealEntryRequest): Promise<MealEntry>;
  updateMealEntry(id: number, updates: Partial<MealEntry> & { servings?: number }): Promise<MealEntry>;
  deleteMealEntry(id: number): Promise<void>;
  getMealEntriesRange(startDate: string, endDate: string): Promise<MealEntryWithRecipe[]>;

  // User Settings
  getUserSettings(): Promise<UserSettings>;
  updateUserSettings(settings: Partial<UserSettings>): Promise<UserSettings>;
}

export class DatabaseStorage implements IStorage {
  async getUserSettings(): Promise<UserSettings> {
    const [settings] = await db.select().from(userSettings);
    if (!settings) {
      const [newSettings] = await db.insert(userSettings).values({}).returning();
      return newSettings;
    }
    return settings;
  }

  async updateUserSettings(updates: Partial<UserSettings>): Promise<UserSettings> {
    const current = await this.getUserSettings();
    const [updated] = await db.update(userSettings)
      .set(updates)
      .where(eq(userSettings.id, current.id))
      .returning();
    return updated;
  }

  async getIngredients(search?: string): Promise<Ingredient[]> {
    if (search) {
      return await db.select().from(ingredients).where(sql`LOWER(${ingredients.name}) LIKE ${`%${search.toLowerCase()}%`}`);
    }
    return await db.select().from(ingredients);
  }

  async getIngredient(id: number): Promise<Ingredient | undefined> {
    const [ingredient] = await db.select().from(ingredients).where(eq(ingredients.id, id));
    return ingredient;
  }

  async createIngredient(ingredient: CreateIngredientRequest): Promise<Ingredient> {
    const [newIngredient] = await db.insert(ingredients).values(ingredient).returning();
    return newIngredient;
  }

  async updateIngredient(id: number, updates: Partial<Ingredient>): Promise<Ingredient> {
    const [updated] = await db.update(ingredients)
      .set(updates)
      .where(eq(ingredients.id, id))
      .returning();
    if (!updated) throw new Error("Ingredient not found");
    return updated;
  }

  async deleteIngredient(id: number): Promise<void> {
    await db.delete(ingredients).where(eq(ingredients.id, id));
  }

  async getRecipes(search?: string, ingredientId?: number): Promise<RecipeWithIngredients[]> {
    let query = db.query.recipes.findMany({
      with: {
        ingredients: {
          with: {
            ingredient: true
          }
        }
      }
    });

    // Note: Complex filtering with search and relations is simpler to do in memory for MVP or use raw SQL/advanced query builders.
    // For now, let's fetch all and filter if needed, or stick to basic search.
    // Efficient approach: fetch IDs first then full objects.
    
    const allRecipes = await query;
    let filtered = allRecipes;

    if (search) {
      const lowerSearch = search.toLowerCase();
      filtered = filtered.filter(r => r.name.toLowerCase().includes(lowerSearch));
    }

    if (ingredientId) {
      filtered = filtered.filter(r => r.ingredients.some(ri => ri.ingredientId === ingredientId));
    }

    return filtered as RecipeWithIngredients[];
  }

  async getRecipe(id: number): Promise<RecipeWithIngredients | undefined> {
    const recipe = await db.query.recipes.findFirst({
      where: eq(recipes.id, id),
      with: {
        ingredients: {
          with: {
            ingredient: true
          }
        }
      }
    });
    return recipe as RecipeWithIngredients | undefined;
  }

  async createRecipe(req: CreateRecipeRequest & { ingredients: { ingredientId: number; amount: number }[] }): Promise<RecipeWithIngredients> {
    const [recipe] = await db.insert(recipes).values({
      name: req.name,
      description: req.description,
      instructions: req.instructions,
      prepTime: req.prepTime,
      imageUrl: req.imageUrl,
      servings: req.servings || 1,
    }).returning();

    if (req.ingredients.length > 0) {
      await db.insert(recipeIngredients).values(
        req.ingredients.map(i => ({
          recipeId: recipe.id,
          ingredientId: i.ingredientId,
          amount: i.amount
        }))
      );
    }

    return this.getRecipe(recipe.id) as Promise<RecipeWithIngredients>;
  }

  async updateRecipe(id: number, req: CreateRecipeRequest & { ingredients: { ingredientId: number; amount: number }[] }): Promise<RecipeWithIngredients> {
    await db.update(recipes)
      .set({
        name: req.name,
        description: req.description,
        instructions: req.instructions,
        prepTime: req.prepTime,
        imageUrl: req.imageUrl,
        servings: req.servings || 1,
      })
      .where(eq(recipes.id, id));

    await db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id));

    if (req.ingredients.length > 0) {
      await db.insert(recipeIngredients).values(
        req.ingredients.map(i => ({
          recipeId: id,
          ingredientId: i.ingredientId,
          amount: i.amount
        }))
      );
    }

    return this.getRecipe(id) as Promise<RecipeWithIngredients>;
  }

  async deleteRecipe(id: number): Promise<void> {
    await db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id));
    await db.delete(mealEntries).where(eq(mealEntries.recipeId, id));
    await db.delete(recipes).where(eq(recipes.id, id));
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
            }
          }
        }
      }
    });
    return entries as MealEntryWithRecipe[];
  }

  async createMealEntry(entry: CreateMealEntryRequest): Promise<MealEntry> {
    const [newEntry] = await db.insert(mealEntries).values(entry).returning();
    return newEntry;
  }

  async updateMealEntry(id: number, updates: Partial<MealEntry> & { servings?: number }): Promise<MealEntry> {
    const [updated] = await db.update(mealEntries)
      .set(updates)
      .where(eq(mealEntries.id, id))
      .returning();
    return updated;
  }

  async deleteMealEntry(id: number): Promise<void> {
    await db.delete(mealEntries).where(eq(mealEntries.id, id));
  }

  async getMealEntriesRange(startDate: string, endDate: string): Promise<MealEntryWithRecipe[]> {
    const entries = await db.query.mealEntries.findMany({
      where: and(gte(mealEntries.date, startDate), lte(mealEntries.date, endDate)),
      with: {
        recipe: {
          with: {
            ingredients: {
              with: {
                ingredient: true
              }
            }
          }
        }
      }
    });
    return entries as MealEntryWithRecipe[];
  }
}

export const storage = new DatabaseStorage();
