import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { fetchWithTimeout } from "@/lib/queryClient";
import type { CreateIngredientRequest, Ingredient } from "@shared/schema";

export function useIngredients(search?: string) {
  return useQuery({
    queryKey: [api.ingredients.list.path, search],
    queryFn: async () => {
      const url = search 
        ? `${api.ingredients.list.path}?search=${encodeURIComponent(search)}`
        : api.ingredients.list.path;
      
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error("Failed to fetch ingredients");
      return api.ingredients.list.responses[200].parse(await res.json());
    },
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
    },
  });
}
