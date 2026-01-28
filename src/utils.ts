import fs from "node:fs/promises";
import path from "node:path";
import { CompositeEntry, DailyHighRecord } from "./types.js";

export async function ensureOutputDir(outputDir: string): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });
}

export function selectLocation(
  entries: CompositeEntry[],
  targetId: string
): CompositeEntry | null {
  const directMatch = entries.find((entry) => entry.id === targetId);
  if (directMatch) {
    return directMatch;
  }

  return (
    entries.find((entry) => {
      const location = entry["v3-location-point"]?.location;
      return (
        location?.city === "London" && location?.countryCode === "GB"
      );
    }) ?? null
  );
}

function formatDateParts(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

export function getLocalDateString(
  validTimeLocal: string | undefined,
  timeZone: string
): string {
  const date = validTimeLocal ? new Date(validTimeLocal) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return formatDateParts(safeDate, timeZone);
}

export function buildJsonlPath(outputDir: string, dateLocal: string): string {
  return path.join(outputDir, `wu_current_london_${dateLocal}.jsonl`);
}

export function buildDailyHighPath(outputDir: string, dateLocal: string): string {
  return path.join(outputDir, `wu_daily_high_${dateLocal}.json`);
}

export async function readDailyHigh(
  filePath: string,
  dateLocal: string,
  timeZone: string
): Promise<DailyHighRecord> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as DailyHighRecord;
    return {
      date_local: parsed.date_local ?? dateLocal,
      timezone: parsed.timezone ?? timeZone,
      samples: parsed.samples ?? 0,
      high_temperatureC:
        typeof parsed.high_temperatureC === "number"
          ? parsed.high_temperatureC
          : null,
      high_at_validTimeLocal: parsed.high_at_validTimeLocal ?? null,
      last_seen_temperatureC:
        typeof parsed.last_seen_temperatureC === "number"
          ? parsed.last_seen_temperatureC
          : null,
      last_seen_validTimeLocal: parsed.last_seen_validTimeLocal ?? null,
    };
  } catch {
    return {
      date_local: dateLocal,
      timezone: timeZone,
      samples: 0,
      high_temperatureC: null,
      high_at_validTimeLocal: null,
      last_seen_temperatureC: null,
      last_seen_validTimeLocal: null,
    };
  }
}

export async function writeDailyHigh(
  filePath: string,
  record: DailyHighRecord
): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(record, null, 2));
}

export function calculateNextDelay(intervalMinutes: number): number {
  const intervalMs = intervalMinutes * 60 * 1000;
  const now = Date.now();
  const next = Math.ceil(now / intervalMs) * intervalMs;
  return Math.max(next - now, 0);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
