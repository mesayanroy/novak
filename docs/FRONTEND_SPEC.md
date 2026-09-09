# Novak Frontend — Status & Context (living document)

Dense, bullet-only status doc for whichever LLM session picks up
`frontend/` next. Mirrors `CLAUDE.md`/`SPEC_AND_TASKS.md`'s style — no
narrative, optimized to parse cheaply. This describes what was actually
shipped in this pass, not what was planned; re-read it against the code
before trusting a line.

## Scope note: extended, not created

`frontend/` already existed before this pass (a minimal 1-page, 4-component
wagmi scaffold, dark-slate-themed). This pass **extended it in place** —
same package name (`novak-frontend`), same workspace slot — rather than
creating a second `frontend/`-like workspace, since one already existed.

## Stack (exact)

- Next.js `14.2.15`, App Router, TypeScript, React `18.3.1`.
- `wagmi@2.19.5` + `viem@2.56.3` (bumped from the prior `^2.12.0`/`^2.21.0`
  ranges by normal dependency resolution when RainbowKit was added — still
  within the original semver ranges, not a deliberate upgrade).
- `@rainbow-me/rainbowkit@2.2.11` — wallet connection.
  `getDefaultConfig()` in `src/lib/wagmi.ts` wires RainbowKit's default
  connector set (injected/MetaMask, WalletConnect, Coinbase Wallet, Rainbow
  Wallet, + a few more RainbowKit ships by default).
- `@tanstack/react-query@5.102.8` (unchanged provider pattern).
- shadcn/ui **primitives are hand-authored**, not CLI-generated — no network
  call to the shadcn registry was made; `components.json` exists for future
  `npx shadcn add` calls but nothing has been added through it yet. Files:
  `src/components/ui/{button,card,tabs,dialog,sheet,table,badge,tooltip,separator,input}.tsx`.
  Radix deps installed: `@radix-ui/react-{tabs,dialog,tooltip,separator,slot}`.
  Styling deps: `class-variance-authority`, `clsx`, `tailwind-merge`.
