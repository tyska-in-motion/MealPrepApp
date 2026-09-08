import express, { type Express, Request } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { insertRecipeSchema, insertMealEntrySchema, insertIngredientSchema } from "@shared/schema";
import { calculateNutritionAmount, calculatePurchaseAmount, calculateScaledAmount } from "@shared/scaling";
import multer from "multer";
import path from "path";
import fs from "fs";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";


const stepThresholdSchema = z.object({
  minServings: z.number().min(0),
  maxServings: z.number().min(0).nullable().optional(),
  amount: z.number().min(0),
});

const recipeIngredientInputSchema = z.object({
  ingredientId: z.number(),
  groupName: z.string().max(100).optional().nullable(),
  amount: z.number().min(0),
  baseAmount: z.number().min(0).optional(),
  unit: z.string().min(1).optional(),
  alternativeAmount: z.number().min(0).optional(),
  alternativeUnit: z.string().min(1).optional(),
  scalingType: z.enum(["LINEAR", "FIXED", "STEP", "FORMULA"]).default("LINEAR"),
  scalingFormula: z.string().optional(),
  stepThresholds: z.array(stepThresholdSchema).optional(),
  mealPrep: z.boolean().optional().default(false),
  mealPrepMaxDaysBefore: z.number().int().min(1).max(30).optional().default(1),
  mealPrepNotes: z.string().optional().nullable(),
});

const instructionSegmentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("ingredient"),
    text: z.string(),
    ingredientId: z.number(),
    ingredientIds: z.array(z.number()).optional(),
    ingredientSource: z.enum(["ingredient", "frequentAddon"]).optional(),
    multiplier: z.number().positive().optional(),
  }),
]);

const instructionStepSchema = z.object({
  segments: z.array(instructionSegmentSchema),
});

const suggestedRecipeInputSchema = z.object({
  recipeId: z.number(),
  servings: z.number().min(0.1),
});

