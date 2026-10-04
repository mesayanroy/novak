import { NextResponse } from "next/server";

/**
 * US policy rates for the feeds board and Fed-rate markets — both public,
 * no API keys:
 *  - FRED (St. Louis Fed) DFEDTARU / DFEDTARL: the fed funds TARGET RANGE,
 *    daily — the same series the `macro.fomc.v1` resolver adapter reads.
 *  - NY Fed: the EFFECTIVE fed funds rate (EFFR), latest print.
 * Cached 30 minutes.
 */
export const revalidate = 1800;

export async function GET() {
  const since = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
  const [fred, nyfed] = await Promise.allSettled([
    fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFEDTARU,DFEDTARL&cosd=${since}`, {
      next: { revalidate: 1800 },
    }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`FRED HTTP ${r.status}`)))),
    fetch("https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json", { next: { revalidate: 1800 } }).then(
      (r) => (r.ok ? r.json() : Promise.reject(new Error(`NY Fed HTTP ${r.status}`))),
    ),
  ]);

  let target: { date: string; upper: number; lower: number }[] = [];
  if (fred.status === "fulfilled") {
    target = fred.value
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map((l) => l.split(","))
      .filter(([, u, lo]) => Number.isFinite(Number(u)) && Number.isFinite(Number(lo)) && u !== "" && lo !== "")
      .map(([date, u, lo]) => ({ date, upper: Number(u), lower: Number(lo) }));
  }
  // Only the days the range changed, plus the latest — a compact decision history.
  const changes = target.filter((t, i) => i === 0 || t.upper !== target[i - 1].upper || t.lower !== target[i - 1].lower);
  const latest = target[target.length - 1] ?? null;

  let effr: { date: string; rate: number } | null = null;
  if (nyfed.status === "fulfilled") {
    const r = (nyfed.value as { refRates?: Array<{ effectiveDate: string; percentRate: number }> }).refRates?.[0];
    if (r) effr = { date: r.effectiveDate, rate: r.percentRate };
  }

  return NextResponse.json({
    fetchedAt: new Date().toISOString(),
    target: latest,
    decisions: changes.slice(-8),
    effr,
    sources: {
      target: "FRED DFEDTARU/DFEDTARL (St. Louis Fed)",
      effr: "Federal Reserve Bank of New York",
    },
    errors: [fred, nyfed].flatMap((r) => (r.status === "rejected" ? [(r.reason as Error).message] : [])),
  });
}
