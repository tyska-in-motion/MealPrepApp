import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { CreateMealEntryRequest } from "@shared/schema";
import { apiRequest, fetchWithTimeout } from "@/lib/queryClient";
import { useToast } from "./use-toast";

export function useDayPlan(date: string) {
  return useQuery({
    queryKey: [api.mealPlan.getDay.path, date],
    queryFn: async () => {
      const url = buildUrl(api.mealPlan.getDay.path, { date });
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error("Failed to fetch meal plan");
      return api.mealPlan.getDay.responses[200].parse(await res.json());
    },
  });
}

export function useAddMealEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateMealEntryRequest) => {
      const res = await fetchWithTimeout(api.mealPlan.addEntry.path, {
        method: api.mealPlan.addEntry.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to add meal");
      }
      return api.mealPlan.addEntry.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.mealPlan.getDay.path, variables.date] });
      queryClient.invalidateQueries({ queryKey: [api.mealPlan.getShoppingList.path] });
      queryClient.invalidateQueries({ queryKey: [api.sharedMeals.list.path] });
    },
  });
}

export function useToggleEaten() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isEaten }: { id: number; isEaten: boolean }) => {
      const res = await apiRequest("PATCH", `/api/meal-plan/entry/${id}`, { isEaten });
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [api.mealPlan.getDay.path, data.date] });
    },
  });
}

export function useDeleteMealEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, date }: { id: number; date: string }) => {
      const url = buildUrl(api.mealPlan.deleteEntry.path, { id });
      const res = await fetchWithTimeout(url, { method: api.mealPlan.deleteEntry.method });
      if (!res.ok) throw new Error("Failed to delete meal");
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.mealPlan.getDay.path, variables.date] });
      queryClient.invalidateQueries({ queryKey: [api.mealPlan.getShoppingList.path] });
      queryClient.invalidateQueries({ queryKey: [api.sharedMeals.list.path] });
    },
  });
}

export function useUpdateMealEntry() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: any }) => {
      const res = await apiRequest("PATCH", `/api/meal-plan/entry/${id}`, updates);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update meal");
      }
      return await res.json();
    },
    onSuccess: (data: any) => {
      // Invalidate the specific date query
      queryClient.invalidateQueries({ queryKey: [api.mealPlan.getDay.path, data.date] });
      // Also invalidate shopping list as ingredients might have changed
      queryClient.invalidateQueries({ queryKey: [api.mealPlan.getShoppingList.path] });
      queryClient.invalidateQueries({ queryKey: [api.sharedMeals.list.path] });
      toast({ title: "Sukces", description: "Zmiany zostały zapisane." });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Błąd", 
        description: "Nie udało się zapisać zmian: " + error.message,
        variant: "destructive" 
      });
    }
  });
}

export function useCopyDayPlan() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ sourceDate, targetDate }: { sourceDate: string; targetDate: string }) => {
      const res = await fetchWithTimeout(api.mealPlan.copyDay.path, {
        method: api.mealPlan.copyDay.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceDate, targetDate, replaceTarget: true }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Nie udało się skopiować dnia");
      }

      return api.mealPlan.copyDay.responses[200].parse(await res.json());
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.mealPlan.getDay.path, variables.sourceDate] });
      queryClient.invalidateQueries({ queryKey: [api.mealPlan.getDay.path, variables.targetDate] });
      queryClient.invalidateQueries({ queryKey: [api.mealPlan.getShoppingList.path] });
      queryClient.invalidateQueries({ queryKey: [api.sharedMeals.list.path] });
      toast({ title: "Sukces", description: "Dzień został skopiowany." });
    },
    onError: (error: Error) => {
      toast({
        title: "Błąd",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useShoppingList(startDate: string, endDate: string) {
  return useQuery({
    queryKey: [api.mealPlan.getShoppingList.path, startDate, endDate],
    queryFn: async () => {
      const url = `${api.mealPlan.getShoppingList.path}?startDate=${startDate}&endDate=${endDate}`;
      const res = await fetchWithTimeout(url, {}, 20000);
      if (!res.ok) {
        const message = await res.text().catch(() => "Failed to fetch shopping list");
        throw new Error(message || "Failed to fetch shopping list");
      }
      return api.mealPlan.getShoppingList.responses[200].parse(await res.json());
    },
    enabled: !!startDate && !!endDate,
    placeholderData: (previousData) => previousData ?? [],
    retry: 1,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}
