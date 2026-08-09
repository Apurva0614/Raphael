import SectionHeader from "@/components/ui/section-header";
import RaphaelCard from "@/components/ui/raphael-card";

export function PlaceholderView({ name, code }: { name: string; code: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-10">
      <RaphaelCard className="w-full max-w-xl text-center" padded>
        <SectionHeader
          title={name}
          subtitle={`MODULE · ${code}`}
          className="justify-center pb-4"
        />
        <p className="font-mono text-[11px] tracking-[0.22em] uppercase text-[var(--cream-muted)]">
          View loads here
        </p>
        <div className="mx-auto mt-6 h-px w-20 bg-[var(--olive)]/40" />
        <p className="mt-6 text-sm text-[var(--cream)]/70">
          This panel will host the {name.toLowerCase()} surface in the next build session.
        </p>
      </RaphaelCard>
    </div>
  );
}

export default PlaceholderView;
