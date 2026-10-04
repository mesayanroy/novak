import { Comparator, SOURCES, decodeFedRateSpec } from "@novak/sdk";
import type { Observation, ObserveContext, SourceAdapter } from "./types.js";

/** FRED's public CSV endpoint — no API key required. */
export const FRED_CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFEDTARU";

export type FetchCsv = (url: string) => Promise<string>;

export const fetchText: FetchCsv = async (url) => {
  const res = await fetch(url, { headers: { "user-agent": "novak-resolver/0.1" } });
  if (!res.ok) throw new Error(`FRED HTTP ${res.status}`);
  return res.text();
};

const dayString = (unix: bigint) => new Date(Number(unix) * 1000).toISOString().slice(0, 10);

/** Parses FRED's `observation_date,DFEDTARU` CSV into date -> upper bound in bps. */
export function parseFredTargets(csv: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of csv.trim().split(/\r?\n/).slice(1)) {
    const [date, value] = line.split(",");
    const pct = Number(value);
    if (date && Number.isFinite(pct)) out.set(date, Math.round(pct * 100));
  }
  return out;
}

/**
 * `macro.fomc.v1` (specVersion 2): "the federal funds target range's upper
 * bound on UTC day D is >= / <= X bps". A Fed decision is checked on the day
 * after the FOMC statement (e.g. D = Oct 29 for the Oct 27–28 meeting).
 *
 * Source: FRED series DFEDTARU (St. Louis Fed), public CSV, no key. Every
 * resolver reads the same published value for the same day, so the outcome is
 * deterministic; occurredAt = D. Abstains until FRED has published day D.
 */
export class FedRateAdapter implements SourceAdapter {
  readonly name = SOURCES.fedRate;

  constructor(private readonly fetchCsv: FetchCsv = fetchText) {}

  async observe(ctx: ObserveContext): Promise<Observation | null> {
    const spec = decodeFedRateSpec(ctx.spec.spec);
    let targets: Map<string, number>;
    try {
      targets = parseFredTargets(await this.fetchCsv(`${FRED_CSV_URL}&cosd=${dayString(spec.date - 7n * 86_400n)}`));
    } catch {
      return null; // source down — abstain
    }
    const day = dayString(spec.date);
    const upper = targets.get(day);
    if (upper === undefined) return null; // not published yet

    const outcome = spec.comparator === Comparator.Gte ? upper >= spec.upperBoundBps : upper <= spec.upperBoundBps;
    return {
      outcome,
      occurredAt: spec.date,
      rawEvidence: {
        source: FRED_CSV_URL,
        series: "DFEDTARU",
        day,
        upperBoundBps: upper,
        threshold: spec.upperBoundBps,
        comparator: spec.comparator === Comparator.Gte ? ">=" : "<=",
      },
    };
  }
}
