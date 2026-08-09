import * as React from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "green" | "amber" | "red" | "muted";

export interface StatusDotProps {
  tone?: StatusTone;
  label?: string;
  pulse?: boolean;
  className?: string;
}

const TONE: Record<StatusTone, string> = {
  green: "#4a7c59",
  amber: "#d4a853",
  red: "#c45e3a",
  muted: "#555c55",
};

export function StatusDot({ tone = "green", label, pulse = true, className }: StatusDotProps) {
  const color = TONE[tone];
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn("h-2 w-2 rounded-full", pulse && tone !== "muted" && "status-pulse")}
        style={{ background: color, color, boxShadow: `0 0 8px ${color}80` }}
      />
      {label && (
        <span
          className="font-mono text-[10px] tracking-[0.22em] uppercase"
          style={{ color }}
        >
          {label}
        </span>
      )}
    </span>
  );
}

export default StatusDot;
