/**
 * VerticalDramaBreadcrumb (spec feature 131, section 03 · §8.1–8.3).
 *
 * Reversible Series › Episode › Storyboard Review trail rendered as a `nav`
 * landmark with an accessible name. Every ancestor crumb is a real link to its
 * route (so deep-linking into an episode / tab / run is reversible without the
 * browser back button) and the current node is marked `aria-current="page"`.
 */

import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VerticalDramaCrumb {
  /** Visible label (already localized by the caller). */
  label: string;
  /** Target route. Omit for the current (last) node. */
  href?: string;
}

interface VerticalDramaBreadcrumbProps {
  crumbs: VerticalDramaCrumb[];
  /** Accessible name for the nav landmark. */
  ariaLabel?: string;
  className?: string;
}

export function VerticalDramaBreadcrumb({
  crumbs,
  ariaLabel = "Vertical drama breadcrumb",
  className,
}: VerticalDramaBreadcrumbProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn("flex items-center text-sm text-muted-foreground", className)}
    >
      <ol className="flex flex-wrap items-center gap-1">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="rounded px-1 font-medium text-foreground/80 underline-offset-2 hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  aria-current="page"
                  className="px-1 font-semibold text-foreground"
                >
                  {crumb.label}
                </span>
              )}
              {!isLast && (
                <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 opacity-60" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default VerticalDramaBreadcrumb;
