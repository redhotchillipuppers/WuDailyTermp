import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDailyHighPath,
  buildJsonlPath,
  calculateNextDelay,
  ensureOutputDir,
  getLocalDateString,
  readDailyHigh,
  selectLocation,
  sleep,
  writeDailyHigh,
} from "./utils.js";
import { CompositeEntry } from "./types.js";

const BASE_URL =
  "https://api.weather.com/v3/aggcommon/v3alertsHeadlines;v3-wx-observations-current;v3-location-point";

const DEFAULT_POLL_MINUTES = 10;
const DEFAULT_OUTPUT_DIR = "./data";
const DEFAULT_TARGET_ID = "51.50999832,-0.13";
const DEFAULT_TIMEZONE = "Europe/London";
const DEFAULT_FETCH_TIMEOUT_MS = 15000;

function getEnvVar(name: string, fallback?: string): string | undefined {
  const value = process.env[name];
  if (value && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
}

function getPollMinutes(): number {
  const raw = getEnvVar("POLL_MINUTES");
  if (!raw) {
    return DEFAULT_POLL_MINUTES;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_POLL_MINUTES;
}

function getFetchTimeoutMs(): number {
  const raw = getEnvVar("FETCH_TIMEOUT_MS");
  if (!raw) {
    return DEFAULT_FETCH_TIMEOUT_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FETCH_TIMEOUT_MS;
}

function buildUrl(): string {
  const apiKey = getEnvVar("WU_API_KEY");
  const geocodes = getEnvVar("WU_GEOCODES");
  if (!apiKey || !geocodes) {
    throw new Error("WU_API_KEY and WU_GEOCODES must be set");
  }

  const params = new URLSearchParams({
    apiKey,
    geocodes,
    units: "m",
    format: "json",
    language: "en-US",
  });

  return `${BASE_URL}?${params.toString()}`;
}

async function fetchWithRetry(
  url: string,
  attempts = 3,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS
): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`Weather.com error ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      console.error(`Fetch attempt ${attempt} failed`, error);
      const backoffMs = 500 * 2 ** (attempt - 1);
      await sleep(backoffMs);
    }
  }
  throw lastError;
}

async function logOnce(): Promise<void> {
  const outputDir = getEnvVar("OUTPUT_DIR", DEFAULT_OUTPUT_DIR) as string;
  const targetId = getEnvVar("TARGET_LOCATION_ID", DEFAULT_TARGET_ID) as string;
  const timeZone = getEnvVar("TIMEZONE", DEFAULT_TIMEZONE) as string;
  const fetchTimeoutMs = getFetchTimeoutMs();

  await ensureOutputDir(outputDir);

  let data: unknown;
  try {
    const url = buildUrl();
    console.log(`Fetching Weather.com composite data (timeout ${fetchTimeoutMs}ms)`);
    data = await fetchWithRetry(url, 3, fetchTimeoutMs);
  } catch (error) {
    console.error("Fetch failed", error);
    return;
  }

  if (!Array.isArray(data)) {
    console.error("Unexpected response shape: not an array");
    return;
  }

  const entry = selectLocation(data as CompositeEntry[], targetId);
  if (!entry) {
    console.error("Target location not found in response");
    return;
  }

  const location = entry["v3-location-point"]?.location;
  const observation = entry["v3-wx-observations-current"];

  if (!location || !observation) {
    console.error("Missing location or observation data");
    return;
  }

  const record = {
    ts_utc: new Date().toISOString(),
    id: entry.id ?? targetId,
    city: location.city ?? null,
    displayContext: location.displayContext ?? null,
    ianaTimeZone: location.ianaTimeZone ?? null,
    pwsId: location.pwsId ?? null,
    validTimeUtc: observation.validTimeUtc ?? null,
    validTimeLocal: observation.validTimeLocal ?? null,
    temperatureC: observation.temperature ?? null,
    temperatureMax24Hour: observation.temperatureMax24Hour ?? null,
    temperatureMin24Hour: observation.temperatureMin24Hour ?? null,
    relativeHumidity: observation.relativeHumidity ?? null,
    windSpeed: observation.windSpeed ?? null,
    windDirectionCardinal: observation.windDirectionCardinal ?? null,
    pressureMeanSeaLevel: observation.pressureMeanSeaLevel ?? null,
    wxPhraseLong: observation.wxPhraseLong ?? null,
  };

  const dateLocal = getLocalDateString(record.validTimeLocal ?? undefined, timeZone);
  const jsonlPath = buildJsonlPath(outputDir, dateLocal);
  await fs.appendFile(jsonlPath, `${JSON.stringify(record)}\n`);

  const dailyHighPath = buildDailyHighPath(outputDir, dateLocal);
  const dailyHigh = await readDailyHigh(dailyHighPath, dateLocal, timeZone);

  const temperatureC = record.temperatureC;
  const validTimeLocal = record.validTimeLocal;
  const updatedSamples = dailyHigh.samples + 1;

  let highTemperature = dailyHigh.high_temperatureC;
  let highAt = dailyHigh.high_at_validTimeLocal;

  if (typeof temperatureC === "number") {
    if (highTemperature === null || temperatureC > highTemperature) {
      highTemperature = temperatureC;
      highAt = validTimeLocal ?? highAt;
    }
  }

  const updatedDailyHigh = {
    date_local: dateLocal,
    timezone: timeZone,
    samples: updatedSamples,
    high_temperatureC: highTemperature,
    high_at_validTimeLocal: highAt ?? null,
    last_seen_temperatureC:
      typeof temperatureC === "number" ? temperatureC : null,
    last_seen_validTimeLocal: validTimeLocal ?? null,
  };

  await writeDailyHigh(dailyHighPath, updatedDailyHigh);
}

async function startLogger(): Promise<void> {
  const pollMinutes = getPollMinutes();
  const initialDelay = calculateNextDelay(pollMinutes);

  if (initialDelay > 0) {
    console.log(`Aligning first poll in ${Math.round(initialDelay / 1000)}s`);
    await sleep(initialDelay);
  }

  await logOnce();

  setInterval(() => {
    void logOnce();
  }, pollMinutes * 60 * 1000);
}

startLogger().catch((error) => {
  console.error("Logger failed", error);
  process.exitCode = 1;
});
