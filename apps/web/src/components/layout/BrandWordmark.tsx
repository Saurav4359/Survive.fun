import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

/** Matches UI accent `--accent` (#8aff8e); keeps “Survive” white for contrast on black. */
export function BrandWordmark({ className }: Props) {
  return (
    <span
      className={cn(
        "font-display font-bold tracking-tight text-white",
        className,
      )}
    >
      Survive<span className="text-accent">.fun</span>
    </span>
  );
}