const recipePrepTaskInputSchema = z.object({
  title: z.string().min(1),
  ingredientId: z.number().nullable().optional(),
  ingredientSource: z.enum(["ingredient", "frequentAddon", "custom"]).optional().default("ingredient"),
  maxDaysBefore: z.number().int().min(1).max(30),
  groupKey: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const normalizeForSearch = (value?: string | null): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();


function resolveIngredientForScaling(entry: any, ingredientRow: any, occurrenceTracker?: Map<number, number>) {
  const ingredientId = Number(ingredientRow?.ingredientId);
  const recipeIngredients = (entry?.recipe?.ingredients || []).filter(
    (ri: any) => Number(ri.ingredientId) === ingredientId,
  );
  const recipeFrequentAddons = (entry?.recipe?.frequentAddons || []).filter(
    (addon: any) => Number(addon.ingredientId) === ingredientId,
  );

  const candidates = [...recipeIngredients, ...recipeFrequentAddons];
  const currentOccurrence = occurrenceTracker
    ? (occurrenceTracker.get(ingredientId) || 0) + 1
    : 1;
  if (occurrenceTracker) occurrenceTracker.set(ingredientId, currentOccurrence);
  const source = candidates[currentOccurrence - 1] || candidates[0] || {};

  return {
    ...source,
    ...ingredientRow,
    baseAmount: Number(
      ingredientRow?.baseAmount
      ?? ingredientRow?.amount
      ?? source?.baseAmount
      ?? source?.amount
      ?? 0,
    ),
    scalingType: ingredientRow?.scalingType ?? source?.scalingType ?? "LINEAR",
    scalingFormula: ingredientRow?.scalingFormula ?? source?.scalingFormula,
    stepThresholds: ingredientRow?.stepThresholds ?? source?.stepThresholds,
  };
}



// Extend Request type for multer
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

// Configure multer for file uploads
const storage_multer = multer.diskStorage({
  destination: function (_req: any, _file: any, cb: any) {
    const dir = 'uploads/';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
    cb(null, dir);
  },
  filename: function (_req: any, file: any, cb: any) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage_multer });

function getEntryIngredientsForSummary(entry: any) {
  return entry.ingredients && entry.ingredients.length > 0
    ? entry.ingredients
    : (entry.recipe?.ingredients || []);
}

function calculateEntryTotals(entry: any) {
  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  let price = 0;
  const ingredientsToUse = getEntryIngredientsForSummary(entry);
  const entryServings = Number(entry.servings) || 1;
  const recipeServings = Number(entry.recipe?.servings || 1);

  if (ingredientsToUse.length > 0) {
    const occurrenceTracker = new Map<number, number>();
    ingredientsToUse.forEach((ri: any) => {
      if (!ri.ingredient) return;
      const scaledAmount = calculateScaledAmount(resolveIngredientForScaling(entry, ri, occurrenceTracker), entryServings, recipeServings);
      const nutritionAmount = calculateNutritionAmount(scaledAmount, ri.ingredient);
      const purchaseAmount = calculatePurchaseAmount(scaledAmount, ri.ingredient);
      const multiplier = nutritionAmount / 100;
      calories += (ri.ingredient.calories * multiplier);
      protein += (ri.ingredient.protein * multiplier);
      carbs += (ri.ingredient.carbs * multiplier);
      fat += (ri.ingredient.fat * multiplier);
      price += (ri.ingredient.price || 0) * (purchaseAmount / 100);
    });
  } else if (entry.customCalories !== null) {
    calories += (entry.customCalories || 0) * entryServings;
    protein += (entry.customProtein || 0) * entryServings;
    carbs += (entry.customCarbs || 0) * entryServings;
    fat += (entry.customFat || 0) * entryServings;
  }

  return {
    calories: Math.round(calories),
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
    price: Math.round(price * 100) / 100,
  };
}

function summarizeDayEntries(date: string, entries: any[]) {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0, price: 0 };
  const summaryEntries = entries.map((entry) => {
    const entryTotals = calculateEntryTotals(entry);
    totals.calories += entryTotals.calories;
    totals.protein += entryTotals.protein;
    totals.carbs += entryTotals.carbs;
    totals.fat += entryTotals.fat;
    totals.price += entryTotals.price;

    return {
      id: entry.id,
      date: entry.date,
      mealType: entry.mealType,
      person: entry.person,
      servings: entry.servings,
      isEaten: entry.isEaten,
      recipeId: entry.recipeId,
      customName: entry.customName,
      customCalories: entry.customCalories,
      customProtein: entry.customProtein,
      customCarbs: entry.customCarbs,
      customFat: entry.customFat,
      cookedBatchId: entry.cookedBatchId,
      cookedBatch: entry.cookedBatch,
      ingredients: entry.ingredients || [],
      totals: entryTotals,
      recipe: entry.recipe ? {
        id: entry.recipe.id,
        name: entry.recipe.name,
        imageUrl: entry.recipe.imageUrl,
        servings: entry.recipe.servings,
        defaultServingsA: entry.recipe.defaultServingsA,
        defaultServingsB: entry.recipe.defaultServingsB,
        tags: entry.recipe.tags,
      } : null,
    };
  });

  return {
    date,
    totalCalories: totals.calories,
    totalProtein: totals.protein,
    totalCarbs: totals.carbs,
    totalFat: totals.fat,
    totalPrice: Math.round(totals.price * 100) / 100,
    entries: summaryEntries,
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // File Upload Route
  app.post("/api/upload", upload.single("image"), (req: MulterRequest, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ imageUrl });
  });

  app.use("/uploads", (_req, res, next) => {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    next();
  });
  // Serve uploads directory statically
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  // Ingredients
  app.get(api.ingredients.list.path, async (req, res) => {
    const search = req.query.search as string | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const page = req.query.page ? Number(req.query.page) : 1;
    const offset = Math.max(page - 1, 0) * limit;
    const [items, total] = await Promise.all([
      storage.getIngredients(search, limit, offset),
      storage.countIngredients(search),
    ]);
    res.setHeader("X-Total-Count", String(total));
    res.setHeader("X-Page", String(page));
    res.setHeader("X-Limit", String(limit));
    res.json(items);
  });

  app.post(api.ingredients.create.path, async (req, res) => {
    try {
      const input = insertIngredientSchema.parse(req.body);
      const item = await storage.createIngredient(input);
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.message });
      }
      throw err;
    }
  });

  app.patch(api.ingredients.update.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = insertIngredientSchema.partial().parse(req.body);
      const item = await storage.updateIngredient(id, input);
      res.json(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.message });
      }
      throw err;
    }
  });

  app.delete(api.ingredients.delete.path, async (req, res) => {
    try {
      await storage.deleteIngredient(Number(req.params.id));
      res.status(204).end();
    } catch (err) {
      console.error("Error deleting ingredient:", err);
      res.status(500).json({ message: "Błąd serwera przy usuwaniu składnika" });
    }
  });



  // Recipes
  app.get(api.recipes.searchIndex.path, async (_req, res) => {
    const [items, frequencyMap] = await Promise.all([
      storage.getRecipeSearchIndex(),
      storage.getRecipeEatCounts(),
    ]);

    const itemsWithStats = items.map((r: any) => {
      const stats = {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        eatCount: frequencyMap.get(r.id) || 0
      };

      (r.ingredients || []).forEach((ri: any) => {
        if (!ri.ingredient) return;
        const scaledAmount = calculateScaledAmount(ri as any, Number(r.servings) || 1, Number(r.servings) || 1);
        const nutritionAmount = calculateNutritionAmount(scaledAmount, ri.ingredient);
        const multiplier = nutritionAmount / 100;
        stats.calories += ri.ingredient.calories * multiplier;
        stats.protein += ri.ingredient.protein * multiplier;
        stats.carbs += ri.ingredient.carbs * multiplier;
        stats.fat += ri.ingredient.fat * multiplier;
      });

      return {
        ...r,
        ingredientNames: (r.ingredients || []).map((ri: any) => ri.ingredient?.name).filter(Boolean),
        frequentAddonIngredientNames: (r.frequentAddons || []).map((addon: any) => addon.ingredient?.name).filter(Boolean),
        ingredients: (r.ingredients || []).map((ri: any) => ({
          id: ri.id,
          recipeId: ri.recipeId,
          ingredientId: ri.ingredientId,
          amount: ri.amount,
          baseAmount: ri.baseAmount,
          unit: ri.unit || ri.ingredient?.unit,
          ingredient: ri.ingredient ? {
            id: ri.ingredient.id,
            name: ri.ingredient.name,
            unit: ri.ingredient.unit,
            unitWeight: ri.ingredient.unitWeight,
            price: ri.ingredient.price,
            calories: ri.ingredient.calories,
            protein: ri.ingredient.protein,
            carbs: ri.ingredient.carbs,
            fat: ri.ingredient.fat,
          } : null,
          calculatedAmount: calculateScaledAmount(ri as any, Number(r.servings) || 1, Number(r.servings) || 1),
        })),
        stats: {
          calories: Math.round(stats.calories),
          protein: Math.round(stats.protein),
          carbs: Math.round(stats.carbs),
          fat: Math.round(stats.fat),
          eatCount: stats.eatCount
        }
      };
    });

    res.json(itemsWithStats);
  });

  app.get(api.recipes.list.path, async (req, res) => {
    const search = req.query.search as string | undefined;
    const ingredientId = req.query.ingredientId ? Number(req.query.ingredientId) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const page = req.query.page ? Number(req.query.page) : 1;
    const offset = Math.max(page - 1, 0) * limit;
    const [items, total, frequencyMap] = await Promise.all([
      storage.getRecipes(search, ingredientId, limit, offset),
      storage.countRecipes(search, ingredientId),
      storage.getRecipeEatCounts(),
    ]);

    const itemsWithStats = items.map(r => {
      const stats = {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        eatCount: frequencyMap.get(r.id) || 0
      };

      r.ingredients.forEach((ri: any) => {
        if (!ri.ingredient) return;
        const scaledAmount = calculateScaledAmount(ri as any, Number(r.servings) || 1, Number(r.servings) || 1);
        const nutritionAmount = calculateNutritionAmount(scaledAmount, ri.ingredient);
        const multiplier = nutritionAmount / 100;
        stats.calories += ri.ingredient.calories * multiplier;
        stats.protein += ri.ingredient.protein * multiplier;
        stats.carbs += ri.ingredient.carbs * multiplier;
        stats.fat += ri.ingredient.fat * multiplier;
      });

      return {
        ...r,
        ingredients: r.ingredients.map((ri: any) => ({
          ...ri,
          calculatedAmount: calculateScaledAmount(ri as any, Number(r.servings) || 1, Number(r.servings) || 1),
        })),
        stats: {
          calories: Math.round(stats.calories),
          protein: Math.round(stats.protein),
          carbs: Math.round(stats.carbs),
          fat: Math.round(stats.fat),
          eatCount: stats.eatCount
        }
      };
    });
    
    res.setHeader("X-Total-Count", String(total));
    res.setHeader("X-Page", String(page));
    res.setHeader("X-Limit", String(limit));
    res.json(itemsWithStats);
  });

  app.get(api.recipes.get.path, async (req, res) => {
    const item = await storage.getRecipe(Number(req.params.id));
    if (!item) return res.status(404).json({ message: "Not found" });
    const baseServings = Number(item.servings) || 1;
    const recipeWithCalculated = {
      ...item,
      ingredients: item.ingredients.map((ri) => ({
        ...ri,
        calculatedAmount: calculateScaledAmount(ri as any, baseServings, baseServings),
      })),
    };
    res.json(recipeWithCalculated);
  });

  app.post(api.recipes.create.path, async (req, res) => {
    try {
      // Manual schema composition for validation
      const input = z.object({
        name: z.string().min(1),
        tags: z.array(z.string()).optional().default([]),
        description: z.string().optional(),
        instructions: z.string().optional(),
        comments: z.string().optional(),
        instructionSteps: z.array(instructionStepSchema).optional(),
        prepTime: z.number().optional(),
        imageUrl: z.string().optional(),
        isFavorite: z.boolean().optional().default(false),
        servings: z.number().min(0.1).default(1),
        defaultServingsA: z.number().min(0.1).default(1),
        defaultServingsB: z.number().min(0.1).default(1.5),
        suggestedRecipeIds: z.array(z.number()).optional().default([]),
        suggestedRecipes: z.array(suggestedRecipeInputSchema).optional().default([]),
        ingredients: z.array(recipeIngredientInputSchema),
        frequentAddons: z.array(z.object({
          ingredientId: z.number(),
          amount: z.number(),
          baseAmount: z.number().min(0).optional(),
          defaultAmountA: z.number().min(0).optional(),
          defaultAmountB: z.number().min(0).optional(),
          unit: z.string().min(1).optional(),
          alternativeAmount: z.number().min(0).optional(),
          alternativeUnit: z.string().min(1).optional(),
          scalingType: z.enum(["LINEAR", "FIXED", "STEP", "FORMULA"]).default("LINEAR"),
          scalingFormula: z.string().optional(),
          stepThresholds: z.array(stepThresholdSchema).optional(),
        })).optional().default([]),
        prepTasks: z.array(recipePrepTaskInputSchema).optional().default([]),
      }).parse(req.body);
      
      const item = await storage.createRecipe(input);
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.message });
      }
      throw err;
    }
  });

  app.patch(api.recipes.update.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = z.object({
        name: z.string().min(1),
        tags: z.array(z.string()).optional().default([]),
        description: z.string().optional(),
        instructions: z.string().optional(),
        comments: z.string().optional(),
        instructionSteps: z.array(instructionStepSchema).optional(),
        prepTime: z.number().optional(),
        imageUrl: z.string().optional(),
        isFavorite: z.boolean().optional(),
        servings: z.number().min(0.1).optional(),
        defaultServingsA: z.number().min(0.1).optional(),
        defaultServingsB: z.number().min(0.1).optional(),
        suggestedRecipeIds: z.array(z.number()).optional().default([]),
        suggestedRecipes: z.array(suggestedRecipeInputSchema).optional().default([]),
        ingredients: z.array(recipeIngredientInputSchema),
        frequentAddons: z.array(z.object({
          ingredientId: z.number(),
          amount: z.number(),
          baseAmount: z.number().min(0).optional(),
          defaultAmountA: z.number().min(0).optional(),
          defaultAmountB: z.number().min(0).optional(),
          unit: z.string().min(1).optional(),
          alternativeAmount: z.number().min(0).optional(),
          alternativeUnit: z.string().min(1).optional(),
          scalingType: z.enum(["LINEAR", "FIXED", "STEP", "FORMULA"]).default("LINEAR"),
          scalingFormula: z.string().optional(),
          stepThresholds: z.array(stepThresholdSchema).optional(),
        })).optional().default([]),
        prepTasks: z.array(recipePrepTaskInputSchema).optional().default([]),
        resetEditedMealIngredients: z.boolean().optional().default(false),
      }).parse(req.body);
      
      const item = await storage.updateRecipe(id, input);
      res.json(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.message });
      }
      if ((err as any)?.code === "EDITED_MEAL_INGREDIENTS_BLOCK_RECIPE_UPDATE") {
        return res.status(409).json({
          message: "Nie można edytować wspólnego przepisu, bo składniki któregoś zaplanowanego posiłku zostały już zmienione.",
          code: (err as any).code,
          editedMealEntries: (err as any).editedMealEntries || [],
        });
      }
      throw err;
    }
  });

  app.delete(api.recipes.delete.path, async (req, res) => {
    await storage.deleteRecipe(Number(req.params.id));
    res.status(204).end();
  });


  // Meal Prep
  app.get(api.mealPrep.opportunities.path, async (req, res) => {
    const input = api.mealPrep.opportunities.input.parse(req.query || {});
    const baseDate = input?.date || format(new Date(), "yyyy-MM-dd");
    const lookAheadDays = Number(input?.lookAheadDays || 7);
    const startDate = baseDate;
    const endDate = format(addDays(parseISO(`${baseDate}T00:00:00`), lookAheadDays - 1), "yyyy-MM-dd");
    const entries = await storage.getMealEntriesRange(startDate, endDate);
    const groups = new Map<string, any>();

    const normalizePrepUnit = (unit?: string | null) => {
      const value = String(unit || "g").trim();
      return value || "g";
    };

    const addPrepAmount = (totals: Map<string, number>, amount: number, unit?: string | null) => {
      if (!Number.isFinite(amount) || amount <= 0) return;
      const normalizedUnit = normalizePrepUnit(unit);
      totals.set(normalizedUnit, (totals.get(normalizedUnit) || 0) + amount);
    };

    const serializePrepAmounts = (totals: Map<string, number>) => (
      Array.from(totals.entries())
        .map(([unit, amount]) => ({ unit, amount }))
        .filter((item) => Number.isFinite(item.amount) && item.amount > 0)
        .sort((a, b) => a.unit.localeCompare(b.unit, "pl"))
    );

    const addPerRecipeAmount = (recipesMap: Map<number, any>, meal: any, amount: number, unit?: string | null) => {
      if (!Number.isFinite(amount) || amount <= 0 || !meal.recipeId) return;
      const recipeId = Number(meal.recipeId);
      const existing = recipesMap.get(recipeId) || {
        recipeId,
        recipeName: meal.recipeName,
        totalAmount: 0,
        unit: normalizePrepUnit(unit),
        totalAmountsByUnit: new Map<string, number>(),
        mealsCount: 0,
      };
      existing.totalAmount += amount;
      existing.mealsCount += 1;
      addPrepAmount(existing.totalAmountsByUnit, amount, unit);
      recipesMap.set(recipeId, existing);
    };

    const findPrepIngredientRow = (entry: any, task: any) => {
      const ingredientId = Number(task?.ingredientId);
      if (task?.ingredientRow) {
        if (entry?.ingredients?.length) {
          const entryRow = entry.ingredients.find((row: any) => Number(row?.ingredientId) === ingredientId);
          if (entryRow) return { ...task.ingredientRow, ...entryRow, ingredient: entryRow.ingredient || task.ingredientRow?.ingredient };
        }
        return task.ingredientRow;
      }
      if (!Number.isFinite(ingredientId) || ingredientId <= 0) return null;

      const source = task?.ingredientSource === "frequentAddon" ? "frequentAddon" : "ingredient";
      const recipeRows = source === "frequentAddon"
        ? (entry?.recipe?.frequentAddons || [])
        : (entry?.recipe?.ingredients || []);
      const fallbackRows = [
        ...(entry?.recipe?.ingredients || []),
        ...(entry?.recipe?.frequentAddons || []),
      ];
      const recipeRow = recipeRows.find((row: any) => Number(row?.ingredientId) === ingredientId)
        || fallbackRows.find((row: any) => Number(row?.ingredientId) === ingredientId);

      if (entry?.ingredients?.length) {
        const entryRow = entry.ingredients.find((row: any) => Number(row?.ingredientId) === ingredientId);
        if (entryRow) return { ...recipeRow, ...entryRow, ingredient: entryRow.ingredient || recipeRow?.ingredient };
      }

      return recipeRow || null;
    };

    const countedSharedPrepKeys = new Set<string>();

    for (const entry of entries.filter((item) => item.isEaten !== true && item.recipe)) {
      const entryAny = entry as any;
      const mealDate = String(entry.date || "").slice(0, 10);
      const daysUntilMeal = differenceInCalendarDays(parseISO(`${mealDate}T00:00:00`), parseISO(`${baseDate}T00:00:00`));
      if (daysUntilMeal < 0) continue;

      const cookedBatchId = Number(entryAny?.cookedBatchId || entryAny?.cookedBatch?.id || 0);
      const isSharedBatchMeal = Number.isFinite(cookedBatchId) && cookedBatchId > 0;
      const recipeServings = Number(entryAny?.recipe?.servings) > 0 ? Number(entryAny.recipe.servings) : 1;
      const sharedBatchServings = Number(entryAny?.cookedBatch?.totalServings) > 0
        ? Number(entryAny.cookedBatch.totalServings)
        : recipeServings;
      const prepServings = isSharedBatchMeal
        ? sharedBatchServings
        : (Number(entryAny?.servings) > 0 ? Number(entryAny.servings) : 1);

      const ingredientPrepTasks = (entry.recipe?.ingredients || [])
        .filter((row: any) => row?.mealPrep)
        .map((row: any) => ({
          title: `Przygotuj ${row?.ingredient?.name || "składnik"}`,
          ingredientId: row.ingredientId,
          ingredientSource: "ingredient",
          maxDaysBefore: Number(row.mealPrepMaxDaysBefore) || 1,
          groupKey: `ingredient:${row.ingredientId}`,
          notes: row.mealPrepNotes || null,
          ingredientRow: row,
        }));

      for (const task of [...ingredientPrepTasks, ...(entry.recipe?.prepTasks || [])]) {
        const maxDaysBefore = Math.max(1, Number(task?.maxDaysBefore) || 1);
        if (daysUntilMeal > maxDaysBefore) continue;

        const groupKey = String(task?.groupKey || `${task?.title || "prep"}:${task?.ingredientSource || "custom"}:${task?.ingredientId || "custom"}`).toLowerCase();
        if (isSharedBatchMeal) {
          const sharedPrepKey = `${groupKey}:batch:${cookedBatchId}`;
          if (countedSharedPrepKeys.has(sharedPrepKey)) continue;
          countedSharedPrepKeys.add(sharedPrepKey);
        }

        const ingredientRow = findPrepIngredientRow(entry, task);
        let amount = 0;
        if (ingredientRow) {
          try {
            amount = calculateScaledAmount(
              ingredientRow,
              prepServings,
              recipeServings,
            );
          } catch (error) {
            console.warn("Skipping invalid meal-prep ingredient scaling", {
              ingredientId: ingredientRow?.ingredientId,
              entryId: entry?.id,
              error,
            });
            amount = Number(ingredientRow?.amount) > 0 ? Number(ingredientRow.amount) : 0;
          }
        }
        const normalizedAmount = Number.isFinite(amount) ? amount : 0;
        const ingredient = ingredientRow?.ingredient || (task as any)?.ingredient || null;
        const amountUnit = normalizePrepUnit(ingredientRow?.unit || ingredient?.unit);
        const existing = groups.get(groupKey);
        const meal = {
          entryId: entry.id,
          date: mealDate,
          recipeId: entry.recipeId,
          recipeName: entry.recipe?.name,
          mealType: entry.mealType,
          person: entry.person,
          servings: Number(entry.servings) || 1,
          prepServings,
          sharedBatchId: isSharedBatchMeal ? cookedBatchId : null,
          amount: normalizedAmount,
          unit: amountUnit,
          ingredientName: ingredient?.name || null,
        };

        if (existing) {
          existing.totalAmount += normalizedAmount;
          addPrepAmount(existing.totalAmountsByUnit, normalizedAmount, amountUnit);
          addPerRecipeAmount(existing.perRecipesById, meal, normalizedAmount, amountUnit);
          existing.forMeals.push(meal);
        } else {
          const totalAmountsByUnit = new Map<string, number>();
          addPrepAmount(totalAmountsByUnit, normalizedAmount, amountUnit);
          const perRecipesById = new Map<number, any>();
          addPerRecipeAmount(perRecipesById, meal, normalizedAmount, amountUnit);
          groups.set(groupKey, {
            groupKey,
            title: task.title,
            ingredientId: task.ingredientId,
            ingredientName: ingredient?.name || null,
            unit: amountUnit,
            maxDaysBefore,
            notes: task.notes || null,
            totalAmount: normalizedAmount,
            totalAmountsByUnit,
            perRecipesById,
            forMeals: [meal],
          });
        }
      }
    }

    const items = Array.from(groups.values())
      .map((item) => {
        const totalAmounts = serializePrepAmounts(item.totalAmountsByUnit || new Map<string, number>());
        const primaryTotal = totalAmounts.find((amount: any) => amount.unit === item.unit) || totalAmounts[0];
        const perRecipes = Array.from((item.perRecipesById || new Map<number, any>()).values())
          .map((recipe: any) => {
            const recipeTotals = serializePrepAmounts(recipe.totalAmountsByUnit || new Map<string, number>());
            const recipePrimaryTotal = recipeTotals.find((amount: any) => amount.unit === recipe.unit) || recipeTotals[0];
            return {
              recipeId: recipe.recipeId,
              recipeName: recipe.recipeName,
              totalAmount: Number(recipePrimaryTotal?.amount ?? recipe.totalAmount ?? 0),
              unit: recipePrimaryTotal?.unit || recipe.unit || "g",
              totalAmounts: recipeTotals,
              mealsCount: recipe.mealsCount,
            };
          })
          .sort((a: any, b: any) => String(a.recipeName || "").localeCompare(String(b.recipeName || ""), "pl"));

        return {
          ...item,
          totalAmount: Number(primaryTotal?.amount ?? item.totalAmount ?? 0),
          unit: primaryTotal?.unit || item.unit || "g",
          totalAmounts,
          perRecipes,
          totalAmountsByUnit: undefined,
          perRecipesById: undefined,
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title, "pl"));

    res.json({ date: baseDate, startDate, endDate, items });
  });

  // Meal Plan
  app.get(api.mealPlan.getDay.path, async (req, res) => {
    const date = req.params.date;
    const entries = await storage.getDayEntries(date);
    
    // Calculate summaries
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let totalPrice = 0;

    entries.forEach(entry => {
      // Use entry-specific ingredients if they exist, inaczej fallback do domyślnych przepisu
      const ingredientsToUse = entry.ingredients && entry.ingredients.length > 0 
        ? entry.ingredients 
        : (entry.recipe?.ingredients || []);

      const entryServings = Number(entry.servings) || 1;
      const recipeServings = Number(entry.recipe?.servings || 1);

      if (ingredientsToUse.length > 0) {
        const occurrenceTracker = new Map<number, number>();
        ingredientsToUse.forEach(ri => {
          if (!ri.ingredient) return;
          const scaledAmount = calculateScaledAmount(resolveIngredientForScaling(entry, ri, occurrenceTracker), entryServings, recipeServings);
          const nutritionAmount = calculateNutritionAmount(scaledAmount, ri.ingredient);
          const purchaseAmount = calculatePurchaseAmount(scaledAmount, ri.ingredient);
          const multiplier = nutritionAmount / 100;
          totalCalories += (ri.ingredient.calories * multiplier);
          totalProtein += (ri.ingredient.protein * multiplier);
          totalCarbs += (ri.ingredient.carbs * multiplier);
          totalFat += (ri.ingredient.fat * multiplier);
          totalPrice += (ri.ingredient.price || 0) * (purchaseAmount / 100);
        });
      } else if (entry.customCalories !== null) {
        totalCalories += (entry.customCalories || 0) * entryServings;
        totalProtein += (entry.customProtein || 0) * entryServings;
        totalCarbs += (entry.customCarbs || 0) * entryServings;
        totalFat += (entry.customFat || 0) * entryServings;
      }
    });

    const entriesWithCalculated = entries.map((entry) => {
      const entryServings = Number(entry.servings) || 1;
      const recipeServings = Number(entry.recipe?.servings || 1);
      return {
        ...entry,
        ingredients: (() => {
          const occurrenceTracker = new Map<number, number>();
          return (entry.ingredients || []).map((ri: any) => ({
            ...ri,
            calculatedAmount: calculateScaledAmount(resolveIngredientForScaling(entry, ri, occurrenceTracker), entryServings, recipeServings),
          }));
        })(),
        recipe: entry.recipe
          ? {
              ...entry.recipe,
              ingredients: (() => {
                const occurrenceTracker = new Map<number, number>();
                return (entry.recipe.ingredients || []).map((ri: any) => ({
                  ...ri,
                  calculatedAmount: calculateScaledAmount(resolveIngredientForScaling(entry, ri, occurrenceTracker), entryServings, recipeServings),
                }));
              })(),
            }
          : entry.recipe,
      };
    });

    res.json({
      date,
      totalCalories: Math.round(totalCalories),
      totalProtein: Math.round(totalProtein),
      totalCarbs: Math.round(totalCarbs),
      totalFat: Math.round(totalFat),
      totalPrice: Math.round(totalPrice * 100) / 100,
      entries: entriesWithCalculated
    });
  });

  app.get(api.mealPlan.getDaySummary.path, async (req, res) => {
    const date = req.params.date;
    const entries = await storage.getDayEntries(date);
    res.json(summarizeDayEntries(date, entries));
  });

  app.post(api.mealPlan.addEntry.path, async (req, res) => {
    try {
      const input = api.mealPlan.addEntry.input.parse(req.body);
      const entry = await storage.createMealEntry(input);
      res.status(201).json(entry);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post(api.mealPlan.copyDay.path, async (req, res) => {
    try {
      const { sourceDate, targetDate, replaceTarget } = api.mealPlan.copyDay.input.parse(req.body);

      if (!sourceDate || !targetDate) {
        return res.status(400).json({ message: "Wymagane daty źródłowa i docelowa" });
      }

      const copiedEntries = await storage.copyDayEntries(sourceDate, targetDate, replaceTarget);
      res.json({ copiedEntries });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.message });
      }

      if (err instanceof Error) {
        return res.status(400).json({ message: err.message });
      }

      res.status(500).json({ message: "Błąd serwera" });
    }
  });

  app.get(api.sharedMeals.list.path, async (req, res) => {
    const includeArchived = String(req.query.includeArchived || "false") === "true";
    const batches = includeArchived
      ? await storage.getArchivedSharedMealBatches()
      : await storage.getSharedMealBatches();
    res.json(batches);
  });

  app.post(api.sharedMeals.createBatch.path, async (req, res) => {
    try {
      const input = api.sharedMeals.createBatch.input.parse(req.body);
      const batch = await storage.createSharedMealBatch(input as any);
      res.status(201).json(batch);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.message });
      }
      throw err;
    }
  });

  app.patch(api.sharedMeals.archiveBatch.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { isArchived } = api.sharedMeals.archiveBatch.input.parse(req.body || {});
      const batch = await storage.archiveSharedMealBatch(id, isArchived);
      res.json(batch);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.message });
      }
      if (err instanceof Error && err.message.includes("not found")) {
        return res.status(404).json({ message: "Nie znaleziono partii" });
      }
      throw err;
    }
  });

  app.patch(api.sharedMeals.updateBatch.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const updates = api.sharedMeals.updateBatch.input.parse(req.body || {});
      const batch = await storage.updateSharedMealBatch(id, {
        ...updates,
        note: updates.note === null ? null : updates.note,
      });
      res.json(batch);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.message });
      }
      if (err instanceof Error && err.message.includes("not found")) {
        return res.status(404).json({ message: "Nie znaleziono partii" });
      }
      throw err;
    }
  });

  app.get(api.sharedMeals.logs.path, async (req, res) => {
    const id = Number(req.params.id);
    const logs = await storage.getSharedMealBatchLogs(id);
    res.json(logs);
  });

  app.delete(api.sharedMeals.deleteBatch.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteSharedMealBatch(id);
      res.status(204).send();
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) {
        return res.status(404).json({ message: "Nie znaleziono partii" });
      }
      throw err;
    }
  });

  app.patch("/api/meal-plan/entry/:id", async (req, res) => {

    try {
      const id = Number(req.params.id);
      const { ingredients: ingredientsList, ...updates } = req.body;
      
      // Ensure we only pass fields that exist in the schema to storage.updateMealEntry
      const finalUpdates: any = {};
      const allowedFields = ['servings', 'isEaten', 'person', 'customName', 'customCalories', 'customProtein', 'customCarbs', 'customFat', 'date', 'mealType', 'cookedBatchId'];
      
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          finalUpdates[field] = updates[field];
        }
      }

      const hasEntryUpdates = Object.keys(finalUpdates).length > 0;
      const hasIngredientUpdates = ingredientsList !== undefined;

      if (!hasEntryUpdates && !hasIngredientUpdates) {
        return res.status(400).json({ message: "Brak danych do aktualizacji" });
      }

      // Update meal entry fields only when there is anything to set.
      let entry = await storage.getMealEntryById(id);
      if (!entry) {
        return res.status(404).json({ message: "Nie znaleziono wpisu posiłku" });
      }

      if (hasEntryUpdates) {
        await storage.updateMealEntry(id, finalUpdates);
      }

      // Then update ingredients if provided
      if (hasIngredientUpdates) {
        await storage.updateMealEntryIngredients(id, ingredientsList);
      }

      // Force database to clear any relation caches by re-fetching everything
      entry = await storage.getMealEntryById(id);
      if (!entry) {
        return res.status(404).json({ message: "Nie znaleziono wpisu posiłku" });
      }

      console.log("Updated entry sent to client:", JSON.stringify(entry));
      res.json(entry);
    } catch (err) {
      console.error("Error updating meal entry:", err);
      res.status(500).json({ message: "Błąd serwera: " + (err instanceof Error ? err.message : String(err)) });
    }
  });

  app.get(api.mealPlan.getEntryFull.path, async (req, res) => {
    const entry = await storage.getMealEntryById(Number(req.params.id));
    if (!entry) return res.status(404).json({ message: "Nie znaleziono wpisu posiłku" });
    res.json(entry);
  });

  app.delete(api.mealPlan.deleteEntry.path, async (req, res) => {
    await storage.deleteMealEntry(Number(req.params.id));
    res.status(204).end();
  });

  app.get(api.appState.get.path, async (req, res) => {
    const key = String(req.params.key || "").trim();
    if (!key) return res.status(400).json({ message: "Brak klucza" });
    const data = await storage.getAppState(key);
    res.json({ key, data });
  });

  app.put(api.appState.set.path, async (req, res) => {
    const key = String(req.params.key || "").trim();
    const input = api.appState.set.input.safeParse(req.body);
    if (!key || !input.success) {
      return res.status(400).json({ message: "Niepoprawne dane" });
    }
    const data = await storage.setAppState(key, input.data.data);
    res.json({ key, data });
  });

  app.get(api.mealPlan.getStatsExclusions.path, async (req, res) => {
    const input = api.mealPlan.getStatsExclusions.input.safeParse(req.query);

    if (!input.success) {
      return res.status(400).json({ message: "Niepoprawny zakres dat" });
    }

    const exclusions = await storage.getStatsDayExclusions(input.data.startDate, input.data.endDate);
    res.json(exclusions);
  });

  app.post(api.mealPlan.setStatsExclusion.path, async (req, res) => {
    const input = api.mealPlan.setStatsExclusion.input.safeParse(req.body);

    if (!input.success) {
      return res.status(400).json({ message: "Niepoprawne dane wykluczenia" });
    }

    await storage.setStatsDayExclusion(input.data.date, input.data.reason);
    res.json({ success: true });
  });

  app.get(api.mealPlan.getShoppingList.path, async (req, res) => {
    const rangeParse = z.object({
      startDate: z.string().min(1),
      endDate: z.string().min(1),
    }).safeParse(req.query);

    if (!rangeParse.success) {
      return res.status(400).json({ message: "Brak wymaganego zakresu dat" });
    }

    const safeScaledAmount = (entry: any, ri: any, occurrenceTracker: Map<number, number>) => {
      try {
        const entryServings = Number(entry?.servings) > 0 ? Number(entry.servings) : 1;
        const recipeServings = Number(entry?.recipe?.servings) > 0 ? Number(entry?.recipe?.servings) : 1;
        const amount = calculateScaledAmount(
          resolveIngredientForScaling(entry, ri, occurrenceTracker),
          entryServings,
          recipeServings,
        );
        return Number.isFinite(amount) && amount >= 0 ? amount : 0;
      } catch (error) {
        console.warn("Skipping invalid shopping-list ingredient scaling", {
          ingredientId: ri?.ingredientId,
          entryId: entry?.id,
          error,
        });
        return Number(ri?.amount) > 0 ? Number(ri.amount) : 0;
      }
    };

    const { startDate, endDate } = rangeParse.data;
    const entries = await storage.getMealEntriesRange(startDate, endDate);
    const excludedItems = new Set(await storage.getShoppingListExcludedItems(startDate, endDate));

    const shoppingMap = new Map<number, {
      name: string;
      amount: number;
      unit: string;
      category: string;
      unitWeight: number | null;
      packageSize: number;
      useSoon: boolean;
      dailyAmounts: Map<string, number>;
    }>();

    for (const entry of entries.filter((item) => item.isEaten !== true)) {
      const entryIngredients = (entry.ingredients || []).filter((ri: any) => !!ri?.ingredient);
      const recipeIngredientsFromRange = [
        ...(entry.recipe?.ingredients || []),
        ...(entry.recipe?.frequentAddons || []),
      ].filter((ri: any) => !!ri?.ingredient);

      let ingredientsToUse = entryIngredients.length > 0 ? entryIngredients : recipeIngredientsFromRange;

      if (ingredientsToUse.length === 0 && entry.recipeId) {
        const recipeFallback = await storage.getRecipe(Number(entry.recipeId));
        ingredientsToUse = [
          ...(recipeFallback?.ingredients || []),
          ...(recipeFallback?.frequentAddons || []),
        ].filter((ri: any) => !!ri?.ingredient);
      }

      if (ingredientsToUse.length === 0) {
        console.warn("Meal entry skipped in shopping list due to missing ingredients", {
          entryId: entry.id,
          recipeId: entry.recipeId,
        });
      }

      const occurrenceTracker = new Map<number, number>();
      for (const ri of ingredientsToUse) {
        const ingredientId = Number(ri?.ingredientId);
        if (!Number.isFinite(ingredientId) || ingredientId <= 0) {
          continue;
        }

        const existing = shoppingMap.get(ingredientId);
        const amount = calculatePurchaseAmount(safeScaledAmount(entry, ri, occurrenceTracker), ri.ingredient);
        if (existing) {
          existing.amount += amount;
          if (entry?.date && Number.isFinite(amount) && amount > 0) {
            existing.dailyAmounts.set(entry.date, (existing.dailyAmounts.get(entry.date) || 0) + amount);
          }
        } else {
          shoppingMap.set(ingredientId, {
            name: (ri.ingredient as any).name,
            amount,
            unit: "g",
            category: (ri.ingredient as any).category || "Inne",
            unitWeight: (ri.ingredient as any).unitWeight,
            packageSize: Number((ri.ingredient as any).packageSize) || 0,
            useSoon: !!(ri.ingredient as any).useSoon,
            dailyAmounts: new Map(
              entry?.date && Number.isFinite(amount) && amount > 0
                ? [[entry.date, amount]]
                : [],
            ),
          });
        }
      }
    }

    const sharedBatches = await storage.getSharedMealBatches();
    for (const batch of sharedBatches) {
      const remainingServings = Number(batch?.remainingServings ?? batch?.totalServings ?? 0);
      if (!Number.isFinite(remainingServings) || remainingServings <= 0) {
        continue;
      }

      const recipeServings = Number(batch?.recipe?.servings) > 0 ? Number(batch.recipe.servings) : 1;
      const sharedIngredients = [
        ...(batch?.recipe?.ingredients || []),
        ...(batch?.recipe?.frequentAddons || []),
      ].filter((ri: any) => !!ri?.ingredient);

      for (const ri of sharedIngredients) {
        const ingredientId = Number(ri?.ingredientId);
        if (!Number.isFinite(ingredientId) || ingredientId <= 0) {
          continue;
        }

        let amount = 0;
        try {
          amount = calculateScaledAmount(ri, remainingServings, recipeServings);
        } catch (error) {
          console.warn("Skipping invalid shared-batch ingredient scaling", {
            ingredientId,
            batchId: batch?.id,
            error,
          });
          amount = Number(ri?.amount) > 0 ? Number(ri.amount) : 0;
        }

        const normalizedAmount = calculatePurchaseAmount(Number.isFinite(amount) && amount > 0 ? amount : 0, ri.ingredient);
        const existing = shoppingMap.get(ingredientId);
        if (existing) {
          existing.amount += normalizedAmount;
        } else {
          shoppingMap.set(ingredientId, {
            name: (ri.ingredient as any).name,
            amount: normalizedAmount,
            unit: "g",
            category: (ri.ingredient as any).category || "Inne",
            unitWeight: (ri.ingredient as any).unitWeight,
            packageSize: Number((ri.ingredient as any).packageSize) || 0,
            useSoon: !!(ri.ingredient as any).useSoon,
            dailyAmounts: new Map(),
          });
        }
      }
    }

    const list = Array.from(shoppingMap.entries()).map(([id, val]) => ({
      ingredientId: id,
      name: val.name,
      totalAmount: Number.isFinite(val.amount) && val.amount > 0 ? val.amount : 0,
      unit: val.unit,
      category: val.category,
      unitWeight: val.unitWeight,
      packageSize: val.packageSize,
      useSoon: val.useSoon,
      leftoverAmount: val.useSoon && val.packageSize > 0 ? Math.ceil(val.amount / val.packageSize) * val.packageSize - val.amount : 0,
      packagesToBuy: val.packageSize > 0 ? Math.ceil(val.amount / val.packageSize) : 0,
      dailyAmounts: Array.from(val.dailyAmounts.entries())
        .filter(([date, amount]) => typeof date === "string" && date.length > 0 && Number.isFinite(amount) && amount > 0)
        .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
        .map(([date, amount]) => ({
          date,
          amount,
        })),
      isChecked: false,
      isExcluded: excludedItems.has(id),
    }));

    const extras = await storage.getShoppingListExtras(startDate, endDate);
    const normalizedExtras = extras.map((extra) => ({
      ingredientId: -extra.id,
      extraId: extra.id,
      name: extra.name,
      totalAmount: Number(extra.amount || 1),
      unit: extra.unit || "szt",
      category: extra.category || "Dodatkowe",
      unitWeight: null,
      dailyAmounts: [],
      isChecked: !!extra.isChecked,
      isExtra: true,
    }));

    res.json([...list, ...normalizedExtras]);
  });

  app.get("/api/shopping-list/checks", async (req, res) => {
    const input = z.object({
      startDate: z.string().min(1),
      endDate: z.string().min(1),
    }).safeParse(req.query);

    if (!input.success) {
      return res.json({});
    }
    const checks = await storage.getShoppingListChecks(input.data.startDate, input.data.endDate);
    res.json(checks);
  });

  app.post("/api/shopping-list/checks", async (req, res) => {
    const input = z.object({
      ingredientId: z.number(),
      isChecked: z.boolean(),
      startDate: z.string().min(1),
      endDate: z.string().min(1),
    }).safeParse(req.body);

    if (!input.success) {
      return res.status(400).json({ message: "Niepoprawne dane" });
    }
    await storage.toggleShoppingListCheck(input.data.ingredientId, input.data.startDate, input.data.endDate, input.data.isChecked);
    res.json({ success: true });
  });

  app.post("/api/shopping-list/extras", async (req, res) => {
    const input = z.object({
      startDate: z.string().min(1),
      endDate: z.string().min(1),
      name: z.string().min(1),
      amount: z.number().positive().optional(),
      unit: z.string().min(1).optional(),
      category: z.string().min(1).optional(),
    }).safeParse(req.body);

    if (!input.success) {
      return res.status(400).json({ message: "Niepoprawne dane" });
    }
    const extra = await storage.addShoppingListExtra(input.data.startDate, input.data.endDate, {
      name: input.data.name,
      amount: input.data.amount,
      unit: input.data.unit,
      category: input.data.category,
    });
    res.status(201).json(extra);
  });

  app.patch("/api/shopping-list/extras/:id", async (req, res) => {
    const id = Number(req.params.id);
    const input = z.object({ isChecked: z.boolean() }).parse(req.body);
    await storage.toggleShoppingListExtraCheck(id, input.isChecked);
    res.json({ success: true });
  });

  app.delete("/api/shopping-list/extras/:id", async (req, res) => {
    await storage.deleteShoppingListExtra(Number(req.params.id));
    res.status(204).end();
  });

  app.get("/api/shopping-list/exclusions", async (req, res) => {
    const input = z.object({
      startDate: z.string().min(1),
      endDate: z.string().min(1),
    }).safeParse(req.query);

    if (!input.success) {
      return res.json([]);
    }

    const excluded = await storage.getShoppingListExcludedItems(input.data.startDate, input.data.endDate);
    res.json(excluded);
  });

  app.post("/api/shopping-list/exclusions", async (req, res) => {
    const input = z.object({
      ingredientId: z.number(),
      excluded: z.boolean(),
      startDate: z.string().min(1),
      endDate: z.string().min(1),
    }).safeParse(req.body);

    if (!input.success) {
      return res.status(400).json({ message: "Niepoprawne dane" });
    }
    await storage.setShoppingListExcludedItem(input.data.ingredientId, input.data.startDate, input.data.endDate, input.data.excluded);
    res.json({ success: true });
  });

  app.post("/api/shopping-lists/snapshots", async (req, res) => {
    const input = z.object({
      name: z.string().min(1),
      periodStart: z.string().min(1),
      periodEnd: z.string().min(1),
      items: z.array(z.object({
        ingredientId: z.number().nullable().optional(),
        name: z.string().min(1),
        totalAmount: z.number().nonnegative(),
        unit: z.string().min(1),
        category: z.string().nullable().optional(),
        status: z.enum(["BOUGHT", "AT_HOME", "NOT_BOUGHT"]),
        price: z.number().nonnegative().optional(),
        isExtra: z.boolean().optional(),
      })),
    }).safeParse(req.body);

    if (!input.success) {
      return res.status(400).json({ message: "Niepoprawne dane" });
    }

    const snapshot = await storage.createShoppingListSnapshot(input.data);
    res.status(201).json(snapshot);
  });

  app.get("/api/shopping-lists/snapshots", async (_req, res) => {
    const snapshots = await storage.getShoppingListSnapshots();
    res.json(snapshots);
  });

  app.get("/api/shopping-lists/active", async (_req, res) => {
    const snapshots = await storage.getActiveShoppingListSnapshots();
    res.json(snapshots);
  });

  app.get("/api/shopping-lists/snapshots/:id", async (req, res) => {
    const snapshotId = Number(req.params.id);
    if (!Number.isFinite(snapshotId) || snapshotId <= 0) {
      return res.status(400).json({ message: "Niepoprawny identyfikator listy" });
    }

    const snapshot = await storage.getShoppingListSnapshotById(snapshotId);
    if (!snapshot) {
      return res.status(404).json({ message: "Lista nie istnieje" });
    }

    res.json(snapshot);
  });


  app.delete("/api/shopping-lists/snapshots/:id", async (req, res) => {
    const snapshotId = Number(req.params.id);
    if (!Number.isFinite(snapshotId) || snapshotId <= 0) {
      return res.status(400).json({ message: "Niepoprawny identyfikator listy" });
    }

    await storage.deleteShoppingListSnapshot(snapshotId);
    res.status(204).end();
  });
  app.post("/api/shopping-lists/snapshots/:id/complete", async (req, res) => {
    const snapshotId = Number(req.params.id);
    if (!Number.isFinite(snapshotId) || snapshotId <= 0) {
      return res.status(400).json({ message: "Niepoprawny identyfikator listy" });
    }

    const snapshot = await storage.getShoppingListSnapshotById(snapshotId);
    if (!snapshot) {
      return res.status(404).json({ message: "Lista nie istnieje" });
    }

    const completed = await storage.completeShoppingListSnapshot(snapshotId);
    res.json(completed);
  });

  app.patch("/api/shopping-lists/snapshot-items/:id", async (req, res) => {
    const snapshotItemId = Number(req.params.id);
    if (!Number.isFinite(snapshotItemId) || snapshotItemId <= 0) {
      return res.status(400).json({ message: "Niepoprawny identyfikator pozycji" });
    }

    const input = z.object({
      status: z.enum(["BOUGHT", "AT_HOME", "NOT_BOUGHT"]).optional(),
      price: z.number().nonnegative().optional(),
      name: z.string().min(1).optional(),
      totalAmount: z.number().nonnegative().optional(),
      unit: z.string().min(1).optional(),
      category: z.string().min(1).optional(),
    }).safeParse(req.body);

    if (!input.success || Object.values(input.data).every((value) => value === undefined)) {
      return res.status(400).json({ message: "Niepoprawne dane" });
    }

    const updated = await storage.updateShoppingListSnapshotItem(snapshotItemId, input.data);
    if (!updated) {
      return res.status(404).json({ message: "Pozycja nie istnieje" });
    }

    res.json(updated);
  });

  app.post("/api/shopping-lists/snapshots/:id/items", async (req, res) => {
    const snapshotId = Number(req.params.id);
    if (!Number.isFinite(snapshotId) || snapshotId <= 0) {
      return res.status(400).json({ message: "Niepoprawny identyfikator listy" });
    }

    const input = z.object({
      name: z.string().min(1),
      totalAmount: z.number().nonnegative(),
      unit: z.string().min(1),
      category: z.string().min(1).optional(),
      status: z.enum(["BOUGHT", "AT_HOME", "NOT_BOUGHT"]).optional(),
      price: z.number().nonnegative().optional(),
    }).safeParse(req.body);

    if (!input.success) {
      return res.status(400).json({ message: "Niepoprawne dane" });
    }

    const snapshot = await storage.getShoppingListSnapshotById(snapshotId);
    if (!snapshot) {
      return res.status(404).json({ message: "Lista nie istnieje" });
    }

    const created = await storage.addShoppingListSnapshotItem(snapshotId, input.data);
    res.status(201).json(created);
  });

  app.delete("/api/shopping-lists/snapshot-items/:id", async (req, res) => {
    const snapshotItemId = Number(req.params.id);
    if (!Number.isFinite(snapshotItemId) || snapshotItemId <= 0) {
      return res.status(400).json({ message: "Niepoprawny identyfikator pozycji" });
    }

    await storage.deleteShoppingListSnapshotItem(snapshotItemId);
    res.status(204).end();
  });


  app.get(api.bodyMeasurements.list.path, async (req, res) => {
    const input = api.bodyMeasurements.list.input.safeParse(req.query);
    if (!input.success) return res.status(400).json({ message: "Niepoprawne filtry pomiarów" });
    const measurements = await storage.getBodyMeasurements(input.data || {});
    res.json(measurements);
  });

  app.post(api.bodyMeasurements.upsert.path, async (req, res) => {
    const input = api.bodyMeasurements.upsert.input.safeParse(req.body);
    if (!input.success) return res.status(400).json({ message: "Niepoprawne dane pomiaru", field: input.error.issues[0]?.path.join(".") });
    const measurement = await storage.upsertBodyMeasurement(input.data as any);
    res.json(measurement);
  });

  app.delete(api.bodyMeasurements.delete.path, async (req, res) => {
    await storage.deleteBodyMeasurement(Number(req.params.id));
    res.status(204).end();
  });

  app.get("/api/shopping-list-notebook", async (_req, res) => {
    const items = await storage.getShoppingListNotebookItems();
    res.json(items);
  });

  app.post("/api/shopping-list-notebook", async (req, res) => {
    const input = z.object({
      name: z.string().min(1),
    }).safeParse(req.body);

    if (!input.success) {
      return res.status(400).json({ message: "Niepoprawne dane" });
    }

    const created = await storage.addShoppingListNotebookItem(input.data.name);
    res.status(201).json(created);
  });

  app.delete("/api/shopping-list-notebook/:id", async (req, res) => {
    const notebookItemId = Number(req.params.id);
    if (!Number.isFinite(notebookItemId) || notebookItemId <= 0) {
      return res.status(400).json({ message: "Niepoprawny identyfikator pozycji" });
    }

    await storage.deleteShoppingListNotebookItem(notebookItemId);
    res.status(204).end();
  });

  // User Settings
  app.get("/api/user-settings", async (req, res) => {
    const settings = await storage.getUserSettings();
    res.json(settings);
  });

  app.get("/api/user-settings/history", async (req, res) => {
    const input = z.object({
      startDate: z.string(),
      endDate: z.string(),
    }).parse(req.query);

    const history = await storage.getUserSettingsHistory(input.startDate, input.endDate);
    res.json(history);
  });

  app.patch("/api/user-settings", async (req, res) => {
    try {
      const input = z.object({
        person: z.enum(["A", "B"]),
        targetCalories: z.number().optional(),
        targetProtein: z.number().optional(),
        targetCarbs: z.number().optional(),
        targetFat: z.number().optional(),
        targetProteinPercentage: z.number().optional(),
        targetCarbsPercentage: z.number().optional(),
        targetFatPercentage: z.number().optional(),
        targetProteinPercentageMin: z.number().optional(),
        targetProteinPercentageMax: z.number().optional(),
        targetCarbsPercentageMin: z.number().optional(),
        targetCarbsPercentageMax: z.number().optional(),
        targetFatPercentageMin: z.number().optional(),
        targetFatPercentageMax: z.number().optional(),
        sharedBatchesManualOnly: z.boolean().optional(),
      }).parse(req.body);

      const { person, ...updates } = input;
      const settings = await storage.updateUserSettings(person, updates);
      res.json(settings);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.message });
      }
      throw err;
    }
  });

  // Seeding
  const existingIngredients = await storage.getIngredients();
  if (existingIngredients.length === 0) {
    console.log("Seeding database...");
    
    // Ingredients
    const chicken = await storage.createIngredient({ name: "Pierś z kurczaka", calories: 165, protein: 31, carbs: 0, fat: 3.6, unit: "g", imageUrl: "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=500&auto=format&fit=crop&q=60" });
    const rice = await storage.createIngredient({ name: "Ryż basmati", calories: 350, protein: 7, carbs: 77, fat: 1, unit: "g", imageUrl: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500&auto=format&fit=crop&q=60" });
    const broccoli = await storage.createIngredient({ name: "Brokuły", calories: 34, protein: 2.8, carbs: 7, fat: 0.4, unit: "g", imageUrl: "https://images.unsplash.com/photo-1459411621453-7b03977f4bef?w=500&auto=format&fit=crop&q=60" });
    const oliveOil = await storage.createIngredient({ name: "Oliwa z oliwek", calories: 884, protein: 0, carbs: 0, fat: 100, unit: "ml", imageUrl: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=500&auto=format&fit=crop&q=60" });
    const oatmeal = await storage.createIngredient({ name: "Płatki owsiane", calories: 389, protein: 16.9, carbs: 66.3, fat: 6.9, unit: "g", imageUrl: "https://images.unsplash.com/photo-1517673132405-a56a62b18caf?w=500&auto=format&fit=crop&q=60" });
    const milk = await storage.createIngredient({ name: "Mleko 2%", calories: 50, protein: 3.4, carbs: 4.8, fat: 2, unit: "ml", imageUrl: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=500&auto=format&fit=crop&q=60" });
    const apple = await storage.createIngredient({ name: "Jabłko", calories: 52, protein: 0.3, carbs: 14, fat: 0.2, unit: "szt", imageUrl: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=500&auto=format&fit=crop&q=60" });

  

  // Recipes
    const chickenRecipe = await storage.createRecipe({
      name: "Kurczak z ryżem i warzywami",
      description: "Klasyczne danie kulturysty. Proste, szybkie i zdrowe.",
      instructions: "1. Ugotuj ryż. 2. Kurczaka pokrój w kostkę i usmaż na oliwie. 3. Dodaj brokuły i duś pod przykryciem.",
      prepTime: 25,
      imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=60",
      ingredients: [
        { ingredientId: chicken.id, amount: 200 },
        { ingredientId: rice.id, amount: 100 },
        { ingredientId: broccoli.id, amount: 150 },
        { ingredientId: oliveOil.id, amount: 10 }
      ]
    });

    const porridge = await storage.createRecipe({
      name: "Owsianka z jabłkiem",
      description: "Idealne śniadanie na start dnia. Pełne błonnika.",
      instructions: "1. Zagotuj mleko. 2. Dodaj płatki i gotuj na wolnym ogniu. 3. Dodaj pokrojone jabłko na koniec.",
      prepTime: 10,
      imageUrl: "https://images.unsplash.com/photo-1517673132405-a56a62b18caf?w=500&auto=format&fit=crop&q=60",
      ingredients: [
        { ingredientId: oatmeal.id, amount: 60 },
        { ingredientId: milk.id, amount: 200 },
        { ingredientId: apple.id, amount: 1 }
      ]
    });
    
    // Sample Meal Plan for today
    const today = new Date().toISOString().split('T')[0];
    await storage.createMealEntry({
      date: today,
      recipeId: porridge.id,
      mealType: "breakfast",
      isEaten: false
    });
    
    console.log("Database seeded successfully!");
  }

  return httpServer;
}
