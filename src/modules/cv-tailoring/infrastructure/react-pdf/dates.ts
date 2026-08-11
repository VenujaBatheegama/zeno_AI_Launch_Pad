const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Convert YYYY or YYYY-MM into human-readable CV dates. */
export function formatHumanDate(value?: string | null): string {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  const match = raw.match(/^(\d{4})(?:-(\d{2}))?$/u);
  if (!match) return raw;
  const year = match[1]!;
  const month = match[2] ? Number(match[2]) : null;
  if (month && month >= 1 && month <= 12) {
    return `${MONTHS[month - 1]} ${year}`;
  }
  return year;
}

export function formatDateRange(
  start?: string | null,
  end?: string | null,
  isCurrent?: boolean,
): string {
  const left = formatHumanDate(start);
  let right = "";
  if (isCurrent === true) {
    right = "Present";
  } else if (end?.trim()) {
    right = formatHumanDate(end);
  } else if (isCurrent === undefined && left) {
    right = "Present";
  }
  if (!left && !right) return "";
  if (left && right) return `${left} - ${right}`;
  return left || right;
}
