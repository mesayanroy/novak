import type { MarketCategory } from "@/lib/novak";

const STYLE: Record<MarketCategory, string> = {
  stocks: "from-violet-600 to-indigo-500",
  bonds: "from-emerald-500 to-teal-500",
  crypto: "from-amber-500 to-orange-500",
  macro: "from-sky-600 to-blue-500",
  corporate: "from-fuchsia-600 to-violet-500",
  trading: "from-rose-500 to-pink-500",
  other: "from-gray-500 to-gray-400",
};

/** Square brand tiles in public/logos/ (256px WebP, full-bleed backgrounds). */
const LOGOS: Record<string, string> = {
  BTC: "/logos/btc.webp",
  "BTC.B": "/logos/btc.webp",
  ETH: "/logos/eth.webp",
  EURC: "/logos/eurc.webp",
  NVDA: "/logos/nvda.webp",
  SGOV: "/logos/sgov.webp",
  TSLA: "/logos/tsla.webp",
};

export const logoFor = (ticker?: string) => (ticker ? LOGOS[ticker.toUpperCase()] : undefined);

/**
 * The asset's logo, filling a rounded tile edge to edge; tickers without a
 * logo get a gradient tile with the ticker instead.
 */
export function AssetIcon({
  ticker,
  category = "other",
  size = 48,
  className = "",
  round = false,
}: {
  ticker?: string;
  category?: MarketCategory;
  size?: number;
  className?: string;
  round?: boolean;
}) {
  const logo = logoFor(ticker);
  const radius = round ? size / 2 : Math.max(6, Math.round(size * 0.28));
  if (logo) {
    return (
      <div
        className={`relative flex-none overflow-hidden bg-white shadow-sm ring-1 ring-black/5 ${className}`}
        style={{ width: size, height: size, borderRadius: radius }}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static tile; next/image adds nothing here */}
        <img src={logo} alt="" width={size} height={size} className="h-full w-full object-cover" draggable={false} />
      </div>
    );
  }
  const label = ticker === "FED" ? "Fed" : (ticker ?? "?").slice(0, 4);
  return (
    <div
      className={`flex flex-none items-center justify-center bg-gradient-to-br ${STYLE[category]} font-bold text-white shadow-sm ${className}`}
      style={{ width: size, height: size, borderRadius: radius, fontSize: label.length > 3 ? size * 0.24 : size * 0.3 }}
      aria-hidden
    >
      {label}
    </div>
  );
}

/** One logo, or two overlapping ones for a market on two assets (e.g. NVDA AND TSLA). */
export function AssetStack({ tickers, category, size = 48 }: { tickers: string[]; category?: MarketCategory; size?: number }) {
  if (tickers.length < 2) return <AssetIcon ticker={tickers[0]} category={category} size={size} />;
  const small = Math.round(size * 0.72);
  return (
    <div className="relative flex-none" style={{ width: size, height: size }} aria-hidden>
      <div className="absolute left-0 top-0">
        <AssetIcon ticker={tickers[0]} category={category} size={small} />
      </div>
      <div className="absolute bottom-0 right-0 rounded-[30%] ring-2 ring-white">
        <AssetIcon ticker={tickers[1]} category={category} size={small} />
      </div>
    </div>
  );
}

/**
 * Small "this page is about X" badge for a market's header corner: the logo
 * plus the ticker.
 */
export function AssetBadge({
  ticker,
  tickers,
  category,
  name,
}: {
  ticker?: string;
  tickers?: string[];
  category?: MarketCategory;
  name?: string;
}) {
  const list = tickers?.length ? tickers : ticker ? [ticker] : [];
  if (!list.length) return null;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-violet-100 bg-white/90 py-1 pl-1 pr-3 shadow-[0_4px_16px_-6px_rgba(124,92,255,0.35)] backdrop-blur">
      <div className="flex -space-x-1.5">
        {list.slice(0, 3).map((t) => (
          <AssetIcon key={t} ticker={t} category={category} size={26} className="ring-2 !ring-white" />
        ))}
      </div>
      <span className="font-mono text-xs font-semibold text-ink">{list.map((t) => (t === "FED" ? "Fed" : t)).join(" · ")}</span>
      {name && list.length === 1 && <span className="hidden text-xs text-gray-500 sm:inline">{name}</span>}
    </div>
  );
}
