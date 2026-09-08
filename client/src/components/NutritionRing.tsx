import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

interface NutritionRingProps {
  current: number;
  target: number;
  label: string;
  color: string;
  unit: string;
}

export function NutritionRing({ current, target, label, color, unit }: NutritionRingProps) {
  const percentage = Math.min(100, (current / target) * 100);
  const remaining = Math.max(0, target - current);

  const data = [
    { name: "Consumed", value: current },
    { name: "Remaining", value: remaining },
  ];

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-white/50 rounded-2xl border border-white/20 shadow-sm">
      <div className="h-24 w-24 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={32}
              outerRadius={40}
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              stroke="none"
            >
              <Cell fill={color} />
              <Cell fill="hsl(var(--muted))" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-lg font-bold font-display leading-none">{Math.round(current)}</span>
          <span className="text-[10px] text-muted-foreground">{Math.round(percentage)}%</span>
        </div>
      </div>
      <div className="text-center mt-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-xs text-muted-foreground/70">Target: {target}{unit}</p>
      </div>
    </div>
  );
}
