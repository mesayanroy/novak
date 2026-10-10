/**
 * Candles and indicators from Chainlink rounds. Pure functions, no React.
 *
 * Chainlink publishes a round only when the price deviates past a threshold or
 * a heartbeat expires, so rounds are irregular. A candle here is every round
 * inside one interval: open = the previous candle's close (the price in force
 * when the interval began), high/low over the rounds, close = the last round.
 * Intervals with no round have no candle (the price did not change).
 */

export interface Round {
  price: number;
  updatedAt: number;
}

export interface Candle {
  time: number; // interval start, unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  rounds: number; // Chainlink rounds that landed in this interval
}

export function toCandles(rounds: Round[], intervalS: number): Candle[] {
  const sorted = [...rounds].filter((r) => r.updatedAt > 0 && Number.isFinite(r.price)).sort((a, b) => a.updatedAt - b.updatedAt);
  const out: Candle[] = [];
  let prevClose: number | undefined;
  for (const r of sorted) {
    const t = Math.floor(r.updatedAt / intervalS) * intervalS;
    const last = out[out.length - 1];
    if (last && last.time === t) {
      last.high = Math.max(last.high, r.price);
      last.low = Math.min(last.low, r.price);
      last.close = r.price;
      last.rounds++;
    } else {
      const open = prevClose ?? r.price;
      out.push({ time: t, open, high: Math.max(open, r.price), low: Math.min(open, r.price), close: r.price, rounds: 1 });
    }
    prevClose = r.price;
  }
  return out;
}

/** Simple moving average of closes; undefined until `n` values exist. */
export function sma(values: number[], n: number): (number | undefined)[] {
  let sum = 0;
  return values.map((v, i) => {
    sum += v;
    if (i >= n) sum -= values[i - n];
    return i >= n - 1 ? sum / n : undefined;
  });
}

/** Exponential moving average, seeded with the SMA of the first `n` values. */
export function ema(values: number[], n: number): (number | undefined)[] {
  const k = 2 / (n + 1);
  let prev: number | undefined;
  return values.map((v, i) => {
    if (i < n - 1) return undefined;
    if (prev === undefined) prev = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
    else prev = v * k + prev * (1 - k);
    return prev;
  });
}

/** Bollinger bands: SMA(n) ± mult × population stdev over the same window. */
export function bollinger(values: number[], n = 20, mult = 2) {
  const mid = sma(values, n);
  return values.map((_, i) => {
    const m = mid[i];
    if (m === undefined) return undefined;
    const w = values.slice(i - n + 1, i + 1);
    const sd = Math.sqrt(w.reduce((s, x) => s + (x - m) ** 2, 0) / n);
    return { upper: m + mult * sd, mid: m, lower: m - mult * sd };
  });
}

/** Wilder's RSI(n), 0–100. */
export function rsi(values: number[], n = 14): (number | undefined)[] {
  const out: (number | undefined)[] = values.map(() => undefined);
  if (values.length <= n) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= n;
  loss /= n;
  out[n] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

/** Decimals a price needs so its moves are visible: 2 for most stocks, more for small or slow-moving prices. */
export function pricePrecision(price: number, bond = false): number {
  if (bond) return 4;
  if (price < 1) return 5;
  if (price < 10) return 4;
  if (price < 1000) return 2;
  return 2;
}

/** The round in force `secondsAgo` before the latest one (for a 24h change). */
export function priceAgo(rounds: Round[], secondsAgo: number): number | undefined {
  if (!rounds.length) return undefined;
  const last = rounds[rounds.length - 1].updatedAt;
  let found: Round | undefined;
  for (const r of rounds) if (r.updatedAt <= last - secondsAgo) found = r;
  return found?.price;
}
