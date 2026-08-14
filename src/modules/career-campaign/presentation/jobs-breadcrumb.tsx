import Link from "next/link";

export function JobsBreadcrumb(props: { items: Array<{ href?: string; label: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--zeno-ink-muted)]">
        {props.items.map((item, index) => {
          const last = index === props.items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {index > 0 ? <span aria-hidden>/</span> : null}
              {item.href && !last ? (
                <Link href={item.href} className="hover:text-[var(--zeno-ink)] hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span className={last ? "font-medium text-[var(--zeno-ink)]" : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
