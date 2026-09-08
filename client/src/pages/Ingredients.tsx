import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { useAllIngredients, useCreateIngredient, useDeleteIngredient, useUpdateIngredient } from "@/hooks/use-ingredients";
import { useDebounce } from "@/hooks/use-debounce";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Trash2, Edit2, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const createIngredientSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional().or(z.literal("")),
  calories: z.coerce.number().min(0),
  protein: z.coerce.number().min(0),
  carbs: z.coerce.number().min(0),
  fat: z.coerce.number().min(0),
  unit: z.string().default("g"),
  price: z.coerce.number().min(0).default(0),
  packageSize: z.coerce.number().min(0).default(100),
  packagePrice: z.coerce.number().min(0).default(0),
  unitWeight: z.coerce.number().optional().or(z.literal(0)),
  unitDescription: z.string().optional().or(z.literal("")),
  imageUrl: z.string().optional().or(z.literal("")),
  alwaysAtHome: z.boolean().optional().default(false),
  ediblePercentage: z.coerce.number().min(1).max(100).default(100),
  increasePurchaseForWaste: z.boolean().optional().default(false),
  useSoon: z.boolean().optional().default(false),
});

export default function Ingredients() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [ingredientPage, setIngredientPage] = useState(1);
  const ingredientsPerPage = 100;

  useEffect(() => {
    setIngredientPage(1);
  }, [debouncedSearch]);

  const { data: ingredients, isLoading } = useAllIngredients(debouncedSearch);
  const ingredientPagination = (ingredients as any)?.pagination;
  const ingredientTotal = ingredientPagination?.total ?? ingredients?.length ?? 0;
  const { mutate: createIngredient } = useCreateIngredient();
  const { mutate: updateIngredientMutation } = useUpdateIngredient();
  const { mutate: deleteIngredientMutation } = useDeleteIngredient();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("alphabetical");
  const [completenessFilter, setCompletenessFilter] = useState<string>("all");

  const normalizeText = (value?: string | null) => (value ?? "").trim().toLowerCase();
  const displayText = (value?: string | null) => (value ?? "").trim();
  const uncategorizedLabel = "Bez kategorii";
  const getPricingUpdatedTime = (value?: string | Date | null) => {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
  };
  const formatPricingUpdatedAt = (value?: string | Date | null) => {
    const time = getPricingUpdatedTime(value);
    if (!time) return "brak daty";
    return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(new Date(time));
  };

  const categories = Array.from(
    new Set(
      (ingredients || [])
        .map((i) => displayText(i.category))
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, "pl")) as string[];

  const filteredIngredients = ingredients?.filter(item => {
    const normalizedSearch = normalizeText(search);
    const matchesSearch = !normalizedSearch
      || normalizeText(item.name).includes(normalizedSearch)
      || normalizeText(item.category).includes(normalizedSearch);

    const categoryMatches = selectedCategory === "all"
      || normalizeText(item.category) === normalizeText(selectedCategory);

    const price = Number(item.price) || 0;
    const unitWeight = Number(item.unitWeight) || 0;
    const missingPrice = price <= 0;
    const missingUnitWeight = unitWeight <= 0;

    const completenessMatches =
      completenessFilter === "all" ||
      (completenessFilter === "missingPrice" && missingPrice) ||
      (completenessFilter === "missingUnitWeight" && missingUnitWeight) ||
      (completenessFilter === "missingAny" && (missingPrice || missingUnitWeight));

    return matchesSearch && categoryMatches && completenessMatches;
  }).sort((a, b) => {
    switch (sortBy) {
      case "alphabetical":
        return displayText(a.name).localeCompare(displayText(b.name), "pl");
      case "calories":
        return b.calories - a.calories;
      case "protein":
        return b.protein - a.protein;
      case "carbs":
        return b.carbs - a.carbs;
      case "fat":
        return b.fat - a.fat;
      case "pricingNewest":
        return getPricingUpdatedTime(b.pricingUpdatedAt) - getPricingUpdatedTime(a.pricingUpdatedAt);
      case "pricingOldest":
        return getPricingUpdatedTime(a.pricingUpdatedAt) - getPricingUpdatedTime(b.pricingUpdatedAt);
      default:
        return 0;
    }
  });
  const visibleIngredients = filteredIngredients?.slice((ingredientPage - 1) * ingredientsPerPage, ingredientPage * ingredientsPerPage) || [];
  const ingredientTotalPages = Math.max(1, Math.ceil((filteredIngredients?.length || 0) / ingredientsPerPage));

  useEffect(() => {
    setIngredientPage(1);
  }, [selectedCategory, sortBy, completenessFilter]);

  useEffect(() => {
    if (ingredientPage > ingredientTotalPages) setIngredientPage(ingredientTotalPages);
  }, [ingredientPage, ingredientTotalPages]);

  const groupedIngredients = visibleIngredients.reduce((acc, item) => {
    const category = displayText(item.category) || uncategorizedLabel;
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {} as Record<string, any[]>);
  const groupedCategoryNames = Object.keys(groupedIngredients).sort((a, b) => a.localeCompare(b, "pl"));
  const totalIngredientsCount = ingredientTotal;
  const visibleIngredientsCount = filteredIngredients?.length ?? 0;
  const ingredientCountLabel = (count: number) => {
    const lastTwoDigits = count % 100;
    const lastDigit = count % 10;

    if (count === 1) return "składnik";
    if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) return "składniki";
    return "składników";
  };

  const form = useForm({
    resolver: zodResolver(createIngredientSchema),
    defaultValues: {
      name: "",
      category: "",
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      unit: "g",
      unitWeight: 0,
      unitDescription: "",
      imageUrl: "",
      price: 0,
      packageSize: 100,
      packagePrice: 0,
      alwaysAtHome: false,
      ediblePercentage: 100,
      increasePurchaseForWaste: false,
      useSoon: false,
    },
  });

  const openEdit = (ingredient: any) => {
    setEditingIngredient(ingredient);
    form.reset({
      name: ingredient.name,
      category: ingredient.category || "",
      calories: ingredient.calories,
      protein: ingredient.protein,
      carbs: ingredient.carbs,
      fat: ingredient.fat,
      unit: ingredient.unit,
      unitWeight: ingredient.unitWeight || 0,
      unitDescription: ingredient.unitDescription || "",
      price: ingredient.price || 0,
      packageSize: ingredient.packageSize || 100,
      packagePrice: ingredient.packagePrice ?? ingredient.price ?? 0,
      imageUrl: ingredient.imageUrl || "",
      alwaysAtHome: !!ingredient.alwaysAtHome,
      ediblePercentage: ingredient.ediblePercentage ?? 100,
      increasePurchaseForWaste: !!ingredient.increasePurchaseForWaste,
      useSoon: !!ingredient.useSoon,
    });
    setIsOpen(true);
  };

  const closeDialog = () => {
    setIsOpen(false);
    setEditingIngredient(null);
    form.reset({
      name: "",
      category: "",
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      unit: "g",
      unitWeight: 0,
      unitDescription: "",
      price: 0,
      packageSize: 100,
      packagePrice: 0,
      imageUrl: "",
      alwaysAtHome: false,
      ediblePercentage: 100,
      increasePurchaseForWaste: false,
      useSoon: false,
    });
  };

  const onSubmit = (data: any) => {
    const packageSize = Number(data.packageSize) || 0;
    const packagePrice = Number(data.packagePrice) || 0;
    const calculatedPrice = packageSize > 0 ? Math.round((packagePrice / packageSize) * 10000) / 100 : 0;
    const payload = {
      ...data,
      packageSize,
      packagePrice,
      price: calculatedPrice,
    };

    if (editingIngredient) {
      updateIngredientMutation({ id: editingIngredient.id, data: payload }, {
        onSuccess: () => {
          closeDialog();
          toast({ title: "Zaktualizowano składnik" });
        },
      });
    } else {
      createIngredient(payload, {
        onSuccess: () => {
          closeDialog();
          toast({ title: "Dodano składnik" });
        },
        onError: (err) => toast({ variant: "destructive", title: "Błąd", description: err.message }),
      });
    }
  };

  const watchedPackageSize = Number(form.watch("packageSize")) || 0;
  const watchedPackagePrice = Number(form.watch("packagePrice")) || 0;
  const calculatedPricePer100g = watchedPackageSize > 0
    ? Math.round((watchedPackagePrice / watchedPackageSize) * 10000) / 100
    : 0;

  if (isLoading) return <Layout><LoadingSpinner /></Layout>;

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Składniki</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Łącznie {totalIngredientsCount} {ingredientCountLabel(totalIngredientsCount)} w bazie.
          </p>
        </div>

        <Dialog
          open={isOpen}
          onOpenChange={(open) => {
            if (open) {
              setIsOpen(true);
              return;
            }

            if (!editingIngredient && form.formState.isDirty) {
              const shouldDiscard = window.confirm("Masz niezapisane zmiany. Czy chcesz porzucić dodawanie składnika?");
              if (!shouldDiscard) return;
            }

            closeDialog();
          }}
        >
          <DialogTrigger asChild>
            <Button data-testid="button-add-ingredient" className="bg-primary hover:bg-primary/90 rounded-xl" onClick={() => setIsOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Dodaj składnik
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto sm:max-h-[90vh] max-sm:h-[100dvh] max-sm:max-h-none">
            <DialogHeader>
              <DialogTitle>{editingIngredient ? "Edytuj składnik" : "Nowy składnik"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
              <div>
                <label className="text-sm font-medium">Nazwa</label>
                <Input {...form.register("name")} placeholder="np. Pierś z kurczaka" />
              </div>
              <div>
                <label className="text-sm font-medium">Kategoria</label>
                <div className="space-y-2">
                  {categories.length > 0 && (
                    <Select
                      value={displayText(form.watch("category")) || "__none__"}
                      onValueChange={(value) => {
                        form.setValue("category", value === "__none__" ? "" : value, { shouldDirty: true });
                      }}
                    >
                      <SelectTrigger className="rounded-md">
                        <SelectValue placeholder="Wybierz istniejącą kategorię" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Brak kategorii</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category} value={category}>{category}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Input
                    {...form.register("category")}
                    placeholder="lub wpisz nową kategorię, np. Mięso"
                  />
                </div>
              </div>
              <div className="rounded-xl border border-dashed p-3 space-y-3 bg-secondary/20">
                <div>
                  <label className="text-sm font-medium">Część jadalna (%)</label>
                  <Input type="number" min="1" max="100" step="1" {...form.register("ediblePercentage")} />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Wpływa na kalorie i makro. 100% oznacza, że cały składnik jest jadalny.
                  </p>
                </div>
                <label className="inline-flex items-start gap-2 text-sm font-medium">
                  <input type="checkbox" className="mt-1" {...form.register("increasePurchaseForWaste")} />
                  <span>
                    Zwiększ ilość do kupienia o niejadalną część
                    <span className="block text-[11px] text-muted-foreground font-normal">
                      Np. 500g ziemniaków przy 50% części jadalnej da 1000g na liście zakupów, ale kalorie z 500g.
                    </span>
                  </span>
                </label>
                <label className="inline-flex items-start gap-2 text-sm font-medium">
                  <input type="checkbox" className="mt-1" {...form.register("useSoon")} />
                  <span>
                    Trudny w przechowywaniu — wykorzystaj szybko
                    <span className="block text-[11px] text-muted-foreground font-normal">
                      Takie składniki pojawią się w podglądzie resztek po zakupie pełnych opakowań w jadłospisie.
                    </span>
                  </span>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Kalorie (na 100g)</label>
                  <Input type="number" step="1" {...form.register("calories")} />
                </div>
                <div>
                  <label className="text-sm font-medium">Cena opakowania (PLN)</label>
                  <Input type="number" min="0" step="0.01" {...form.register("packagePrice")} placeholder="np. 4" />
                </div>
                <div>
                  <label className="text-sm font-medium">Wielkość opakowania (g/ml)</label>
                  <Input type="number" min="0" step="0.01" {...form.register("packageSize")} placeholder="np. 400" />
                </div>
                <div className="rounded-lg bg-secondary/40 p-3 text-sm">
                  <span className="block text-muted-foreground text-xs">Przeliczona cena</span>
                  <strong>{calculatedPricePer100g.toFixed(2)} PLN / 100g</strong>
                  {editingIngredient?.pricingUpdatedAt && (
                    <span className="block text-[11px] text-muted-foreground mt-1">
                      Ostatnia zmiana: {formatPricingUpdatedAt(editingIngredient.pricingUpdatedAt)}
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Białko</label>
                  <Input type="number" step="0.1" {...form.register("protein")} />
                </div>
                <div>
                  <label className="text-sm font-medium">Węglowodany</label>
                  <Input type="number" step="0.1" {...form.register("carbs")} />
                </div>
                <div>
                  <label className="text-sm font-medium">Tłuszcze</label>
                  <Input type="number" step="0.1" {...form.register("fat")} />
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium">Zdjęcie</label>
                <div className="flex gap-2 items-center">
                  <Input {...form.register("imageUrl")} placeholder="URL obrazka (opcjonalnie)" className="flex-1" />
                  <div className="relative">
                    <Input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id="ingredient-image-upload"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const formData = new FormData();
                          formData.append("image", file);
                          try {
                            const res = await fetch("/api/upload", {
                              method: "POST",
                              body: formData,
                            });
                            if (res.ok) {
                              const data = await res.json();
                              form.setValue("imageUrl", data.imageUrl);
                              toast({ title: "Sukces", description: "Zdjęcie zostało przesłane." });
                            }
                          } catch (err) {
                            toast({ variant: "destructive", title: "Błąd", description: "Nie udało się przesłać zdjęcia." });
                          }
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById("ingredient-image-upload")?.click()}
                    >
                      Wgraj
                    </Button>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-dashed">
                <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
                  Informacja o sztukach (opcjonalnie)
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-[200px] text-[10px]">Pozwala na szybkie sprawdzenie wagi jednej sztuki przy dodawaniu do przepisu.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Waga sztuki (g)</label>
                    <Input type="number" {...form.register("unitWeight")} placeholder="np. 150" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Opis</label>
                    <Input {...form.register("unitDescription")} placeholder="np. 1 średnia sztuka" />
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full">Zapisz składnik</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-4 rounded-2xl border border-border bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-foreground">
          Wyświetlono {visibleIngredientsCount} z {totalIngredientsCount} {ingredientCountLabel(totalIngredientsCount)}.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Kategorie widoczne w wynikach: {groupedCategoryNames.length}.
        </p>
      </div>

      <div className="relative mb-6 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input 
            className="pl-10 rounded-xl" 
            placeholder="Szukaj składników..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-full sm:w-[180px] rounded-xl bg-white shadow-sm">
              <SelectValue placeholder="Kategoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie kategorie</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-full sm:w-[180px] rounded-xl bg-white shadow-sm">
              <SelectValue placeholder="Sortuj według" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alphabetical">Alfabetycznie</SelectItem>
              <SelectItem value="calories">Kalorie (max)</SelectItem>
              <SelectItem value="protein">Białko (max)</SelectItem>
              <SelectItem value="carbs">Węglowodany (max)</SelectItem>
              <SelectItem value="fat">Tłuszcze (max)</SelectItem>
              <SelectItem value="pricingNewest">Cena/opakowanie: najnowsze zmiany</SelectItem>
              <SelectItem value="pricingOldest">Cena/opakowanie: najstarsze zmiany</SelectItem>
            </SelectContent>
          </Select>


          <Select value={completenessFilter} onValueChange={setCompletenessFilter}>
            <SelectTrigger className="w-full sm:w-[220px] rounded-xl bg-white shadow-sm">
              <SelectValue placeholder="Uzupełnienie danych" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie składniki</SelectItem>
              <SelectItem value="missingPrice">Bez ceny</SelectItem>
              <SelectItem value="missingUnitWeight">Bez wagi sztuki</SelectItem>
              <SelectItem value="missingAny">Bez ceny lub wagi sztuki</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-6">
        {groupedCategoryNames.map((categoryName) => (
          <section key={categoryName} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {categoryName}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {groupedIngredients[categoryName].map((item: any) => (
                <div key={item.id} className="bg-white p-4 rounded-2xl shadow-sm border border-border flex items-center justify-between gap-3 group">
                  <div className="flex min-w-0 flex-1 items-center gap-3 cursor-pointer" onClick={() => openEdit(item)}>
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-12 w-12 rounded-xl object-cover bg-secondary flex-shrink-0"
                        loading="lazy"
                      />
                    )}
                    <div className="min-w-0">
                      <h3 className="font-bold truncate">{item.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {item.calories} kcal <span className="text-gray-300">|</span> B:{item.protein} T:{item.fat} W:{item.carbs}
                      </p>
                      {item.useSoon && (
                        <span className="mt-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          wykorzystaj szybko
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(item)}
                      className="text-primary opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-secondary rounded-lg"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          className="text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Czy na pewno?</AlertDialogTitle>
                          <AlertDialogDescription>
                            To trwale usunie składnik "{item.name}".
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Anuluj</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              deleteIngredientMutation(item.id, {
                                onSuccess: () => {
                                  toast({ title: "Usunięto składnik" });
                                },
                                onError: () => {
                                  toast({
                                    variant: "destructive",
                                    title: "Błąd",
                                    description: "Nie można usunąć składnika. Prawdopodobnie jest używany w przepisie lub planie posiłków."
                                  });
                                }
                              });
                            }}
                            className="bg-red-500 hover:bg-red-600"
                          >
                            Usuń
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {ingredientTotalPages > 1 && (
        <div className="mt-6 flex flex-col items-center justify-between gap-3 rounded-2xl border bg-white p-4 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            Strona {ingredientPage} z {ingredientTotalPages} • pokazano {visibleIngredients.length} z {visibleIngredientsCount} pasujących składników
          </p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={ingredientPage === 1 || isLoading} onClick={() => setIngredientPage((page) => Math.max(1, page - 1))}>
              Poprzednia
            </Button>
            <Button variant="outline" disabled={isLoading || ingredientPage >= ingredientTotalPages} onClick={() => setIngredientPage((page) => page + 1)}>
              Następna
            </Button>
          </div>
        </div>
      )}
    </Layout>
  );
}
