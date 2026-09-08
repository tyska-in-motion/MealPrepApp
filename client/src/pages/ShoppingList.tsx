import { useEffect, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { pl } from "date-fns/locale";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Download, Eye, History, Trash2 } from "lucide-react";
import { canvasToPdfBlob, canvasesToPdfBlob, downloadBlob } from "@/lib/pdf";
import { Layout } from "@/components/Layout";
import { useShoppingList } from "@/hooks/use-meal-plan";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { apiRequest, fetchWithTimeout, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { normalizeSearchText } from "@/lib/text-normalize";

type ItemStatus = "NOT_BOUGHT" | "AT_HOME" | "BOUGHT";

const formatAmount = (value: number) => {
  const rounded = Math.round(Number(value || 0) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

const groupByCategory = (items: any[]) => items.reduce((acc: Record<string, any[]>, item: any) => {
  const category = item.category || "Inne";
  if (!acc[category]) acc[category] = [];
  acc[category].push(item);
  return acc;
}, {});

const formatPieces = (totalAmount: number, unitWeight?: number | null) => {
  const grams = Number(totalAmount || 0);
  const weight = Number(unitWeight || 0);
  if (!Number.isFinite(grams) || grams <= 0 || !Number.isFinite(weight) || weight <= 0) return null;
  const pieces = Math.ceil(grams / weight);
  return `${pieces} szt`;
};

const DAILY_BREAKDOWN_CATEGORIES = ["mieso", "pieczywo", "ryba", "ryby"];
const ACTIVE_SHOPPING_LIST_SYNC_INTERVAL_MS = 2_000;

const shouldShowDailyBreakdown = (category?: string | null) => {
  const normalizedCategory = normalizeSearchText(category);
  return DAILY_BREAKDOWN_CATEGORIES.some((keyword) => normalizedCategory.includes(keyword));
};

const formatShoppingDate = (isoDate: string) => {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return isoDate;
  return `${day}.${month}`;
};

const renderDailyBreakdown = (item: any) => {
  if (!shouldShowDailyBreakdown(item?.category)) return null;
  const dailyAmounts = Array.isArray(item?.dailyAmounts) ? item.dailyAmounts : [];
  if (dailyAmounts.length === 0) return null;

  const normalizedBreakdown = dailyAmounts
    .map((entry: any) => {
      const amount = Number(entry?.amount);
      const date = String(entry?.date || "");
      if (!Number.isFinite(amount) || amount <= 0 || !date) return null;
      return `${formatAmount(amount)}${item.unit} na ${formatShoppingDate(date)}`;
    })
    .filter(Boolean);

  if (normalizedBreakdown.length === 0) return null;
  return `(${normalizedBreakdown.join("; ")})`;
};

export default function ShoppingList() {
  const [notebookInput, setNotebookInput] = useState("");
  const [range, setRange] = useState(() => {
    const today = new Date();
    return {
      start: today,
      end: addDays(today, 3),
    };
  });
  const [generatedRange, setGeneratedRange] = useState<{ startDate: string; endDate: string } | null>(null);
  const [generatedStatuses, setGeneratedStatuses] = useState<Record<number, ItemStatus>>({});
  const [generatedHomeAmounts, setGeneratedHomeAmounts] = useState<Record<number, number>>({});
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<number | null>(null);
  const [snapshotName, setSnapshotName] = useState("");
  const [extraItemName, setExtraItemName] = useState("");
  const [extraItemAmount, setExtraItemAmount] = useState("1");
  const [extraItemUnit, setExtraItemUnit] = useState("szt");
  const [extraItemCategory, setExtraItemCategory] = useState("Inne");
  const [extraGeneratedItems, setExtraGeneratedItems] = useState<any[]>([]);
  const [activeExtraItemName, setActiveExtraItemName] = useState("");
  const [activeExtraItemAmount, setActiveExtraItemAmount] = useState("1");
  const [activeExtraItemUnit, setActiveExtraItemUnit] = useState("szt");
  const [activeExtraItemCategory, setActiveExtraItemCategory] = useState("Inne");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const { toast } = useToast();

  const startStr = format(range.start, "yyyy-MM-dd");
  const endStr = format(range.end, "yyyy-MM-dd");

  const { data: generatedItems = [], isLoading: isGenerating } = useShoppingList(
    generatedRange?.startDate || "",
    generatedRange?.endDate || "",
    !!generatedRange,
  );

  useEffect(() => {
    if (!generatedItems.length) return;
    setGeneratedStatuses((prev) => {
      const next: Record<number, ItemStatus> = {};
      for (const item of generatedItems as any[]) {
        next[item.ingredientId] = prev[item.ingredientId] || "NOT_BOUGHT";
      }
      return next;
    });
  }, [generatedItems]);

  const { data: notebookItems = [] } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ["/api/shopping-list-notebook"],
    queryFn: async () => {
      const response = await fetchWithTimeout("/api/shopping-list-notebook", {}, 10000);
      if (!response.ok) throw new Error("Nie udało się pobrać notatnika");
      return response.json();
    },
    placeholderData: (previousData) => previousData ?? [],
  });

  const { data: activeLists = [] } = useQuery<any[]>({
    queryKey: ["/api/shopping-lists/active"],
    queryFn: async () => {
      const response = await fetchWithTimeout("/api/shopping-lists/active", {}, 10000);
      if (!response.ok) throw new Error("Nie udało się pobrać aktywnych list");
      return response.json();
    },
    placeholderData: (previousData) => previousData ?? [],
    refetchInterval: ACTIVE_SHOPPING_LIST_SYNC_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });

  const { data: historyLists = [] } = useQuery<any[]>({
    queryKey: ["/api/shopping-lists/snapshots"],
    queryFn: async () => {
      const response = await fetchWithTimeout("/api/shopping-lists/snapshots", {}, 10000);
      if (!response.ok) throw new Error("Nie udało się pobrać historii");
      return response.json();
    },
    placeholderData: (previousData) => previousData ?? [],
  });

  const { data: selectedSnapshot } = useQuery<any>({
    queryKey: ["/api/shopping-lists/snapshots", selectedSnapshotId],
    queryFn: async () => {
      const response = await fetchWithTimeout(`/api/shopping-lists/snapshots/${selectedSnapshotId}`, {}, 10000);
      if (!response.ok) throw new Error("Nie udało się pobrać listy");
      return response.json();
    },
    enabled: selectedSnapshotId !== null,
    refetchInterval: selectedSnapshotId !== null ? ACTIVE_SHOPPING_LIST_SYNC_INTERVAL_MS : false,
    refetchOnWindowFocus: true,
  });

  const { data: selectedSnapshotBreakdown = [] } = useShoppingList(
    selectedSnapshot?.periodStart || "",
    selectedSnapshot?.periodEnd || "",
    !!selectedSnapshot,
  );

  const saveListMutation = useMutation({
    mutationFn: async () => {
      if (!generatedRange) throw new Error("Najpierw wygeneruj listę.");
      const fallbackName = `Lista ${generatedRange.startDate} - ${generatedRange.endDate}`;
      const payload = {
        name: snapshotName.trim() || fallbackName,
        periodStart: generatedRange.startDate,
        periodEnd: generatedRange.endDate,
        items: generatedWithStatus
          .filter((item: any) => item.remainingAmount > 0)
          .map((item: any) => ({
            ingredientId: item.isExtra ? null : item.ingredientId,
            name: item.name,
            totalAmount: Number(item.remainingAmount || 0),
            unit: item.unit || "g",
            category: item.category || "Inne",
            status: (generatedStatuses[item.ingredientId] || "NOT_BOUGHT") === "BOUGHT" ? "BOUGHT" : "NOT_BOUGHT",
            price: 0,
            isExtra: !!item.isExtra,
          })),
      };
      const response = await apiRequest("POST", "/api/shopping-lists/snapshots", payload);
      return response.json();
    },
    onSuccess: (snapshot: any) => {
      setSnapshotName("");
      setSelectedSnapshotId(snapshot.id);
      queryClient.invalidateQueries({ queryKey: ["/api/shopping-lists/active"] });
      toast({ title: "Lista zapisana", description: "Na zapisanej liście są tylko produkty do kupienia." });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { status?: ItemStatus; price?: number } }) => {
      await apiRequest("PATCH", `/api/shopping-lists/snapshot-items/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopping-lists/snapshots", selectedSnapshotId] });
      queryClient.invalidateQueries({ queryKey: ["/api/shopping-lists/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shopping-lists/snapshots"] });
    },
  });

  const completeListMutation = useMutation({
    mutationFn: async (snapshotId: number) => {
      await apiRequest("POST", `/api/shopping-lists/snapshots/${snapshotId}/complete`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopping-lists/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shopping-lists/snapshots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shopping-lists/snapshots", selectedSnapshotId] });
      setSelectedSnapshotId(null);
      toast({ title: "Zakupy zakończone", description: "Lista została przeniesiona do historii." });
    },
  });

  const deleteListMutation = useMutation({
    mutationFn: async (snapshotId: number) => {
      await apiRequest("DELETE", `/api/shopping-lists/snapshots/${snapshotId}`);
    },
    onSuccess: (_, snapshotId) => {
      if (selectedSnapshotId === snapshotId) setSelectedSnapshotId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/shopping-lists/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shopping-lists/snapshots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shopping-lists/snapshots", snapshotId] });
      toast({ title: "Usunięto", description: "Lista została usunięta." });
    },
  });

  const addItemToActiveListMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSnapshotId) throw new Error("Wybierz aktywną listę.");
      const trimmedName = activeExtraItemName.trim();
      const parsedAmount = Number(activeExtraItemAmount.replace(",", "."));

      if (!trimmedName) {
        throw new Error("Wpisz nazwę produktu.");
      }

      if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
        throw new Error("Podaj poprawną ilość (0 lub więcej).");
      }

      await apiRequest("POST", `/api/shopping-lists/snapshots/${selectedSnapshotId}/items`, {
        name: trimmedName,
        totalAmount: parsedAmount,
        unit: activeExtraItemUnit.trim() || "szt",
        category: activeExtraItemCategory.trim() || "Inne",
        status: "NOT_BOUGHT",
      });
    },
    onSuccess: () => {
      setActiveExtraItemName("");
      setActiveExtraItemAmount("1");
      setActiveExtraItemUnit("szt");
      setActiveExtraItemCategory("Inne");
      queryClient.invalidateQueries({ queryKey: ["/api/shopping-lists/snapshots", selectedSnapshotId] });
      queryClient.invalidateQueries({ queryKey: ["/api/shopping-lists/active"] });
      toast({ title: "Dodano pozycję", description: "Nowa pozycja została dodana do aktywnej listy." });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Nie udało się dodać pozycji";
      toast({ title: "Błąd", description: message, variant: "destructive" });
    },
  });

  const addNotebookItemMutation = useMutation({
    mutationFn: async (name: string) => {
      await apiRequest("POST", "/api/shopping-list-notebook", { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopping-list-notebook"] });
    },
  });

  const removeNotebookItemMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/shopping-list-notebook/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopping-list-notebook"] });
    },
  });

  const handleCompleteList = (snapshotId: number) => {
    const confirmed = window.confirm("Na pewno oznaczyć zakupy jako zakończone? Lista trafi do historii.");
    if (!confirmed) return;
    completeListMutation.mutate(snapshotId);
  };

  const handleDeleteList = (snapshotId: number) => {
    const confirmed = window.confirm("Na pewno usunąć tę listę zakupów? Tej operacji nie można cofnąć.");
    if (!confirmed) return;
    deleteListMutation.mutate(snapshotId);
  };

  const generatedWithStatus = useMemo(() => {
    const notebookGeneratedItems = notebookItems.map((item) => ({
      ingredientId: -(1_000_000 + item.id),
      name: item.name,
      totalAmount: 1,
      unit: "szt",
      category: "Notatnik",
      isExtra: true,
      isNotebook: true,
    }));

    return [...(generatedItems as any[]), ...notebookGeneratedItems, ...extraGeneratedItems].map((item: any) => {
      const totalAmount = Number(item.totalAmount || 0);
      const homeAmountRaw = Number(generatedHomeAmounts[item.ingredientId] || 0);
      const homeAmount = Math.max(0, Math.min(totalAmount, homeAmountRaw));
      const remainingAmount = Math.max(0, totalAmount - homeAmount);
      return {
        ...item,
        status: generatedStatuses[item.ingredientId] || "NOT_BOUGHT",
        homeAmount,
        remainingAmount,
      };
    });
  }, [generatedItems, generatedStatuses, extraGeneratedItems, generatedHomeAmounts, notebookItems]);

  const generatedToBuy = generatedWithStatus.filter((item) => item.status === "NOT_BOUGHT" && item.remainingAmount > 0);
  const generatedAtHome = generatedWithStatus.filter((item) => item.status === "NOT_BOUGHT" && item.remainingAmount <= 0 && item.homeAmount > 0);
  const generatedBought = generatedWithStatus.filter((item) => item.status === "BOUGHT");

  const generatedGroupedToBuy = groupByCategory(generatedToBuy);
  const generatedToBuyCategories = Object.keys(generatedGroupedToBuy).sort();

  const generatedCount = generatedWithStatus.length;
  const generatedSavedCount = generatedWithStatus.filter((item) => item.remainingAmount > 0).length;

  const toggleGeneratedBought = (ingredientId: number) => {
    setGeneratedStatuses((prev) => {
      const current = prev[ingredientId] || "NOT_BOUGHT";
      const next: ItemStatus = current === "BOUGHT" ? "NOT_BOUGHT" : "BOUGHT";
      return { ...prev, [ingredientId]: next };
    });
  };

  const setGeneratedAtHomeAmount = (ingredientId: number, totalAmount: number, rawValue: string) => {
    const parsedAmount = Number(rawValue.replace(",", "."));
    const normalizedAmount = Number.isFinite(parsedAmount) ? Math.max(0, Math.min(totalAmount, parsedAmount)) : 0;
    setGeneratedHomeAmounts((prev) => ({
      ...prev,
      [ingredientId]: normalizedAmount,
    }));
  };

  const toggleGeneratedAtHome = (ingredientId: number, totalAmount: number) => {
    setGeneratedHomeAmounts((prev) => {
      const current = Number(prev[ingredientId] || 0);
      const next = current >= totalAmount ? 0 : totalAmount;
      return { ...prev, [ingredientId]: next };
    });
  };

  const addExtraGeneratedItem = () => {
    const trimmedName = extraItemName.trim();
    const parsedAmount = Number(extraItemAmount.replace(",", "."));
    if (!trimmedName) {
      toast({ title: "Brak nazwy", description: "Wpisz nazwę dodatkowej pozycji." });
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      toast({ title: "Niepoprawna ilość", description: "Podaj poprawną ilość (0 lub więcej)." });
      return;
    }

    const itemId = -Date.now() - Math.floor(Math.random() * 1000);
    setExtraGeneratedItems((prev) => [
      ...prev,
      {
        ingredientId: itemId,
        name: trimmedName,
        totalAmount: parsedAmount,
        unit: extraItemUnit.trim() || "szt",
        category: extraItemCategory.trim() || "Inne",
        isExtra: true,
      },
    ]);
    setExtraItemName("");
    setExtraItemAmount("1");
    setExtraItemUnit("szt");
    setExtraItemCategory("Inne");
  };

  const addNotebookItem = () => {
    const trimmedName = notebookInput.trim();
    if (!trimmedName) {
      toast({ title: "Puste pole", description: "Wpisz notatkę do notatnika." });
      return;
    }

    const exists = notebookItems.some((item) => item.name.toLowerCase() === trimmedName.toLowerCase());
    if (exists) {
      toast({ title: "Już dodane", description: "Ta notatka jest już na liście notatnika." });
      return;
    }

    addNotebookItemMutation.mutate(trimmedName, {
      onSuccess: () => setNotebookInput(""),
      onError: (error: any) => {
        toast({ title: "Błąd zapisu", description: error?.message || "Nie udało się dodać notatki." });
      },
    });
  };

  const removeNotebookItem = (id: number) => {
    removeNotebookItemMutation.mutate(id, {
      onError: (error: any) => {
        toast({ title: "Błąd usuwania", description: error?.message || "Nie udało się usunąć notatki." });
      },
    });
  };

  const selectedItems = selectedSnapshot?.items || [];
  const selectedBreakdownByIngredientId = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const item of selectedSnapshotBreakdown as any[]) {
      const ingredientId = Number(item?.ingredientId);
      if (!Number.isFinite(ingredientId) || ingredientId <= 0) continue;
      if (!Array.isArray(item?.dailyAmounts) || item.dailyAmounts.length === 0) continue;
      map.set(ingredientId, item.dailyAmounts);
    }
    return map;
  }, [selectedSnapshotBreakdown]);
  const selectedToBuy = selectedItems.filter((item: any) => item.status !== "BOUGHT" && item.status !== "AT_HOME");
  const selectedAtHome = selectedItems.filter((item: any) => item.status === "AT_HOME");
  const selectedBought = selectedItems.filter((item: any) => item.status === "BOUGHT");
  const selectedGroupedToBuy = groupByCategory(selectedToBuy);
  const selectedToBuyCategories = Object.keys(selectedGroupedToBuy).sort();

  const downloadSelectedSnapshotPdf = async () => {
    if (!selectedSnapshot) return;

    const pageCanvases: HTMLCanvasElement[] = [];
    const createPageCanvas = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1240;
      canvas.height = 1754;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return { canvas, ctx };
    };
    let page = createPageCanvas();
    if (!page) return;
    pageCanvases.push(page.canvas);
    let { ctx } = page;

    const drawRoundedRect = (x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    };

    const drawHeader = (isContinuation: boolean) => {
      drawRoundedRect(40, 40, page!.canvas.width - 80, 150, 28, "#ffffff", "#dbeafe");
      ctx.fillStyle = "#1e40af";
      ctx.font = "700 48px 'Inter', 'Segoe UI', sans-serif";
      ctx.fillText(
        isContinuation
          ? `${selectedSnapshot.name || "Lista zakupów"} (cd.)`
          : selectedSnapshot.name || "Lista zakupów",
        76,
        110,
      );
      ctx.fillStyle = "#475569";
      ctx.font = "500 24px 'Inter', 'Segoe UI', sans-serif";
      ctx.fillText(`Zakres: ${selectedSnapshot.periodStart} – ${selectedSnapshot.periodEnd}`, 76, 156);
    };

    const newPage = () => {
      page = createPageCanvas();
      if (!page) return false;
      pageCanvases.push(page.canvas);
      ctx = page.ctx;
      drawHeader(true);
      y = 220;
      return true;
    };

    const renderItemsSection = (
      title: string,
      items: any[],
      style: { headerFill: string; headerText: string; itemFill: string; itemStroke: string; checkboxStroke: string; checkboxMark?: string; itemText: string },
    ) => {
      if (items.length === 0) return;
      if (y > page!.canvas.height - 170 && !newPage()) return;
      drawRoundedRect(40, y, page!.canvas.width - 80, 54, 16, style.headerFill);
      ctx.fillStyle = style.headerText;
      ctx.font = "700 26px 'Inter', 'Segoe UI', sans-serif";
      ctx.fillText(title, 64, y + 36);
      y += 72;
      for (const item of items) {
        if (y > page!.canvas.height - 90 && !newPage()) return;
        drawRoundedRect(40, y, page!.canvas.width - 80, 50, 12, style.itemFill, style.itemStroke);
        ctx.strokeStyle = style.checkboxStroke;
        ctx.lineWidth = 2;
        ctx.strokeRect(62, y + 14, 22, 22);
        if (style.checkboxMark) {
          ctx.fillStyle = style.checkboxStroke;
          ctx.font = "700 20px 'Inter', 'Segoe UI', sans-serif";
          ctx.fillText(style.checkboxMark, 66, y + 33);
        }
        ctx.fillStyle = style.itemText;
        ctx.font = "500 24px 'Inter', 'Segoe UI', sans-serif";
        ctx.fillText(`${item.name} — ${formatAmount(item.totalAmount)} ${item.unit}`, 100, y + 33);
        y += 58;
      }
      y += 12;
    };

    drawHeader(false);
    let y = 220;
    const categoryOrder = Object.keys(selectedGroupedToBuy);

    for (const category of categoryOrder) {
      const items = [...selectedGroupedToBuy[category]].sort((a: any, b: any) => a.name.localeCompare(b.name, "pl"));
      renderItemsSection(category, items, {
        headerFill: "#dbeafe",
        headerText: "#1d4ed8",
        itemFill: "#ffffff",
        itemStroke: "#e2e8f0",
        checkboxStroke: "#64748b",
        itemText: "#0f172a",
      });
    }

    renderItemsSection(
      "W domu",
      [...selectedAtHome].sort((a: any, b: any) => a.name.localeCompare(b.name, "pl")),
      {
        headerFill: "#e0f2fe",
        headerText: "#0369a1",
        itemFill: "#f8fafc",
        itemStroke: "#cbd5e1",
        checkboxStroke: "#0284c7",
        checkboxMark: "•",
        itemText: "#334155",
      },
    );
    renderItemsSection(
      "Kupione",
      [...selectedBought].sort((a: any, b: any) => a.name.localeCompare(b.name, "pl")),
      {
        headerFill: "#dcfce7",
        headerText: "#15803d",
        itemFill: "#f8fafc",
        itemStroke: "#e2e8f0",
        checkboxStroke: "#16a34a",
        checkboxMark: "✓",
        itemText: "#475569",
      },
    );

    const blob = pageCanvases.length === 1
      ? await canvasToPdfBlob(pageCanvases[0], "portrait")
      : await canvasesToPdfBlob(pageCanvases, "portrait");
    const safeName = (selectedSnapshot.name || "lista-zakupow")
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9ąćęłńóśźż-]/gi, "");
    downloadBlob(blob, `${safeName || "lista-zakupow"}.pdf`);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="bg-white rounded-2xl border p-4 space-y-3">
          <div>
            <h2 className="font-semibold">Notatnik do następnej listy</h2>
            <p className="text-[11px] text-muted-foreground">
              Dopisuj brakujące rzeczy na szybko. Po kliknięciu „Generuj listę” notatki automatycznie trafią do zakupów.
            </p>
            <p className="text-[11px] text-muted-foreground">
              Notatnik synchronizuje się przez konto, więc na telefonie i komputerze zobaczysz te same wpisy.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={notebookInput}
              onChange={(e) => setNotebookInput(e.target.value)}
              placeholder="Np. zioła prowansalskie, sól..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addNotebookItem();
                }
              }}
            />
            <Button onClick={addNotebookItem} className="sm:w-auto w-full">Dodaj notatkę</Button>
          </div>
          {notebookItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak notatek.</p>
          ) : (
            <div className="border rounded-xl divide-y">
              {notebookItems.map((item) => (
                <div key={item.id} className="px-3 py-2 flex items-center justify-between gap-3">
                  <p className="text-sm">{item.name}</p>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => removeNotebookItem(item.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Input type="date" value={startStr} onChange={(e) => setRange((prev) => ({ ...prev, start: new Date(e.target.value) }))} className="h-8 w-full min-w-0 px-2 text-sm sm:w-40" />
            <Input type="date" value={endStr} onChange={(e) => setRange((prev) => ({ ...prev, end: new Date(e.target.value) }))} className="h-8 w-full min-w-0 px-2 text-sm sm:w-40" />
            <Button className="h-8 w-full min-w-0 px-3 text-sm sm:w-auto" onClick={() => {
              setGeneratedStatuses({});
              setGeneratedHomeAmounts({});
              setExtraGeneratedItems([]);
              setGeneratedRange({ startDate: startStr, endDate: endStr });
            }}>
              Generuj listę
            </Button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Podgląd wygenerowanej listy</h2>
              <p className="text-[11px] text-muted-foreground">Przy każdej pozycji wpisz, ile masz już w domu — lista zapisze tylko brakującą ilość.</p>
            </div>
            <span className="text-xs text-muted-foreground">{generatedCount} pozycji • do zapisu: {generatedSavedCount}</span>
          </div>
          {!generatedRange ? (
            <p className="text-sm text-muted-foreground">Wybierz zakres dat i kliknij „Generuj listę”.</p>
          ) : isGenerating ? (
            <LoadingSpinner />
          ) : generatedCount === 0 ? (
            <p className="text-sm text-muted-foreground">Brak produktów dla wybranego zakresu.</p>
          ) : (
            <div className="border rounded-xl overflow-hidden">
              {generatedToBuyCategories.map((category) => (
                <div key={`cat-${category}`}>
                  <div className="px-4 py-1.5 bg-muted/30 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-y">
                    {category}
                  </div>
                  {generatedGroupedToBuy[category]
                    .sort((a: any, b: any) => a.name.localeCompare(b.name, "pl"))
                    .map((item: any) => (
                      <div
                        key={`to-buy-${item.ingredientId}`}
                        onClick={() => toggleGeneratedBought(item.ingredientId)}
                        className="py-2 px-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between hover:bg-muted/30 cursor-pointer transition-colors group border-b"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-4 h-4 rounded-full border border-muted-foreground/30 group-hover:border-primary" />
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-medium truncate block">{item.name}</span>
                            <p className="text-[11px] text-muted-foreground">
                              Potrzeba: {formatAmount(item.totalAmount)} {item.unit}
                            </p>
                            {renderDailyBreakdown(item) && (
                              <p className="text-[11px] text-muted-foreground">{renderDailyBreakdown(item)}</p>
                            )}
                            {item.homeAmount > 0 && (
                              <p className="text-[11px] text-muted-foreground">W domu: {formatAmount(item.homeAmount)} {item.unit}</p>
                            )}
                          </div>
                          {item.isExtra && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">Dodatkowe</span>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-2 sm:shrink-0">
                          <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded w-fit">
                            {formatAmount(item.remainingAmount)} {item.unit}
                          </span>
                          <Button
                            variant="outline"
                            className="h-8 px-2 text-[10px] w-full sm:h-6 sm:w-auto"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleGeneratedAtHome(item.ingredientId, Number(item.totalAmount || 0));
                            }}
                          >
                            Mam wszystko w domu
                          </Button>
                          <div className="flex items-center gap-1 justify-between sm:justify-start" onClick={(e) => e.stopPropagation()}>
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">Mam w domu:</span>
                            <Input
                              type="number"
                              min="0"
                              step="0.1"
                              value={generatedHomeAmounts[item.ingredientId] ?? 0}
                              onChange={(e) => setGeneratedAtHomeAmount(item.ingredientId, Number(item.totalAmount || 0), e.target.value)}
                              className="h-8 w-24 sm:h-7 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              ))}

              {generatedAtHome.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 bg-muted/30 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-y">W domu (nie trafi do zapisanej listy)</div>
                  {generatedAtHome
                    .sort((a: any, b: any) => a.name.localeCompare(b.name, "pl"))
                    .map((item: any) => (
                      <div key={`at-home-${item.ingredientId}`} className="py-2 px-3 flex items-center justify-between border-b bg-muted/10">
                        <div>
                          <span className="text-sm text-muted-foreground">{item.name}</span>
                          <p className="text-[11px] text-muted-foreground">{formatAmount(item.homeAmount)} {item.unit} masz już w domu</p>
                        </div>
                        <Button variant="outline" className="h-6 px-1.5 text-[9px]" onClick={() => toggleGeneratedAtHome(item.ingredientId, Number(item.totalAmount || 0))}>
                          Przywróć
                        </Button>
                      </div>
                    ))}
                </div>
              )}

              {generatedBought.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-y">Kupione</div>
                  {generatedBought
                    .sort((a: any, b: any) => a.name.localeCompare(b.name, "pl"))
                    .map((item: any) => (
                      <div
                        key={`bought-${item.ingredientId}`}
                        onClick={() => toggleGeneratedBought(item.ingredientId)}
                        className="py-2 px-3 flex items-center justify-between cursor-pointer hover:bg-muted/20 transition-colors border-b bg-muted/10"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-4 h-4 rounded-full border bg-primary border-primary flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                          <span className="text-sm text-muted-foreground line-through truncate">{item.name}</span>
                          {item.isExtra && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">Dodatkowe</span>
                          )}
                        </div>
                        <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                          {formatAmount(item.remainingAmount)} {item.unit}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {!!generatedRange && (
            <div className="border rounded-xl p-3 bg-muted/20 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dodaj dodatkową pozycję</p>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_100px_140px_auto] gap-2">
                <Input
                  value={extraItemName}
                  onChange={(e) => setExtraItemName(e.target.value)}
                  placeholder="Nazwa produktu (np. ręczniki papierowe)"
                />
                <Input
                  value={extraItemAmount}
                  onChange={(e) => setExtraItemAmount(e.target.value)}
                  placeholder="Ilość"
                  type="number"
                  min="0"
                  step="0.1"
                />
                <Input
                  value={extraItemUnit}
                  onChange={(e) => setExtraItemUnit(e.target.value)}
                  placeholder="Jednostka"
                />
                <Input
                  value={extraItemCategory}
                  onChange={(e) => setExtraItemCategory(e.target.value)}
                  placeholder="Kategoria"
                />
                <Button onClick={addExtraGeneratedItem}>Dodaj</Button>
              </div>
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-2">
            <Input
              value={snapshotName}
              onChange={(e) => setSnapshotName(e.target.value)}
              placeholder="Nazwa listy (opcjonalnie)"
            />
            <Button
              onClick={() => saveListMutation.mutate()}
              disabled={!generatedRange || generatedSavedCount === 0 || saveListMutation.isPending}
            >
              Zapisz listę
            </Button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border p-4 space-y-2">
          <h2 className="font-semibold">Aktywne listy</h2>
          {activeLists.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak aktywnych list.</p>
          ) : (
            activeLists.map((list: any) => (
              <div key={list.id} className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSnapshotId(list.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-xl border",
                    selectedSnapshotId === list.id ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  <p className="font-medium">{list.name}</p>
                  <p className="text-xs text-muted-foreground">{list.periodStart} - {list.periodEnd}</p>
                </button>
                <Button variant="outline" size="icon" onClick={() => handleDeleteList(list.id)} disabled={deleteListMutation.isPending}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))
          )}
        </div>

        {selectedSnapshot && (
          <div className="bg-white rounded-2xl border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{selectedSnapshot.name}</h3>
                <p className="text-xs text-muted-foreground">Lista zakupów: checkbox = kupione, pozycja trafi na dół.</p>
              </div>
              <div className="flex items-center gap-2">
                {selectedSnapshot.status !== "COMPLETED" && (
                  <Button onClick={() => handleCompleteList(selectedSnapshot.id)}>
                    Zakończ zakupy
                  </Button>
                )}
                {selectedSnapshot.status !== "COMPLETED" && (
                  <Button variant="outline" onClick={downloadSelectedSnapshotPdf}>
                    <Download className="w-4 h-4 mr-1.5" />
                    Pobierz PDF
                  </Button>
                )}
                <Button variant="outline" size="icon" onClick={() => handleDeleteList(selectedSnapshot.id)} disabled={deleteListMutation.isPending}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="border rounded-xl overflow-hidden">
              {selectedToBuyCategories.map((category) => (
                <div key={`selected-${category}`}>
                  <div className="px-4 py-1.5 bg-muted/30 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-y">
                    {category}
                  </div>
                  {selectedGroupedToBuy[category]
                    .sort((a: any, b: any) => a.name.localeCompare(b.name, "pl"))
                    .map((item: any) => {
                      const pieces = formatPieces(item.totalAmount, item.unitWeight);
                      const dailyBreakdown = renderDailyBreakdown({
                        ...item,
                        dailyAmounts: selectedBreakdownByIngredientId.get(Number(item.ingredientId)) || [],
                      });
                      return (
                        <div key={item.id} className="py-2 px-3 flex items-center justify-between gap-3 border-b hover:bg-muted/20">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <button
                              type="button"
                              className="w-4 h-4 rounded border border-muted-foreground/50"
                              onClick={() => updateItemMutation.mutate({ id: item.id, data: { status: "BOUGHT" } })}
                              disabled={selectedSnapshot.status === "COMPLETED"}
                            />
                            <div>
                              <p className="text-sm font-medium truncate">{item.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatAmount(item.totalAmount)} {item.unit}
                                {pieces ? ` • ${pieces}` : ""}
                              </p>
                              {dailyBreakdown && <p className="text-xs text-muted-foreground">{dailyBreakdown}</p>}
                            </div>
                          </div>

                        </div>
                      );
                    })}
                </div>
              ))}

              {selectedBought.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-y">Kupione</div>
                  {selectedBought
                    .sort((a: any, b: any) => a.name.localeCompare(b.name, "pl"))
                    .map((item: any) => {
                      const pieces = formatPieces(item.totalAmount, item.unitWeight);
                      const dailyBreakdown = renderDailyBreakdown({
                        ...item,
                        dailyAmounts: selectedBreakdownByIngredientId.get(Number(item.ingredientId)) || [],
                      });
                      return (
                        <div key={`done-${item.id}`} className="py-2 px-3 flex items-center justify-between gap-3 border-b bg-muted/10">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <button
                              type="button"
                              className="w-4 h-4 rounded border bg-primary border-primary flex items-center justify-center"
                              onClick={() => updateItemMutation.mutate({ id: item.id, data: { status: "NOT_BOUGHT" } })}
                              disabled={selectedSnapshot.status === "COMPLETED"}
                            >
                              <Check className="w-3 h-3 text-white" />
                            </button>
                            <div>
                              <p className="text-sm text-muted-foreground line-through truncate">{item.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatAmount(item.totalAmount)} {item.unit}
                                {pieces ? ` • ${pieces}` : ""}
                              </p>
                              {dailyBreakdown && <p className="text-xs text-muted-foreground">{dailyBreakdown}</p>}
                            </div>
                          </div>

                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {selectedSnapshot.status !== "COMPLETED" && (
              <div className="border rounded-xl p-3 bg-muted/20 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dodaj pozycję do aktywnej listy</p>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_100px_140px_auto] gap-2">
                  <Input
                    value={activeExtraItemName}
                    onChange={(e) => setActiveExtraItemName(e.target.value)}
                    placeholder="Nazwa produktu"
                  />
                  <Input
                    value={activeExtraItemAmount}
                    onChange={(e) => setActiveExtraItemAmount(e.target.value)}
                    placeholder="Ilość"
                    type="number"
                    min="0"
                    step="0.1"
                  />
                  <Input
                    value={activeExtraItemUnit}
                    onChange={(e) => setActiveExtraItemUnit(e.target.value)}
                    placeholder="Jednostka"
                  />
                  <Input
                    value={activeExtraItemCategory}
                    onChange={(e) => setActiveExtraItemCategory(e.target.value)}
                    placeholder="Kategoria"
                  />
                  <Button onClick={() => addItemToActiveListMutation.mutate()} disabled={addItemToActiveListMutation.isPending}>
                    Dodaj
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-2xl border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Historia list zakupów</h2>
              <p className="text-sm text-muted-foreground">Zakończone listy są schowane, żeby nie zajmowały miejsca.</p>
            </div>
            <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="shrink-0">
                  <History className="mr-2 h-4 w-4" />
                  Pokaż historię ({historyLists.length})
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Historia list zakupów</DialogTitle>
                </DialogHeader>
                {historyLists.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Brak zakończonych list.</p>
                ) : (
                  <div className="space-y-2">
                    {historyLists.map((snapshot: any) => (
                      <div key={snapshot.id} className="p-3 rounded-xl border flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{snapshot.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {snapshot.periodStart} - {snapshot.periodEnd} • Kupione: {snapshot.bought} • Koszt: {formatAmount(snapshot.totalCost || 0)} zł
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Zakończono: {snapshot.completedAt ? format(new Date(snapshot.completedAt), "d MMM yyyy HH:mm", { locale: pl }) : "-"}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => { setSelectedSnapshotId(snapshot.id); setIsHistoryOpen(false); }}>
                            <Eye className="mr-2 h-4 w-4" />
                            Podejrzyj zakupy
                          </Button>
                          <Button variant="outline" size="icon" onClick={() => deleteListMutation.mutate(snapshot.id)} disabled={deleteListMutation.isPending}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </Layout>
  );
}
