import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, subYears } from "date-fns";
import { Activity, CalendarDays, Pencil, Scale, Trash2, TrendingDown, TrendingUp, X } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, buildUrl } from "@shared/routes";
import { cn } from "@/lib/utils";

type Person = "A" | "B";
type Period = "week" | "month" | "year";
type Measurement = {
  id: number;
  person: Person;
  date: string;
  weight?: number | null;
  waist?: number | null;
  chest?: number | null;
  arm?: number | null;
  thigh?: number | null;
  calf?: number | null;
  hips?: number | null;
};

const people: Record<Person, string> = { A: "Mati", B: "Tysia" };
const fields = [
  ["weight", "Waga", "kg"],
  ["waist", "Talia", "cm"],
  ["chest", "Klatka", "cm"],
  ["arm", "Ramię", "cm"],
  ["thigh", "Udo", "cm"],
  ["calf", "Łydka", "cm"],
  ["hips", "Biodra", "cm"],
] as const;

const today = () => format(new Date(), "yyyy-MM-dd");
const emptyForm = { date: today(), weight: "", waist: "", chest: "", arm: "", thigh: "", calf: "", hips: "" };
type MeasurementForm = typeof emptyForm;

function toNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function deltaLabel(value: number, unit: string) {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded} ${unit}`;
}

function summarize(records: Measurement[], days: number) {
  const since = format(new Date(Date.now() - days * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
  const period = records.filter((row) => row.date >= since).sort((a, b) => a.date.localeCompare(b.date));
  const weightRecords = period.filter((row) => row.weight != null);
  const waistRecords = period.filter((row) => row.waist != null);
  const weightDelta = weightRecords.length >= 2 ? Number(weightRecords.at(-1)?.weight) - Number(weightRecords[0].weight) : null;
  const waistDelta = waistRecords.length >= 2 ? Number(waistRecords.at(-1)?.waist) - Number(waistRecords[0].waist) : null;
  return { count: period.length, weightDelta, waistDelta };
}

function WeightChart({ records }: { records: Measurement[] }) {
  const points = records
    .filter((row) => row.weight != null && row.date >= format(subYears(new Date(), 1), "yyyy-MM-dd"))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length < 2) {
    return <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed text-center text-sm text-muted-foreground">Dodaj minimum dwa pomiary z ostatniego roku, aby zobaczyć wykres.</div>;
  }

  const weights = points.map((row) => Number(row.weight));
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = Math.max(max - min, 1);
  const path = points.map((row, index) => {
    const x = (index / (points.length - 1)) * 100;
    const y = 100 - ((Number(row.weight) - min) / range) * 82 - 9;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");

  return (
    <div className="rounded-2xl border bg-card p-4">
      <svg viewBox="0 0 100 100" className="h-64 w-full overflow-visible" preserveAspectRatio="none">
        <path d="M 0 91 L 100 91" className="stroke-muted" strokeWidth="0.5" fill="none" />
        <path d={path} className="stroke-primary" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" />
        {points.map((row, index) => {
          const x = (index / (points.length - 1)) * 100;
          const y = 100 - ((Number(row.weight) - min) / range) * 82 - 9;
          return <circle key={`${row.person}-${row.date}`} cx={x} cy={y} r="1.8" className="fill-primary" vectorEffect="non-scaling-stroke" />;
        })}
      </svg>
      <div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>{points[0].date}</span><span>{points.at(-1)?.date}</span></div>
      <div className="mt-1 text-sm font-medium">Zakres: {min.toFixed(1)}–{max.toFixed(1)} kg</div>
    </div>
  );
}

export default function BodyMeasurements() {
  const queryClient = useQueryClient();
  const [person, setPerson] = useState<Person>("A");
  const [period, setPeriod] = useState<Period>("month");
  const [form, setForm] = useState<MeasurementForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingOriginal, setEditingOriginal] = useState<{ person: Person; date: string } | null>(null);
  const startDate = useMemo(() => format(subYears(new Date(), 1), "yyyy-MM-dd"), []);

  const { data = [], isLoading } = useQuery<Measurement[]>({
    queryKey: [api.bodyMeasurements.list.path, startDate],
    queryFn: async () => {
      const res = await fetch(buildUrl(api.bodyMeasurements.list.path, { startDate, endDate: today() }));
      if (!res.ok) throw new Error("Nie udało się pobrać pomiarów");
      return res.json();
    },
  });

  const saveMeasurement = useMutation({
    mutationFn: async () => {
      const payload: Record<string, any> = { person, date: form.date };
      for (const [key] of fields) payload[key] = toNumber(form[key]);
      const shouldDeleteOriginal = editingId != null && editingOriginal != null && (editingOriginal.person !== person || editingOriginal.date !== form.date);
      const res = await fetch(api.bodyMeasurements.upsert.path, { method: api.bodyMeasurements.upsert.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error("Nie udało się zapisać pomiaru");
      if (shouldDeleteOriginal) {
        const deleteRes = await fetch(api.bodyMeasurements.delete.path.replace(":id", String(editingId)), { method: api.bodyMeasurements.delete.method });
        if (!deleteRes.ok) throw new Error("Nie udało się usunąć poprzedniej wersji pomiaru");
      }
    },
    onSuccess: async () => {
      setForm({ ...emptyForm, date: today() });
      setEditingId(null);
      setEditingOriginal(null);
      await queryClient.invalidateQueries({ queryKey: [api.bodyMeasurements.list.path] });
    },
  });

  const deleteMeasurement = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(api.bodyMeasurements.delete.path.replace(":id", String(id)), { method: api.bodyMeasurements.delete.method });
      if (!res.ok) throw new Error("Nie udało się usunąć pomiaru");
    },
    onSuccess: async (_data, id) => {
      if (editingId === id) {
        setEditingId(null);
        setEditingOriginal(null);
        setForm({ ...emptyForm, date: today() });
      }
      await queryClient.invalidateQueries({ queryKey: [api.bodyMeasurements.list.path] });
    },
  });

  const hasAnyMeasurement = fields.some(([key]) => toNumber(form[key]) != null);
  const personRecords = data.filter((row) => row.person === person).sort((a, b) => b.date.localeCompare(a.date));
  const selectedSummary = summarize(personRecords, period === "week" ? 7 : period === "month" ? 30 : 365);
  const latest = personRecords[0];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><h1 className="font-display text-3xl font-bold">Pomiary ciała</h1><p className="text-muted-foreground">Dodawaj wagę i obwody Matiego oraz Tysi dla konkretnego dnia.</p></div>
          <Select value={person} onValueChange={(value) => setPerson(value as Person)}><SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(people).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Scale className="h-5 w-5" /> Nowy pomiar</CardTitle></CardHeader><CardContent className="space-y-4">
            <div><label className="text-sm font-medium">Data</label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">{fields.map(([key, label, unit]) => <div key={key}><label className="text-sm font-medium">{label} ({unit})</label><Input inputMode="decimal" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={unit} /></div>)}</div>
            <div className="flex flex-col gap-2 sm:flex-row"><Button className="w-full" disabled={!form.date || !hasAnyMeasurement || saveMeasurement.isPending} onClick={() => saveMeasurement.mutate()}>{saveMeasurement.isPending ? "Zapisuję..." : editingId ? `Zaktualizuj dla: ${people[person]}` : `Zapisz dla: ${people[person]}`}</Button>{editingId ? <Button className="w-full sm:w-auto" variant="outline" onClick={() => { setEditingId(null); setEditingOriginal(null); setForm({ ...emptyForm, date: today() }); }}><X className="h-4 w-4" /> Anuluj</Button> : null}</div>
          </CardContent></Card>

          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> Statystyki</CardTitle></CardHeader><CardContent className="space-y-4">
            <div className="flex gap-2">{(["week", "month", "year"] as Period[]).map((value) => <Button key={value} variant={period === value ? "default" : "outline"} onClick={() => setPeriod(value)}>{value === "week" ? "Tydzień" : value === "month" ? "Miesiąc" : "Rok"}</Button>)}</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-muted p-4"><p className="text-sm text-muted-foreground">Ostatnia waga</p><p className="text-2xl font-bold">{latest?.weight != null ? `${Number(latest.weight).toFixed(1)} kg` : "—"}</p></div>
              <div className="rounded-2xl bg-muted p-4"><p className="text-sm text-muted-foreground">Zmiana wagi</p><p className={cn("flex items-center gap-1 text-2xl font-bold", selectedSummary?.weightDelta != null && selectedSummary.weightDelta < 0 ? "text-violet-600" : "text-orange-600")}>{selectedSummary?.weightDelta != null && selectedSummary.weightDelta < 0 ? <TrendingDown className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}{selectedSummary?.weightDelta != null ? deltaLabel(selectedSummary.weightDelta, "kg") : "—"}</p></div>
              <div className="rounded-2xl bg-muted p-4"><p className="text-sm text-muted-foreground">Zmiana talii</p><p className="text-2xl font-bold">{selectedSummary?.waistDelta != null ? deltaLabel(selectedSummary.waistDelta, "cm") : "—"}</p></div>
            </div>
            <WeightChart records={personRecords} />
          </CardContent></Card>
        </div>

        <Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" /> Historia pomiarów</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">{["Data", ...fields.map(([, label]) => label), "Akcje"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{isLoading ? <tr><td className="p-4" colSpan={9}>Ładowanie...</td></tr> : personRecords.length === 0 ? <tr><td className="p-4 text-muted-foreground" colSpan={9}>Brak pomiarów dla wybranej osoby.</td></tr> : personRecords.map((row) => <tr key={row.id} className="border-b last:border-0"><td className="p-2 font-medium">{row.date}</td>{fields.map(([key, , unit]) => <td key={key} className="p-2">{row[key] != null ? `${Number(row[key]).toFixed(1)} ${unit}` : "—"}</td>)}<td className="p-2"><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { setPerson(row.person); setEditingId(row.id); setEditingOriginal({ person: row.person, date: row.date }); setForm({ date: row.date, weight: row.weight != null ? String(row.weight) : "", waist: row.waist != null ? String(row.waist) : "", chest: row.chest != null ? String(row.chest) : "", arm: row.arm != null ? String(row.arm) : "", thigh: row.thigh != null ? String(row.thigh) : "", calf: row.calf != null ? String(row.calf) : "", hips: row.hips != null ? String(row.hips) : "" }); }}><Pencil className="h-4 w-4" /> Edytuj</Button><Button size="sm" variant="destructive" disabled={deleteMeasurement.isPending} onClick={() => deleteMeasurement.mutate(row.id)}><Trash2 className="h-4 w-4" /> Usuń</Button></div></td></tr>)}</tbody></table></div></CardContent></Card>
      </div>
    </Layout>
  );
}