- `geist` npm package (Vercel's own Geist Sans / Geist Mono), loaded via
  `next/font` in `src/app/layout.tsx` as CSS variables
  (`--font-geist-sans`, `--font-geist-mono`), consumed by
  `tailwind.config.ts`'s `fontFamily`.
- `lucide-react` — generic UI icons only (menu/close/copy/check in nav and
  code blocks). Every protocol-status glyph (event/dispute/composite state)
  is a hand-drawn inline SVG in `StatusPill.tsx`, not a lucide icon — kept
  deliberately distinct so status glyphs form one consistent custom set.
- `@novak/sdk: workspace:*` — unchanged, real dependency, used throughout.

## Design tokens (exact)

Strict black/white/gray. **No accent hue anywhere**, including focus rings,
hover states, and shadcn's usual `--primary`/`--destructive` tokens — those
were never introduced; every component uses `ink`/`paper`/`gray-*` directly.

- Colors (`tailwind.config.ts theme.extend.colors`):
  `ink #0A0908` (near-black, barely warm), `paper #FDFDFC` (near-white,
  barely warm), `gray.50 #F7F6F5` → `gray.900 #171512` (10-step ramp, same
  warm-neutral tone throughout).
- Fonts: `font-sans` → Geist (`var(--font-geist-sans)`), `font-mono` →
  Geist Mono (`var(--font-geist-mono)`). Mono is used for every hash,
  address, event ID, status label, and code block — never for prose.
- Type scale: custom `fontSize` in `tailwind.config.ts`, `xs` (0.75rem) →
  `5xl` (4rem), line-heights 1.05–1.6 (tighter at large display sizes).
- Radii: `sm` 2px, `DEFAULT` 4px, `md` 6px, `lg` 8px — deliberately modest,
  not the rounded-pill shadcn default.
- Selection color: `::selection` is `bg-ink text-paper` (a black selection
  highlight, since no accent color exists to use for it).
- RainbowKit's connect modal is re-themed via `lightTheme({accentColor:
  "#0A0908", accentColorForeground: "#FDFDFC", borderRadius: "small"})` in
  `src/app/providers.tsx` — its own "accent" concept is pinned to black, not
  RainbowKit's default blue. The header's actual Connect button
  (`src/components/ConnectButton.tsx`) bypasses RainbowKit's default pill
  UI entirely via `ConnectButton.Custom`, rendering our own `<Button>`.

## Route map

| Route | Purpose |
|---|---|
| `/` | Landing: hero, "price vs. composable-event" thesis, 5-layer diagram, honest positioning paragraph (no comparison table — that detail lives in docs) |
| `/docs` | Docs hub layout (persistent sidebar, `Sheet` drawer on mobile) + introduction/protocol overview index page |
| `/docs/architecture` | 5-layer breakdown, more detail per layer than the landing version |
| `/docs/lifecycle` | Full Create→Open→…→Disputed→Tier-1→Tier-2→Finalized/Voided/Expired diagram, built from real `StatusPill`s |
| `/docs/composition` | AND/OR/NOT/BEFORE/WITHIN table + example; `K_OF_N` shown as "coming soon", not documented as live |
| `/docs/disputes` | Every `DisputeManager.sol` constant (bonds, committee sizes, windows, 66% bar), bond-accounting rules, VOID-as-hard-floor, stated limitations |
| `/docs/api` | REST-style reference for 7 endpoints, each method-badge + params table + JSON example + curl/TS tabs. Banner at top: "on-chain reference, not a live REST API" |
| `/docs/sdk` | Install/quickstart + full `NovakClient` method table (implemented vs. "coming soon" resolver/dispute-write methods) |
| `/docs/threat-model` | Condensed cycle-impossibility proof + terminal-state propagation table, links to `docs/threat-model.md` |
| `/docs/faq` | 5 FAQ entries addressing the honesty caveats above |
| `/markets` | Market list (mock — see Live/mock map) + a collapsed "Create a market (advanced)" dev utility |
| `/markets/[id]` | Market detail: composition tree, "how this settles" panel, position-taking UI |

## Component inventory

- `SiteHeader.tsx`, `SiteFooter.tsx` — global chrome, in root `layout.tsx` (present on every route, including `/docs/*`).
- `ConnectButton.tsx` — RainbowKit `ConnectButton.Custom` wrapper, our own `<Button>` styling.
- `StatusPill.tsx` — exports `EventStatusPill` (7 registry states + optional Tier-1/Tier-2 sub-badge), `CompositeStatusPill` (4 composite states, always carries a "C" marker segment so it never reads as a primitive pill), `OperatorBadge`. This is the single place all status glyphs are defined — extend here, not ad hoc elsewhere.
- `CodeBlock.tsx` — monospace block, light/dark variant, copy button. Used everywhere code/JSON/curl appears.
- `ExampleDataBadge.tsx` — the visible "Example data" marker required by the mock-data policy.
- `architecture/LayerDiagram.tsx` — reused on `/` (`detailed=false`) and `/docs/architecture` (`detailed=true`).
- `docs/DocsSidebar.tsx` (nav list, `docsNav` array is the single source of the sidebar order), `docs/DocsLayoutShell.tsx` (responsive shell, mobile `Sheet`), `docs/EndpointSection.tsx` (the `/docs/api` per-endpoint card).
- `markets/MarketCard.tsx` — takes a discriminated `MarketUnderlying` (`{kind:"primitive", status: EventStatus, tier?}` | `{kind:"composite", status}`) since `Market.sol` can settle against either a primitive or composite event ID; don't assume composite-only.
- `markets/CompositionTree.tsx` — recursive renderer, `CompositionNode` type, currently only ever fed 1-level-deep mock data but written to handle arbitrary depth.
- Restyled + kept (real on-chain wiring unchanged, just re-themed): `EventStatusCard.tsx`, `CreateMarketCard.tsx`, `MarketPositionCard.tsx` (now takes an optional `marketId` prop so `/markets/[id]` can preset it; gates the position UI behind `useAccount().isConnected`, showing `<ConnectButton />` inline if not connected).
- Removed: `ConnectWallet.tsx` (superseded by `ConnectButton.tsx`; confirmed unreferenced before deletion).
- `lib/mock-data.ts` — typed against real SDK types (`EventStatus`, `CompositeOp`); 3 mock primitive events, 1 mock composite (mirrors `examples/end-to-end-flow.ts`'s `WITHIN(48h)` demo), 2 mock markets (one composite-settled, one primitive-settled — deliberately, to exercise `MarketCard`'s discriminated union).
- `lib/addresses.ts` — gained `disputeManager` (optional, matches SDK's `NovakAddresses`) and a `hasLiveMarketAddresses()` helper.
- `lib/utils.ts` — `cn()` (clsx+tailwind-merge) and `shortHex()`.

## Live/mock data map

| Page / section | Live or mock | Notes |
|---|---|---|
| `/`, all `/docs/*` pages | Static copy | No chain reads; numbers on `/docs/disputes` and `/docs/lifecycle` are hand-transcribed from `DisputeManager.sol`'s constants, not fetched |
| `/markets` list | **Mock**, `<ExampleDataBadge>` shown | `Market.sol` has no enumeration getter — structurally impossible to list "all markets" from the contract alone |
| `/markets` "Create a market (advanced)" | **Live** | Real `writeContract` against `marketAbi.createMarket` — needs a connected wallet + local Anvil + configured addresses |
| `/markets/[id]` composition tree, "how this settles" | **Mock** | Built from `lib/mock-data.ts`; real tree-walking would need recursive `EventComposer.getCompositeSpec` calls, not yet wrapped in a helper |
| `/markets/[id]` position-taking (`MarketPositionCard`) | **Live** | Real reads (`markets()`) and writes (`depositCollateral`/`settle`/`claim`) against whatever `marketId` route param is passed — works today against a real on-chain market created via the advanced flow above, on local Anvil |
| Header `ConnectButton`, wallet state everywhere | **Live** | Real RainbowKit/wagmi, chain-gated to local Anvil (31337) only |
| Footer contract-address list | **Live, conditional** | Reads `NEXT_PUBLIC_*` env vars; renders nothing if unset, renders the local-Anvil addresses (labeled as such) if set |

## Known gaps / assumptions from this pass

- `frontend/.env.local` is **missing** `NEXT_PUBLIC_DISPUTE_MANAGER_ADDRESS`
  and `NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS` values (added the env var
  names, left values blank) — `DisputeManager` didn't exist when that file
  was last populated from a real `Deploy.s.sol` run. Re-run the deploy
  script against a fresh Anvil and fill both in to get the footer's full
  contract list and any future DisputeManager-reading UI working.
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is still unset (placeholder only in
  `.env.example`) — every connector except WalletConnect works without it;
  `getDefaultConfig` falls back to a placeholder string so the build/dev
  server doesn't crash, but WalletConnect itself won't actually connect
  until a real project ID is provisioned.
- Chain list is Local Anvil (31337) only, by explicit choice this pass —
  add `sepolia` (already imported once, from `wagmi/chains`, before this
  pass rewired `wagmi.ts`) to `wagmiConfig`'s `chains`/`transports` once
  Issue #20's testnet deployment exists.
- `react/no-unescaped-entities` is disabled in `.eslintrc.json` — the docs
  pages are prose-heavy and raw apostrophes read better in source than
  `&apos;` everywhere. Deliberate, not an oversight.
- `next build` emits one harmless upstream warning ("Critical dependency:
  the request of a dependency is an expression", from `viem`'s optional
  `tempo` chain definition via `ox`) — doesn't affect the `foundry`-only
  chain list actually in use; not worth chasing down further.

## Next up (priority order)

1. **Real market discovery.** `/markets`' list is structurally mock until
   an indexer/subgraph exists — no amount of frontend work fixes this
   without new infrastructure. This is the single biggest gap between "demo"
   and "real product" on this site.
2. **A live API server for `/docs/api`.** The page is honest about
   documenting on-chain function signatures rather than a deployed REST
   API — building that server (and pointing the page's examples at it) is
   real, separate backend work.
3. **RainbowKit chain list expansion** once Issue #20's testnet deployment
   lands — add the chain to `src/lib/wagmi.ts`, update the footer/env
   plumbing, no other page changes needed.
4. **`NovakClient` write methods for the tiered dispute flow** — same
   already-tracked gap as `SPEC_AND_TASKS.md` Issues #7/#17; `/docs/sdk`
   already shows the exact method names as "coming soon" against
   `disputeManagerAbi`, which IS exported and usable directly today.
5. **`resolver/node/index.ts` daemon integration** with `DisputeManager`
   events (`TierOpened`, etc.) — orthogonal to the frontend, but the
   `/docs/sdk` and `/docs/api` pages both reference this as pending; keep
   them in sync if it ships.
6. Fill in `NEXT_PUBLIC_DISPUTE_MANAGER_ADDRESS` /
   `NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS` after the next local deploy
   (see "Known gaps" above) — low effort, currently just blank.
7. WalletConnect project ID provisioning (see "Known gaps" above).
