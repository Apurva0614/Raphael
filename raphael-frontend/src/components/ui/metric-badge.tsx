import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MetricBadgeProps {
  value: string | number;
  label?: string;
  trend?: "up" | "down" | "flat";
  tone?: "accent" | "danger" | "neutral";
  className?: string;
}

export function MetricBadge({ value, label, trend, tone = "neutral", className }: MetricBadgeProps) {
  const toneClass =
    tone === "accent"
      ? "border-[#4a7c59]/40 bg-[#1a2d1a] text-[var(--cream)]"
      : tone === "danger"
      ? "border-red-500/40 bg-red-950/30 text-red-200"
      : "border-[#1e2d1e] bg-[#111a11] text-[var(--cream)]";

  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const trendColor =
    trend === "up"
      ? tone === "danger"
        ? "text-red-300"
        : "text-[var(--olive)]"
      : trend === "down"
      ? "text-red-300"
      : "text-[var(--cream-muted)]/70";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] tracking-[0.12em]",
        toneClass,
        className,
      )}
    >
      <span className="font-semibold">{value}</span>
      {label && <span className="text-[var(--cream-muted)]/80 uppercase">{label}</span>}
      {trend && <TrendIcon className={cn("h-3 w-3", trendColor)} />}
    </span>
  );
}

export default MetricBadge;
