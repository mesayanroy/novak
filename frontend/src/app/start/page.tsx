"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, Code2, Gavel, Rocket } from "lucide-react";
import { SetupChecklist } from "@/components/onboarding/SetupChecklist";
import { DotPattern } from "@/registry/magicui/dot-pattern";

const NEXT = [
  { href: "/markets", icon: BarChart3, title: "Trade where a price lands", body: "Range markets on NVDA, TSLA and the SGOV tokenized Treasury, priced by an LMSR market maker on live Chainlink data." },
  { href: "/disputes", icon: Gavel, title: "Challenge an outcome", body: "Think a resolved fact is wrong? Post a bond and a committee of resolvers re-checks the source. 66% decides." },
  { href: "/build", icon: Code2, title: "Plug Novak into your market", body: "Design an event, copy the generated SDK and Solidity code, and settle your own AMM on Novak's dispute layer." },
];

export default function StartPage() {
  return (
    <main className="relative overflow-x-clip pb-20">
      <section className="relative overflow-hidden border-b border-violet-100 bg-gradient-to-br from-white via-violet-50/60 to-white">
        <DotPattern width={22} height={22} cr={1.1} className="text-violet-300/50 [mask-image:radial-gradient(ellipse_60%_80%_at_80%_30%,white,transparent)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-12">
          <p className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wide text-violet-600">
            <Rocket className="h-4 w-4" /> Welcome to Novak
          </p>
          <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-ink sm:text-5xl">Trade real-world facts about tokenized stocks.</h1>
          <p className="mt-4 max-w-2xl text-lg text-gray-700">
            Everything runs on Robinhood Chain testnet with free test money. Six quick steps and you&apos;re trading — each one
            checks itself off as you go.
          </p>
        </div>
      </section>

      <div className="mx-auto mt-8 grid max-w-6xl gap-6 px-6 lg:grid-cols-[1.25fr_1fr]">
        <SetupChecklist variant="page" />
        <aside className="flex flex-col gap-3">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-gray-500">Then</p>
          {NEXT.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="link-plain group rounded-2xl border border-gray-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-[0_14px_36px_-24px_rgba(109,74,255,0.7)]"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                  <n.icon className="h-4 w-4" />
                </span>
                <ArrowRight className="h-4 w-4 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-violet-600" />
              </div>
              <p className="mt-3 font-semibold text-ink group-hover:text-violet-700">{n.title}</p>
              <p className="mt-1 text-sm text-gray-600">{n.body}</p>
            </Link>
          ))}
        </aside>
      </div>
    </main>
  );
}
