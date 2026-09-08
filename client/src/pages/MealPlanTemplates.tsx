import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { api, buildUrl } from "@shared/routes";
import { fetchWithTimeout } from "@/lib/queryClient";
import { addDays, format, startOfWeek } from "date-fns";
import { pl } from "date-fns/locale";

type TemplateDay = {
  id: string;
  sourceDate: string;
  totalPrice: number;
  entries: { name: string; mealType: string; person: "A" | "B" }[];
};

type MealPlanTemplate = {
  id: string;
  name: string;
  createdAt: string;
  days: TemplateDay[];
};

type IdealDay = TemplateDay & {
  createdAt?: string;
};

const STORAGE_KEY = "meal-plan-templates-v2";
const IDEAL_DAYS_STORAGE_KEY = "ideal-meal-plan-days-v1";

const mealTypeLabel: Record<string, string> = {
  breakfast: "Śniadanie",
  lunch: "Obiad",
  dinner: "Kolacja",
  snack: "Drugie śniadanie",
};

export default function MealPlanTemplates() {
  const { toast } = useToast();
  const [templateName, setTemplateName] = useState("");
  const [sourceDates, setSourceDates] = useState<string[]>(Array.from({ length: 7 }).map((_, index) => format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), index), "yyyy-MM-dd")));
  const [targetWeekStart, setTargetWeekStart] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [templates, setTemplates] = useState<MealPlanTemplate[]>([]);
  const [idealDays, setIdealDays] = useState<IdealDay[]>([]);
  const [isLoadingSavedPlans, setIsLoadingSavedPlans] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplyingId, setIsApplyingId] = useState<string | null>(null);

  const loadSavedPlans = async () => {
    setIsLoadingSavedPlans(true);
    try {
      const [templatesRes, idealDaysRes] = await Promise.all([
        fetchWithTimeout(buildUrl(api.appState.get.path, { key: STORAGE_KEY })),
        fetchWithTimeout(buildUrl(api.appState.get.path, { key: IDEAL_DAYS_STORAGE_KEY })),
      ]);
      if (!templatesRes.ok || !idealDaysRes.ok) throw new Error("Nie udało się pobrać zapisanych jadłospisów");
      const [templatesPayload, idealDaysPayload] = await Promise.all([templatesRes.json(), idealDaysRes.json()]);
      const serverTemplates = Array.isArray(templatesPayload?.data) ? templatesPayload.data : [];
      const serverIdealDays = Array.isArray(idealDaysPayload?.data) ? idealDaysPayload.data : [];

      const localTemplates = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      const localIdealDays = JSON.parse(localStorage.getItem(IDEAL_DAYS_STORAGE_KEY) || "[]");
      const mergedTemplates = serverTemplates.length ? serverTemplates : (Array.isArray(localTemplates) ? localTemplates : []);
      const mergedIdealDays = serverIdealDays.length ? serverIdealDays : (Array.isArray(localIdealDays) ? localIdealDays : []);

      setTemplates(mergedTemplates);
      setIdealDays(mergedIdealDays);

      if (!serverTemplates.length && mergedTemplates.length) await savePlansState(STORAGE_KEY, mergedTemplates);
      if (!serverIdealDays.length && mergedIdealDays.length) await savePlansState(IDEAL_DAYS_STORAGE_KEY, mergedIdealDays);
    } catch (error: any) {
      toast({ title: "Błąd", description: error?.message || "Nie udało się pobrać zapisanych jadłospisów.", variant: "destructive" });
    } finally {
      setIsLoadingSavedPlans(false);
    }
  };

  useEffect(() => {
    void loadSavedPlans();
  }, []);

  const savePlansState = async (key: string, data: unknown) => {
    const res = await fetchWithTimeout(buildUrl(api.appState.set.path, { key }), {
      method: api.appState.set.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    });
    if (!res.ok) throw new Error("Nie udało się zapisać danych jadłospisu");
  };

  const saveTemplates = async (next: MealPlanTemplate[]) => {
    setTemplates(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    await savePlansState(STORAGE_KEY, next);
  };

  const saveIdealDays = async (next: IdealDay[]) => {
    setIdealDays(next);
    localStorage.setItem(IDEAL_DAYS_STORAGE_KEY, JSON.stringify(next));
    await savePlansState(IDEAL_DAYS_STORAGE_KEY, next);
  };

  const addIdealDayToSelectedDays = (day: IdealDay) => {
    setSourceDates((prev) => [...prev, day.sourceDate]);
    toast({ title: "Dodano", description: "Idealny dzień dodano do nowego jadłospisu." });
  };

  const createTemplateFromIdealDays = async () => {
    if (!templateName.trim()) {
      toast({ title: "Błąd", description: "Podaj nazwę jadłospisu.", variant: "destructive" });
      return;
    }
    if (idealDays.length === 0) {
      toast({ title: "Błąd", description: "Najpierw dodaj idealne dni z mealplanu.", variant: "destructive" });
      return;
    }

    const template: MealPlanTemplate = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: templateName.trim(),
      createdAt: new Date().toISOString(),
      days: idealDays.map((day) => ({ ...day, id: `${day.id}-${Math.random().toString(36).slice(2, 7)}` })),
    };
    try {
      await saveTemplates([template, ...templates]);
      setTemplateName("");
      toast({ title: "Gotowe", description: `Utworzono jadłospis z idealnych dni (${template.days.length}).` });
    } catch (error: any) {
      toast({ title: "Błąd", description: error?.message || "Nie udało się zapisać jadłospisu.", variant: "destructive" });
    }
  };

  const createTemplateFromSelectedDays = async () => {
    if (!templateName.trim()) {
      toast({ title: "Błąd", description: "Podaj nazwę jadłospisu.", variant: "destructive" });
      return;
    }
    const normalizedDates = sourceDates.map((value) => value.trim()).filter(Boolean);
    if (normalizedDates.length === 0) {
      toast({ title: "Błąd", description: "Dodaj przynajmniej jeden dzień źródłowy.", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const days: TemplateDay[] = [];
      for (const date of normalizedDates) {
        const url = api.mealPlan.getDay.path.replace(":date", date);
        const res = await fetchWithTimeout(url);
        if (!res.ok) throw new Error(`Nie udało się pobrać dnia ${date}`);
        const day = await res.json();
        const entries = (day.entries || []).map((entry: any) => ({
          name: entry.recipe?.name || entry.customName || "Posiłek własny",
          mealType: entry.mealType,
          person: (entry.person || "A") as "A" | "B",
        }));
        days.push({ id: `${date}-${Math.random().toString(36).slice(2, 7)}`, sourceDate: date, totalPrice: Number(day.totalPrice) || 0, entries });
      }

      const template: MealPlanTemplate = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: templateName.trim(),
        createdAt: new Date().toISOString(),
        days,
      };
      await saveTemplates([template, ...templates]);
      setTemplateName("");
      toast({ title: "Gotowe", description: `Zapisano jadłospis (${days.length} dni).` });
    } catch (error: any) {
      toast({ title: "Błąd", description: error?.message || "Nie udało się zapisać jadłospisu.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const applyTemplate = async (template: MealPlanTemplate, targetDates: Record<string, string>) => {
    setIsApplyingId(template.id);
    try {
      for (const day of template.days) {
        const targetDate = targetDates[day.id];
        if (!targetDate) continue;
        const res = await fetchWithTimeout(api.mealPlan.copyDay.path, {
          method: api.mealPlan.copyDay.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceDate: day.sourceDate, targetDate, replaceTarget: true }),
        });
        if (!res.ok) throw new Error(`Nie udało się wkleić dnia ${targetDate}`);
      }
      toast({ title: "Gotowe", description: "Wstawiono wybrane dni jadłospisu." });
    } catch (error: any) {
      toast({ title: "Błąd", description: error?.message || "Nie udało się wstawić jadłospisu.", variant: "destructive" });
    } finally {
      setIsApplyingId(null);
    }
  };

  return (
    <Layout>
      <section className="mb-6 rounded-2xl border border-border/60 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-base font-semibold">Nowy jadłospis (wybrane dni)</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Nazwa jadłospisu" className="h-9" />
          <div className="flex gap-2">
            <Button onClick={() => void createTemplateFromSelectedDays()} disabled={isSaving} className="h-9 flex-1">{isSaving ? "Zapisywanie..." : "Zapisz jadłospis"}</Button>
            <Button type="button" variant="outline" onClick={() => void createTemplateFromIdealDays()} className="h-9 flex-1">Z idealnych dni</Button>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {sourceDates.map((date, index) => (
            <div key={`${index}-${date}`} className="flex gap-2">
              <Input type="date" value={date} onChange={(e) => setSourceDates((prev) => prev.map((item, idx) => idx === index ? e.target.value : item))} className="h-9 max-w-xs" />
              <Button type="button" variant="ghost" onClick={() => setSourceDates((prev) => prev.filter((_, idx) => idx !== index))}>Usuń</Button>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={() => setSourceDates((prev) => [...prev, format(new Date(), "yyyy-MM-dd")])}>Dodaj dzień źródłowy</Button>
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-border/60 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-base font-semibold">Idealne dni</h3>
        {isLoadingSavedPlans && <div className="text-sm text-muted-foreground">Ładowanie zapisanych dni...</div>}
        {!isLoadingSavedPlans && idealDays.length === 0 && <div className="text-sm text-muted-foreground">Brak idealnych dni. Dodaj dzień z menu trzech kropek w mealplanie.</div>}
        <div className="grid gap-2 md:grid-cols-2">
          {idealDays.map((day) => (
            <div key={day.id} className="rounded-lg border p-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{format(new Date(`${day.sourceDate}T00:00:00`), "EEEE dd.MM", { locale: pl })}</div>
                  <div className="text-xs text-muted-foreground">Koszt dnia: {(Number(day.totalPrice) || 0).toFixed(2)} zł</div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => addIdealDayToSelectedDays(day)}>Użyj</Button>
                  <Button size="sm" variant="ghost" onClick={() => void saveIdealDays(idealDays.filter((item) => item.id !== day.id))}>Usuń</Button>
                </div>
              </div>
              <ul className="mt-1 list-disc pl-4 text-xs">
                {day.entries.length === 0 && <li>Brak wpisów</li>}
                {day.entries.slice(0, 6).map((entry, idx) => (
                  <li key={idx}>{mealTypeLabel[entry.mealType] || entry.mealType}: {entry.name} ({entry.person})</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-4 rounded-2xl border border-border/60 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-base font-semibold">Wklej jadłospis na tydzień</h3>
        <Input type="date" value={targetWeekStart} onChange={(e) => setTargetWeekStart(e.target.value)} className="h-9 max-w-xs" />
      </section>

      <section className="space-y-3">
        {isLoadingSavedPlans && <div className="text-sm text-muted-foreground">Ładowanie zapisanych jadłospisów...</div>}
        {!isLoadingSavedPlans && templates.length === 0 && <div className="text-sm text-muted-foreground">Brak zapisanych jadłospisów.</div>}
        {templates.map((template) => {
          const total = template.days.reduce((sum, d) => sum + (Number(d.totalPrice) || 0), 0);
          const defaultTargetDates = template.days.reduce((acc, day, index) => {
            acc[day.id] = format(addDays(new Date(`${targetWeekStart}T00:00:00`), index), "yyyy-MM-dd");
            return acc;
          }, {} as Record<string, string>);
          return (
            <div key={template.id} className="rounded-2xl border border-border/60 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold">{template.name}</h4>
                  <p className="text-xs text-muted-foreground">Koszt tygodnia: {total.toFixed(2)} zł</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={isApplyingId === template.id} onClick={() => void applyTemplate(template, defaultTargetDates)}>{isApplyingId === template.id ? "Wstawianie..." : "Wstaw dni"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => void saveTemplates(templates.filter((item) => item.id !== template.id))}>Usuń</Button>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {template.days.map((day) => (
                  <div key={`${template.id}-${day.id}`} className="rounded-lg border p-2">
                    <div className="text-sm font-medium">{format(new Date(`${day.sourceDate}T00:00:00`), "EEEE dd.MM", { locale: pl })}</div>
                    <div className="text-xs text-muted-foreground">Koszt dnia: {(Number(day.totalPrice) || 0).toFixed(2)} zł</div>
                    <div className="mt-1 text-xs">
                      Docelowy dzień:
                      <Input type="date" className="mt-1 h-8" defaultValue={defaultTargetDates[day.id]} onChange={(e) => { defaultTargetDates[day.id] = e.target.value; }} />
                    </div>
                    <ul className="mt-1 list-disc pl-4 text-xs">
                      {day.entries.length === 0 && <li>Brak wpisów</li>}
                      {day.entries.slice(0, 8).map((entry, idx) => (
                        <li key={idx}>{mealTypeLabel[entry.mealType] || entry.mealType}: {entry.name} ({entry.person})</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </Layout>
  );
}
