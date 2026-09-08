
import { z } from 'zod';
import { 
  insertIngredientSchema, 
  insertRecipeSchema, 
  insertMealEntrySchema, 
  insertSharedMealBatchSchema,
  insertRecipeIngredientSchema,
  ingredients, 
  recipes, 
  mealEntries,
  bodyMeasurements,
  insertBodyMeasurementSchema
} from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

const stepThresholdSchema = z.object({
  minServings: z.number().min(0),
  maxServings: z.number().min(0).nullable().optional(),
  amount: z.number().min(0),
});

const recipeIngredientInputSchema = z.object({
  ingredientId: z.number(),
  amount: z.number(),
  baseAmount: z.number().optional(),
  unit: z.string().optional(),
  alternativeAmount: z.number().min(0).optional(),
  alternativeUnit: z.string().optional(),
  scalingType: z.enum(["LINEAR", "FIXED", "STEP", "FORMULA"]).optional().default("LINEAR"),
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

export const api = {
  ingredients: {
    list: {
      method: 'GET' as const,
      path: '/api/ingredients',
      input: z.object({
        search: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof ingredients.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/ingredients',
      input: insertIngredientSchema,
      responses: {
        201: z.custom<typeof ingredients.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/ingredients/:id',
      responses: {
        200: z.custom<typeof ingredients.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/ingredients/:id',
      input: insertIngredientSchema.partial(),
      responses: {
        200: z.custom<typeof ingredients.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/ingredients/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    }
  },
  recipes: {
    list: {
      method: 'GET' as const,
      path: '/api/recipes',
      input: z.object({
        search: z.string().optional(),
        ingredientId: z.coerce.number().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<any>()), // Returns RecipeWithIngredients
      },
    },
    searchIndex: {
      method: 'GET' as const,
      path: '/api/recipes/search-index',
      responses: {
        200: z.array(z.custom<any>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/recipes',
      input: insertRecipeSchema.extend({
        instructionSteps: z.array(instructionStepSchema).optional(),
        servings: z.number().min(0.1).default(1),
        defaultServingsA: z.number().min(0.1).default(1),
        defaultServingsB: z.number().min(0.1).default(1.5),
        suggestedRecipeIds: z.array(z.number()).optional().default([]),
        suggestedRecipes: z.array(suggestedRecipeInputSchema).optional().default([]),
        ingredients: z.array(recipeIngredientInputSchema),
        frequentAddons: z.array(z.object({
          ingredientId: z.number(),
          amount: z.number(),
          baseAmount: z.number().optional(),
          defaultAmountA: z.number().min(0).optional(),
          defaultAmountB: z.number().min(0).optional(),
          unit: z.string().optional(),
          alternativeAmount: z.number().min(0).optional(),
          alternativeUnit: z.string().optional(),
          scalingType: z.enum(["LINEAR", "FIXED", "STEP", "FORMULA"]).optional().default("LINEAR"),
          scalingFormula: z.string().optional(),
          stepThresholds: z.array(stepThresholdSchema).optional(),
        })).optional().default([]),
        prepTasks: z.array(recipePrepTaskInputSchema).optional().default([]),
      }),
      responses: {
        201: z.custom<any>(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/recipes/:id',
      responses: {
        200: z.custom<any>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/recipes/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/recipes/:id',
      input: insertRecipeSchema.extend({
        instructionSteps: z.array(instructionStepSchema).optional(),
        servings: z.number().min(0.1).optional(),
        defaultServingsA: z.number().min(0.1).optional(),
        defaultServingsB: z.number().min(0.1).optional(),
        suggestedRecipeIds: z.array(z.number()).optional().default([]),
        suggestedRecipes: z.array(suggestedRecipeInputSchema).optional().default([]),
        ingredients: z.array(recipeIngredientInputSchema),
        frequentAddons: z.array(z.object({
          ingredientId: z.number(),
          amount: z.number(),
          baseAmount: z.number().optional(),
          defaultAmountA: z.number().min(0).optional(),
          defaultAmountB: z.number().min(0).optional(),
          unit: z.string().optional(),
          alternativeAmount: z.number().min(0).optional(),
          alternativeUnit: z.string().optional(),
          scalingType: z.enum(["LINEAR", "FIXED", "STEP", "FORMULA"]).optional().default("LINEAR"),
          scalingFormula: z.string().optional(),
          stepThresholds: z.array(stepThresholdSchema).optional(),
        })).optional().default([]),
        prepTasks: z.array(recipePrepTaskInputSchema).optional().default([]),
        resetEditedMealIngredients: z.boolean().optional().default(false),
      }),
      responses: {
        200: z.custom<any>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    }
  },
  mealPrep: {
    opportunities: {
      method: 'GET' as const,
      path: '/api/meal-prep',
      input: z.object({
        date: z.string().optional(),
        lookAheadDays: z.coerce.number().int().min(1).max(30).optional(),
      }).optional(),
      responses: {
        200: z.custom<any>(),
      },
    },
  },
  mealPlan: {
    getDay: {
      method: 'GET' as const,
      path: '/api/meal-plan/:date',
      responses: {
        200: z.custom<any>(), // DaySummary
      },
    },
    getDaySummary: {
      method: 'GET' as const,
      path: '/api/meal-plan/:date/summary',
      responses: {
        200: z.custom<any>(),
      },
    },
    addEntry: {
      method: 'POST' as const,
      path: '/api/meal-plan',
      input: insertMealEntrySchema.extend({
        createSharedBatch: z.boolean().optional(),
        sharedBatchServings: z.number().positive().optional(),
      }),
      responses: {
        201: z.custom<typeof mealEntries.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    copyDay: {
      method: 'POST' as const,
      path: '/api/meal-plan/copy-day',
      input: z.object({
        sourceDate: z.string(),
        targetDate: z.string(),
        replaceTarget: z.boolean().optional().default(true),
      }),
      responses: {
        200: z.object({ copiedEntries: z.number() }),
        400: errorSchemas.validation,
      },
    },
    toggleEaten: {
      method: 'PATCH' as const,
      path: '/api/meal-plan/:id/toggle',
      input: z.object({ isEaten: z.boolean() }),
      responses: {
        200: z.custom<typeof mealEntries.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    deleteEntry: {
      method: 'DELETE' as const,
      path: '/api/meal-plan/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    updateEntry: {
      method: 'PATCH' as const,
      path: '/api/meal-plan/entry/:id',
      input: z.object({
        servings: z.number().optional(),
        isEaten: z.boolean().optional(),
        person: z.enum(["A", "B"]).optional(),
        ingredients: z.array(z.object({
          ingredientId: z.number(),
          amount: z.number(),
        })).optional(),
      }).passthrough(),
      responses: {
        200: z.custom<any>(),
        404: errorSchemas.notFound,
      },
    },
    getEntryFull: {
      method: 'GET' as const,
      path: '/api/meal-plan/entry/:id/full',
      responses: {
        200: z.custom<any>(),
        404: errorSchemas.notFound,
      },
    },
    getStatsExclusions: {
      method: 'GET' as const,
      path: '/api/stats/exclusions',
      input: z.object({
        startDate: z.string(),
        endDate: z.string(),
      }),
      responses: {
        200: z.array(z.object({
          date: z.string(),
          reason: z.string(),
          updatedAt: z.string().or(z.date()).nullable().optional(),
        })),
      },
    },
    setStatsExclusion: {
      method: 'POST' as const,
      path: '/api/stats/exclusions',
      input: z.object({
        date: z.string(),
        reason: z.string().optional(),
      }),
      responses: {
        200: z.object({ success: z.boolean() }),
        400: errorSchemas.validation,
      },
    },
    getShoppingList: {
      method: 'GET' as const,
      path: '/api/shopping-list',
      input: z.object({
        startDate: z.string(),
        endDate: z.string(),
      }),
      responses: {
        200: z.array(z.custom<any>()), // ShoppingListItem[]
      },
    },
  },
  sharedMeals: {
    list: {
      method: "GET" as const,
      path: "/api/shared-meals",
      responses: {
        200: z.array(z.custom<any>()),
      },
    },
    createBatch: {
      method: "POST" as const,
      path: "/api/shared-meals",
      input: insertSharedMealBatchSchema.pick({ recipeId: true, totalServings: true, note: true }),
      responses: {
        201: z.custom<any>(),
        400: errorSchemas.validation,
      },
    },
    archiveBatch: {
      method: "PATCH" as const,
      path: "/api/shared-meals/:id/archive",
      input: z.object({ isArchived: z.boolean().optional().default(true) }),
      responses: {
        200: z.custom<any>(),
        404: errorSchemas.notFound,
      },
    },
    updateBatch: {
      method: "PATCH" as const,
      path: "/api/shared-meals/:id",
      input: z.object({
        totalServings: z.number().min(0.25).optional(),
        note: z.string().nullable().optional(),
      }),
      responses: {
        200: z.custom<any>(),
        404: errorSchemas.notFound,
        400: errorSchemas.validation,
      },
    },
    deleteBatch: {
      method: "DELETE" as const,
      path: "/api/shared-meals/:id",
      responses: {
        204: z.null(),
        404: errorSchemas.notFound,
      },
    },
    logs: {
      method: "GET" as const,
      path: "/api/shared-meals/:id/logs",
      responses: {
        200: z.array(z.custom<any>()),
      },
    },
  },
  userSettings: {
    get: {
      path: "/api/user-settings",
      method: "GET"
    },
    update: {
      path: "/api/user-settings",
      method: "PATCH"
    },
    history: {
      path: "/api/user-settings/history",
      method: "GET" as const,
      input: z.object({
        startDate: z.string(),
        endDate: z.string(),
      }),
      responses: {
        200: z.custom<Record<"A" | "B", any[]>>(),
      },
    }
  },
  appState: {
    get: {
      method: "GET" as const,
      path: "/api/app-state/:key",
      responses: {
        200: z.object({ key: z.string(), data: z.any().nullable() }),
      },
    },
    set: {
      method: "PUT" as const,
      path: "/api/app-state/:key",
      input: z.object({ data: z.any() }),
      responses: {
        200: z.object({ key: z.string(), data: z.any() }),
        400: errorSchemas.validation,
      },
    },
  },

  bodyMeasurements: {
    list: {
      method: "GET" as const,
      path: "/api/body-measurements",
      input: z.object({
        person: z.enum(["A", "B"]).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof bodyMeasurements.$inferSelect>()),
      },
    },
    upsert: {
      method: "POST" as const,
      path: "/api/body-measurements",
      input: insertBodyMeasurementSchema.extend({ person: z.enum(["A", "B"]) }),
      responses: {
        200: z.custom<typeof bodyMeasurements.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/body-measurements/:id",
      responses: {
        204: z.null(),
        404: errorSchemas.notFound,
      },
    },
  },
  shoppingListNotebook: {
    list: {
      path: "/api/shopping-list-notebook",
      method: "GET" as const,
      responses: {
        200: z.array(z.object({
          id: z.number(),
          name: z.string(),
        })),
      },
    },
    add: {
      path: "/api/shopping-list-notebook",
      method: "POST" as const,
      input: z.object({ name: z.string().min(1) }),
      responses: {
        201: z.object({
          id: z.number(),
          name: z.string(),
        }),
        400: errorSchemas.validation,
      },
    },
    remove: {
      path: "/api/shopping-list-notebook/:id",
      method: "DELETE" as const,
      responses: {
        204: z.null(),
        400: errorSchemas.validation,
      },
    },
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (!params) return url;

  const queryParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (url.includes(`:${key}`)) {
      url = url.replace(`:${key}`, encodeURIComponent(String(value)));
      return;
    }

    queryParams.set(key, String(value));
  });

  const queryString = queryParams.toString();
  return queryString ? `${url}?${queryString}` : url;
}
