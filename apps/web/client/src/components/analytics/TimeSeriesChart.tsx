import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface SeriesConfig {
  key: string;
  label: string;
  color: string;
}

interface TimeSeriesChartProps {
  data: Record<string, any>[];
  xKey: string;
  series: SeriesConfig[];
  height?: number;
}

/**
 * Lightweight bar chart using pure CSS (no Recharts dependency).
 * Each bar segment is stacked for multi-series data.
 */
export function TimeSeriesChart({
  data,
  xKey,
  series,
  height = 160,
}: TimeSeriesChartProps) {
  const maxVal = useMemo(() => {
    let max = 1;
    for (const row of data) {
      let sum = 0;
      for (const s of series) {
        sum += Number(row[s.key]) || 0;
      }
      if (sum > max) max = sum;
    }
    return max;
  }, [data, series]);

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground text-sm"
        style={{ height }}
      >
        No data for this period.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {series.map((s) => (
          <div key={s.key} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: s.color }} />
            {s.label}
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="flex items-end gap-1" style={{ height }}>
        {data.map((row, i) => {
          const xVal = String(row[xKey] || "");
          const shortDate = xVal.length >= 10 ? xVal.slice(5) : xVal;

          return (
            <div
              key={i}
              className="flex-1 flex flex-col justify-end items-center group relative"
            >
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 hidden group-hover:block bg-popover text-popover-foreground text-xs p-2 rounded shadow-lg z-10 whitespace-nowrap">
                <div className="font-medium">{shortDate}</div>
                {series.map((s) => (
                  <div key={s.key} style={{ color: s.color }}>
                    {s.label}: {(Number(row[s.key]) || 0).toLocaleString()}
                  </div>
                ))}
              </div>

              {/* Stacked bars (reverse order so first series is at bottom) */}
              {[...series].reverse().map((s) => {
                const val = Number(row[s.key]) || 0;
                const pct = (val / maxVal) * 100;
                return (
                  <div
                    key={s.key}
                    className="w-full min-h-[2px] rounded-t-sm"
                    style={{
                      height: `${pct}%`,
                      backgroundColor: s.color,
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
