export type CalendarEvent = {
  uid: string;
  title: string;
  description: string;
  start: string;
  end?: string;
  url?: string;
};

export function buildGrowthCalendarIcs(input: {
  calendarName: string;
  events: CalendarEvent[];
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Zeno//Growth//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(input.calendarName)}`,
  ];
  for (const event of input.events) {
    const stamp = toIcsStamp(new Date().toISOString());
    const start = toIcsDate(event.start);
    const end = toIcsDate(event.end ?? event.start);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(event.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      `DESCRIPTION:${escapeIcsText(event.description)}`,
    );
    if (event.url) lines.push(`URL:${escapeIcsText(event.url)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

export function escapeIcsText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\n", "\\n");
}

function toIcsDate(value: string): string {
  const date = value.slice(0, 10).replaceAll("-", "");
  if (!/^\d{8}$/.test(date)) {
    return new Date(value).toISOString().slice(0, 10).replaceAll("-", "");
  }
  return date;
}

function toIcsStamp(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let remaining = line;
  chunks.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length > 0) {
    chunks.push(` ${remaining.slice(0, 74)}`);
    remaining = remaining.slice(74);
  }
  return chunks.join("\r\n");
}
