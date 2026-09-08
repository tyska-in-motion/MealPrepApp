import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { fetchWithTimeout } from "@/lib/queryClient";
import type { CreateRecipeRequest } from "@shared/schema";

export function useRecipes(search?: string, ingredientId?: number, page = 1, limit = 50) {
  return useQuery({
    queryKey: [api.recipes.list.path, search, ingredientId, page, limit],
    queryFn: async () => {
      let url = api.recipes.list.path;
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (ingredientId) params.append("ingredientId", String(ingredientId));
      params.append("page", String(page));
      params.append("limit", String(limit));
      
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error("Failed to fetch recipes");
      const items = api.recipes.list.responses[200].parse(await res.json());
      const total = Number(res.headers.get("X-Total-Count") || items.length);
      return Object.assign(items, {
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      });
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useAllRecipes(search?: string, ingredientId?: number) {
  return useQuery({
    queryKey: [api.recipes.list.path, "all", search, ingredientId],
    queryFn: async () => {
      const pageSize = 100;
      let page = 1;
      let total = 0;
      const allItems: any[] = [];

      while (page === 1 || allItems.length < total) {
        let url = api.recipes.list.path;
        const params = new URLSearchParams();
        if (search) params.append("search", search);
        if (ingredientId) params.append("ingredientId", String(ingredientId));
        params.append("page", String(page));
        params.append("limit", String(pageSize));
        url += `?${params.toString()}`;

        const res = await fetchWithTimeout(url);
        if (!res.ok) throw new Error("Failed to fetch recipes");
        const items = api.recipes.list.responses[200].parse(await res.json());
        total = Number(res.headers.get("X-Total-Count") || items.length);
        allItems.push(...items);

        if (items.length === 0 || items.length < pageSize) break;
        page += 1;
      }

      return Object.assign(allItems, {
        pagination: {
          page: 1,
          limit: allItems.length,
          total: total || allItems.length,
          totalPages: 1,
        },
      });
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useRecipeSearchIndex() {
  return useQuery({
    queryKey: [api.recipes.searchIndex.path],
    queryFn: async () => {
      const res = await fetchWithTimeout(api.recipes.searchIndex.path);
      if (!res.ok) throw new Error("Failed to fetch recipe search index");
      return api.recipes.searchIndex.responses[200].parse(await res.json());
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export async function fetchRecipeDetails(id: number) {
  const url = buildUrl(api.recipes.get.path, { id });
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error("Failed to fetch recipe");
  return api.recipes.get.responses[200].parse(await res.json());
}

export function useRecipe(id: number) {
  return useQuery({
    queryKey: [api.recipes.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.recipes.get.path, { id });
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error("Failed to fetch recipe");
      return api.recipes.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      // Note: Data should match the extended schema in routes (with ingredients array)
      const res = await fetchWithTimeout(api.recipes.create.path, {
        method: api.recipes.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create recipe");
      }
      return api.recipes.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.recipes.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.recipes.searchIndex.path] });
    },
  });
}

export function useUpdateRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const url = buildUrl(api.recipes.update.path, { id });
      const res = await fetchWithTimeout(url, {
        method: api.recipes.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        const requestError = new Error(error.message || "Failed to update recipe") as Error & { code?: string; editedMealEntries?: any[] };
        requestError.code = error.code;
        requestError.editedMealEntries = error.editedMealEntries;
        throw requestError;
      }
      return api.recipes.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.recipes.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.recipes.searchIndex.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/meal-plan"] });
      queryClient.invalidateQueries({ queryKey: [api.mealPlan.getDaySummary.path] });
    },
  });
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.recipes.delete.path, { id });
      const res = await fetchWithTimeout(url, { method: api.recipes.delete.method });
      if (!res.ok) throw new Error("Failed to delete recipe");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.recipes.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.recipes.searchIndex.path] });
    },
  });
}
