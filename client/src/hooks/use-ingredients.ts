import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { fetchWithTimeout } from "@/lib/queryClient";
import type { CreateIngredientRequest, Ingredient } from "@shared/schema";

export function useIngredients(search?: string, page = 1, limit = 100) {
  return useQuery({
    queryKey: [api.ingredients.list.path, search, page, limit],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      const url = `${api.ingredients.list.path}?${params.toString()}`;
      
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error("Failed to fetch ingredients");
      const items = api.ingredients.list.responses[200].parse(await res.json());
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
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

export function useAllIngredients(search?: string) {
  return useQuery({
    queryKey: [api.ingredients.list.path, "all", search],
    queryFn: async () => {
      const pageSize = 200;
      let page = 1;
      let total = 0;
      const allItems: Ingredient[] = [];

      while (page === 1 || allItems.length < total) {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(pageSize),
        });
        if (search) params.set("search", search);
        const url = `${api.ingredients.list.path}?${params.toString()}`;

        const res = await fetchWithTimeout(url);
        if (!res.ok) throw new Error("Failed to fetch ingredients");
        const items = api.ingredients.list.responses[200].parse(await res.json());
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
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

export function useCreateIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateIngredientRequest) => {
      const res = await fetchWithTimeout(api.ingredients.create.path, {
        method: api.ingredients.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create ingredient");
      }
      return api.ingredients.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.ingredients.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.mealPlan.getShoppingList.path] });
    },
  });
}

export function useUpdateIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<CreateIngredientRequest> }) => {
      const url = buildUrl(api.ingredients.update.path, { id });
      const res = await fetchWithTimeout(url, {
        method: api.ingredients.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update ingredient");
      }
      return api.ingredients.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.ingredients.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.mealPlan.getShoppingList.path] });
    },
  });
}

export function useDeleteIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.ingredients.delete.path, { id });
      const res = await fetchWithTimeout(url, { method: api.ingredients.delete.method });
      if (!res.ok) throw new Error("Failed to delete ingredient");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.ingredients.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.mealPlan.getShoppingList.path] });
    },
  });
}
