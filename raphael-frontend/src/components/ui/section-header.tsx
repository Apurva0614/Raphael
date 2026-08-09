import * as React from "react";
import { cn } from "@/lib/utils";

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function SectionHeader({ title, subtitle, actions, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-end justify-between gap-4 pb-3", className)}>
      <div>
        <h3
          className="text-[var(--cream)] tracking-wide"
          style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", fontWeight: 600 }}
        >
          {title}
        </h3>
        {subtitle && (
          <p className="mt-1 font-mono text-[10px] tracking-[0.22em] uppercase text-[var(--cream-muted)]/80">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export default SectionHeader;
