import type { LucideIcon } from "lucide-react";
import Link from "next/link";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; href?: string; onClick?: () => void };
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className="card-cyber flex flex-col items-center justify-center px-6 py-14 text-center sm:py-16"
    >
      {Icon ? (
        <Icon
          className="mb-4 h-12 w-12 text-muted"
          strokeWidth={1.25}
          aria-hidden
        />
      ) : null}
      <p className="font-display text-lg font-semibold text-foreground sm:text-xl">
        {title}
      </p>
      {description ? (
        <p className="mt-2 max-w-md font-mono text-sm text-muted">
          {description}
        </p>
      ) : null}
      {action ? (
        action.href ? (
          <Link
            href={action.href}
            className="mt-6 inline-flex items-center justify-center rounded-lg border border-accent bg-accent px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-ink transition-all duration-200 hover:border-accent-bright hover:bg-transparent hover:text-accent-bright"
          >
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-6 inline-flex items-center justify-center rounded-lg border border-accent bg-accent px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest text-ink transition-all duration-200 hover:border-accent-bright hover:bg-transparent hover:text-accent-bright"
          >
            {action.label}
          </button>
        )
      ) : null}
    </div>
  );
}
