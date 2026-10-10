"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Gavel, Plus, ShieldAlert, Trophy, Users, X } from "lucide-react";
import { useNovakClient } from "@/lib/novak";
import { useTx } from "@/lib/useTx";
import { COMMUNITY_CATEGORIES, communityEnabled, type CommunityCategory } from "@/lib/community";
import { ConnectButton } from "@/components/ConnectButton";
import { cn } from "@/lib/utils";

/**
 * "Community challenge" template: a creator-resolved prediction pool on
 * anything — a football match, a bet between friends. Presets fill in the
 * outcomes; everything stays editable.
 */

type Preset = "winner" | "margin" | "goals" | "yesno" | "custom";
const PRESETS: { k: Preset; label: string; hint: string }[] = [
  { k: "winner", label: "Match winner", hint: "A · Draw · B" },
  { k: "margin", label: "Winning margin", hint: "A by 2+ … B by 2+" },
  { k: "goals", label: "Total goals", hint: "0–1 · 2–3 · 4+" },
  { k: "yesno", label: "Yes / No", hint: "any question" },
  { k: "custom", label: "Custom", hint: "2–8 outcomes" },
];

const WINDOWS = [
  { s: 1800, label: "30 min" },
  { s: 3600, label: "1 hour" },
  { s: 6 * 3600, label: "6 hours" },
  { s: 86_400, label: "24 hours" },
];

