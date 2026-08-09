import * as React from "react";
import { cn } from "@/lib/utils";

export interface RaphaelCardProps extends React.HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
}

export const RaphaelCard = React.forwardRef<HTMLDivElement, RaphaelCardProps>(
  ({ className, padded = true, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border border-[#1e2d1e] bg-[#111a11] text-[var(--cream)] shadow-[0_1px_0_rgba(255,255,255,0.02),0_8px_24px_-12px_rgba(0,0,0,0.6)]",
        padded && "p-5",
        className,
      )}
      {...props}
    />
  ),
);
RaphaelCard.displayName = "RaphaelCard";

export default RaphaelCard;