const HOUR = 3600;
const nowS = () => Math.floor(Date.now() / 1000);
const toLocal = (unix: number) => {
  const d = new Date(unix * 1000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const fromLocal = (s: string) => Math.floor(new Date(s).getTime() / 1000);

function presetOutcomes(p: Preset, a: string, b: string): string[] {
  const A = a.trim() || "Side A";
  const B = b.trim() || "Side B";
  if (p === "winner") return [`${A} wins`, "Draw", `${B} wins`];
  if (p === "margin") return [`${A} by 2+`, `${A} by 1`, "Draw", `${B} by 1`, `${B} by 2+`];
  if (p === "goals") return ["0–1 goals", "2–3 goals", "4+ goals"];
  if (p === "yesno") return ["Yes", "No"];
  return ["", ""];
}

function presetQuestion(p: Preset, a: string, b: string, cat: CommunityCategory): string {
  const A = a.trim() || "Side A";
  const B = b.trim() || "Side B";
  if (p === "winner") return `${A} vs ${B}: who wins?`;
  if (p === "margin") return `${A} vs ${B}: by how much?`;
  if (p === "goals") return `${A} vs ${B}: how many ${cat === "Football" ? "goals" : "points"} in total?`;
  return "";
}

const input = "h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100";
const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="mb-1 block font-mono text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">{children}</span>
);

export function CommunityTemplate() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const client = useNovakClient();
  const { run, pending, error } = useTx();

  const [category, setCategory] = useState<CommunityCategory>("Football");
  const [preset, setPreset] = useState<Preset>("winner");
  const [a, setA] = useState("Real Madrid");
  const [b, setB] = useState("Barcelona");
  const [question, setQuestion] = useState<string | null>(null);
  const [custom, setCustom] = useState<string[] | null>(null);
  const [closes, setCloses] = useState(() => toLocal(nowS() + 2 * HOUR));
  const [resolveH, setResolveH] = useState(24);
  const [windowS, setWindowS] = useState(3600);
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("Official full-time result (90 min + stoppage time).");

  const matchy = preset === "winner" || preset === "margin" || preset === "goals";
  const outcomes = custom ?? presetOutcomes(preset, a, b);
  const q = question ?? presetQuestion(preset, a, b, category);
  const closesAt = fromLocal(closes);
  const resolveBy = closesAt + resolveH * HOUR;
  const rules = `[${category}] ${notes.trim()}${source.trim() ? ` Source: ${source.trim()}` : ""}`.slice(0, 1000);

  const problems = useMemo(() => {
    const p: string[] = [];
    if (!q.trim()) p.push("Write the question.");
    if (q.length > 280) p.push("Question is over 280 characters.");
    const filled = outcomes.map((o) => o.trim());
    if (filled.length < 2 || filled.some((o) => !o)) p.push("Every outcome needs a name (at least two).");
    if (new Set(filled.map((o) => o.toLowerCase())).size !== filled.length) p.push("Outcomes must be different.");
    if (filled.some((o) => o.length > 64)) p.push("Keep outcome names under 64 characters.");
    if (!(closesAt > nowS() + 60)) p.push("Staking must close in the future.");
    return p;
  }, [q, outcomes, closesAt]);

  const pickPreset = (k: Preset) => {
    setPreset(k);
    setQuestion(null);
    setCustom(k === "custom" ? ["", ""] : null);
  };
  const editOutcome = (i: number, v: string) => setCustom(outcomes.map((o, j) => (j === i ? v : o)));

  const create = () =>
    client &&
    address &&
    run("Creating your market", async (wait) => {
      const tx = await client.createCommunityMarket(
        { question: q.trim(), outcomes: outcomes.map((o) => o.trim()), closesAt: BigInt(closesAt), resolveBy: BigInt(resolveBy), objectionWindowSeconds: BigInt(windowS), rules },
        address,
      );
      await wait(tx);
      router.push(`/markets/c/${await client.getCreatedCommunityMarketId(tx)}`);
    });

  if (!communityEnabled) return <p className="text-sm text-gray-500">Community markets aren&apos;t deployed on this chain yet.</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* form */}
      <div className="flex flex-col gap-5">
        <div>
          <Label>Category</Label>
          <div className="flex flex-wrap gap-1.5">
            {COMMUNITY_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={cn("rounded-full border px-3 py-1 text-xs font-medium", category === c ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-400")}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>Market type</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {PRESETS.map((p) => (
              <button
                key={p.k}
                type="button"
                onClick={() => pickPreset(p.k)}
                className={cn("rounded-xl border p-2.5 text-left transition", preset === p.k ? "border-violet-500 bg-violet-50 ring-1 ring-violet-500" : "border-gray-200 bg-white hover:border-violet-300")}
              >
                <span className="block text-[13px] font-semibold text-ink">{p.label}</span>
                <span className="block font-mono text-[10px] text-gray-500">{p.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {matchy && (
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <label>
              <Label>Side A</Label>
              <input className={input} value={a} onChange={(e) => setA(e.target.value)} maxLength={40} />
            </label>
            <span className="pb-2.5 font-mono text-xs font-bold text-gray-400">VS</span>
            <label>
              <Label>Side B</Label>
              <input className={input} value={b} onChange={(e) => setB(e.target.value)} maxLength={40} />
            </label>
          </div>
        )}

        <label>
          <Label>Question</Label>
          <input className={input} value={q} placeholder={preset === "yesno" ? "Will we finish the marathon under 4 hours?" : "Ask anything"} onChange={(e) => setQuestion(e.target.value)} maxLength={280} />
        </label>

        <div>
          <Label>Outcomes ({outcomes.length})</Label>
          <div className="flex flex-col gap-1.5">
            {outcomes.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-gray-100 font-mono text-[11px] font-bold text-gray-600">{i + 1}</span>
                <input className={input} value={o} placeholder={`Outcome ${i + 1}`} onChange={(e) => editOutcome(i, e.target.value)} maxLength={64} />
                {outcomes.length > 2 && (
                  <button type="button" aria-label="Remove outcome" onClick={() => setCustom(outcomes.filter((_, j) => j !== i))} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {outcomes.length < 8 && (
              <button type="button" onClick={() => setCustom([...outcomes, ""])} className="inline-flex w-fit items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-50">
                <Plus className="h-3.5 w-3.5" /> Add outcome
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label>
            <Label>Staking closes</Label>
            <input type="datetime-local" className={input} value={closes} onChange={(e) => setCloses(e.target.value)} />
          </label>
          <label>
            <Label>You resolve within</Label>
            <select className={input} value={resolveH} onChange={(e) => setResolveH(Number(e.target.value))}>
              {[6, 12, 24, 48, 72, 168].map((h) => (
                <option key={h} value={h}>
                  {h < 24 ? `${h} hours` : `${h / 24} day${h > 24 ? "s" : ""}`} after close
                </option>
              ))}
            </select>
          </label>
          <label>
            <Label>Objection window</Label>
            <select className={input} value={windowS} onChange={(e) => setWindowS(Number(e.target.value))}>
              {WINDOWS.map((w) => (
                <option key={w.s} value={w.s}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
          <label>
            <Label>How you&apos;ll decide</Label>
            <input className={input} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </label>
          <label>
            <Label>Result source (optional)</Label>
            <input className={input} value={source} placeholder="https://… official result page" onChange={(e) => setSource(e.target.value)} maxLength={300} />
          </label>
        </div>
      </div>

      {/* preview + rules + create */}
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_12px_36px_-26px_rgba(17,17,17,0.45)]">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-gray-900 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-white">{category}</span>
            <span className="font-mono text-[10px] text-gray-400">preview</span>
          </div>
          <p className="mt-3 text-lg font-semibold leading-snug text-ink">{q || "Your question"}</p>
          <div className="mt-4 grid gap-1.5">
            {outcomes.map((o, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2 text-sm">
                <span className="truncate font-medium text-gray-800">{o || `Outcome ${i + 1}`}</span>
                <span className="font-mono text-xs text-gray-400">{Math.round(100 / outcomes.length)}%</span>
              </div>
            ))}
          </div>
          <p className="mt-3 font-mono text-[11px] text-gray-500">
            Closes {Number.isFinite(closesAt) ? new Date(closesAt * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—"} · result by{" "}
            {Number.isFinite(resolveBy) ? new Date(resolveBy * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—"}
          </p>
        </div>

        <ul className="space-y-2 rounded-2xl border border-violet-100 bg-violet-50/50 p-4 text-[12.5px] leading-relaxed text-gray-700">
          <li className="flex gap-2">
            <Users className="mt-0.5 h-4 w-4 flex-none text-violet-600" />
            <span>
              Players stake USDG on an outcome until staking closes. Winners split the <strong>whole pool</strong> in proportion to their stake.
            </span>
          </li>
          <li className="flex gap-2">
            <Gavel className="mt-0.5 h-4 w-4 flex-none text-violet-600" />
            <span>
              <strong>You are the resolver.</strong> After the match, declare the result from the market page.
            </span>
          </li>
          <li className="flex gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 flex-none text-violet-600" />
            <span>
              During the objection window, if players holding over a third of the pool object, the market is voided and everyone is
              refunded. Miss your deadline and anyone can void it too.
            </span>
          </li>
          <li className="flex gap-2">
            <Trophy className="mt-0.5 h-4 w-4 flex-none text-violet-600" />
            <span>No fees. If nobody backed the result you declare, everyone gets their stake back.</span>
          </li>
        </ul>

        {problems.length > 0 && <p className="text-xs text-rose-700">{problems[0]}</p>}
        {!isConnected ? (
          <ConnectButton />
        ) : (
          <button
            type="button"
            disabled={Boolean(pending) || problems.length > 0}
            onClick={create}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gray-900 px-6 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-40"
          >
            {pending ?? "Create community market"}
          </button>
        )}
        {error && <p className="font-mono text-[11px] text-rose-700">{error}</p>}
      </div>
    </div>
  );
}
