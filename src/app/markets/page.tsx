import fs from "fs";
import path from "path";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Markets",
  description: "Nifty, BankNifty, Bitcoin & Forex analysis. Updated during market hours.",
};

type QuantData = {
  NIFTY?: Analysis;
  BANKNIFTY?: Analysis;
  BITCOIN?: BTCData;
  FOREX?: ForexData;
  _meta?: { fetchedAt: string; fetchTimeMs: number };
};

type Analysis = {
  symbol: string;
  underlyingValue: number;
  verdict: string;
  confidence: string;
  netScore: number;
  hasData: boolean;
  liveEmpty?: boolean;
  isCached?: boolean;
  cacheAge?: number;
  info?: string;
  quant?: {
    pcr: { oiPCR: number; volumePCR: number; interpretation: { reason: string } };
    maxPain: { maxPainStrike: number; maxPainValue: number };
    oiAnalysis: { resistance: number; support: number; putToCallStrength: number };
    ivAnalysis: { avgIV: number; ivSkew: number };
  };
};

type BTCData = {
  currentPrice: number;
  changes: { day: { pct: number }; week: { pct: number }; month: { pct: number } };
  technicals: {
    sma20: number; sma50: number; sma200: number; rsi14: number;
    volatility20: number; atr14: number; support: number; resistance: number;
  };
  trend: string;
  verdict: string;
  signals: { indicator: string; signal: string; detail: string }[];
};

type ForexData = {
  pairs: Record<string, { pair: string; currentPrice: number; change: number; pctChange: number; weekChange: number }>;
  arbitrages: { type: string; route: string; deviationPct: number; profitable: boolean; direction: string }[];
};

function loadData(): QuantData {
  try {
    const filePath = path.join(process.cwd(), "vector-store", "quant-analysis.json");
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch { return {}; }
}

function VerdictBadge({ verdict, hasData }: { verdict: string; hasData?: boolean }) {
  const map: Record<string, string> = {
    BULLISH: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    BEARISH: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    NEUTRAL: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    CAUTION: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    NO_DATA: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500",
  };
  const emoji: Record<string, string> = {
    BULLISH: "📈", BEARISH: "📉", NEUTRAL: "➡️", CAUTION: "⚠️", NO_DATA: "⏸️",
  };
  const cls = map[verdict] || "bg-zinc-100 text-zinc-500";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${cls}`}>
      {emoji[verdict] || "⏸️"} {!hasData ? "No Data" : verdict}
    </span>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-100 py-2 text-sm last:border-0 dark:border-zinc-800">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="font-medium text-zinc-900 dark:text-zinc-100">{value}</span>
    </div>
  );
}

export default function MarketsPage() {
  const data = loadData();
  const nifty = data.NIFTY;
  const banknifty = data.BANKNIFTY;
  const btc = data.BITCOIN;
  const forex = data.FOREX;
  const time = data._meta?.fetchedAt
    ? new Date(data._meta.fetchedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Markets</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Quant analysis from NSE options chain + Bitcoin + Forex.
          {time && <> Updated {time}</>}
        </p>
      </div>

      {/* Nifty */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">NIFTY</h2>
          <VerdictBadge verdict={nifty?.verdict || "NO_DATA"} hasData={nifty?.hasData} />
          {nifty?.isCached && <span className="text-xs text-zinc-400">⚡ {nifty.cacheAge}h old</span>}
          {nifty?.liveEmpty && <span className="text-xs text-amber-500">markets closed — no cached data</span>}
        </div>
        {nifty?.hasData ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <StatRow label="Spot" value={`₹${nifty.underlyingValue?.toLocaleString() || "?"}`} />
            <StatRow label="VIX" value="—" />
            <StatRow label="PCR (OI)" value={nifty.quant?.pcr.oiPCR.toFixed(2) || "?"} />
            <StatRow label="PCR (Vol)" value={nifty.quant?.pcr.volumePCR.toFixed(2) || "?"} />
            <StatRow label="Max Pain" value={nifty.quant?.maxPain.maxPainStrike?.toLocaleString() || "?"} />
            <StatRow label="IV Skew" value={nifty.quant?.ivAnalysis.ivSkew.toFixed(2) || "?"} />
            <StatRow label="Resistance" value={nifty.quant?.oiAnalysis.resistance?.toLocaleString() || "?"} />
            <StatRow label="Support" value={nifty.quant?.oiAnalysis.support?.toLocaleString() || "?"} />
            <StatRow label="Confidence" value={`${nifty.confidence} (${((nifty.netScore || 0) * 100).toFixed(0)}/100)`} />
          </div>
        ) : (
          <p className="text-sm text-zinc-400">
            {nifty?.info || "No live data available. Run quant engine during market hours."}
          </p>
        )}
      </section>

      {/* BankNifty */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">BANKNIFTY</h2>
          <VerdictBadge verdict={banknifty?.verdict || "NO_DATA"} hasData={banknifty?.hasData} />
          {banknifty?.isCached && <span className="text-xs text-zinc-400">⚡ {banknifty.cacheAge}h old</span>}
          {banknifty?.liveEmpty && <span className="text-xs text-amber-500">markets closed — no cached data</span>}
        </div>
        {banknifty?.hasData ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <StatRow label="Spot" value={`₹${banknifty.underlyingValue?.toLocaleString() || "?"}`} />
            <StatRow label="PCR (OI)" value={banknifty.quant?.pcr.oiPCR.toFixed(2) || "?"} />
            <StatRow label="PCR (Vol)" value={banknifty.quant?.pcr.volumePCR.toFixed(2) || "?"} />
            <StatRow label="Max Pain" value={banknifty.quant?.maxPain.maxPainStrike?.toLocaleString() || "?"} />
            <StatRow label="IV Skew" value={banknifty.quant?.ivAnalysis.ivSkew.toFixed(2) || "?"} />
            <StatRow label="Resistance" value={banknifty.quant?.oiAnalysis.resistance?.toLocaleString() || "?"} />
            <StatRow label="Support" value={banknifty.quant?.oiAnalysis.support?.toLocaleString() || "?"} />
            <StatRow label="Confidence" value={`${banknifty.confidence} (${((banknifty.netScore || 0) * 100).toFixed(0)}/100)`} />
          </div>
        ) : (
          <p className="text-sm text-zinc-400">
            {banknifty?.info || "No live data available. Run quant engine during market hours."}
          </p>
        )}
      </section>

      {/* Bitcoin */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Bitcoin</h2>
          <VerdictBadge verdict={btc?.verdict || "NO_DATA"} />
        </div>
        {btc ? (
          <>
            <div className="mb-3">
              <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                ${btc.currentPrice.toLocaleString()}
              </span>
              <span className={`ml-2 text-sm ${btc.changes.day.pct >= 0 ? "text-green-500" : "text-red-500"}`}>
                {btc.changes.day.pct >= 0 ? "+" : ""}{btc.changes.day.pct.toFixed(2)}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <StatRow label="RSI (14)" value={btc.technicals.rsi14.toFixed(1)} />
              <StatRow label="Volatility (20d)" value={`${btc.technicals.volatility20}%`} />
              <StatRow label="SMA 20" value={`$${btc.technicals.sma20.toLocaleString()}`} />
              <StatRow label="SMA 50" value={`$${btc.technicals.sma50.toLocaleString()}`} />
              <StatRow label="SMA 200" value={`$${btc.technicals.sma200.toLocaleString()}`} />
              <StatRow label="ATR (14)" value={`$${btc.technicals.atr14.toLocaleString()}`} />
              <StatRow label="Support" value={`$${btc.technicals.support.toLocaleString()}`} />
              <StatRow label="Resistance" value={`$${btc.technicals.resistance.toLocaleString()}`} />
              <StatRow label="7d Change" value={`${btc.changes.week.pct >= 0 ? "+" : ""}${btc.changes.week.pct.toFixed(2)}%`} />
              <StatRow label="30d Change" value={`${btc.changes.month.pct >= 0 ? "+" : ""}${btc.changes.month.pct.toFixed(2)}%`} />
            </div>
            {btc.signals?.length > 0 && (
              <div className="mt-4 space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Signals</p>
                {btc.signals.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className={s.signal === "BULLISH" ? "text-green-500" : s.signal === "BEARISH" ? "text-red-500" : s.signal === "CAUTION" ? "text-amber-500" : "text-zinc-400"}>
                      {s.signal === "BULLISH" ? "▲" : s.signal === "BEARISH" ? "▼" : "◆"}
                    </span>
                    <span className="text-zinc-600 dark:text-zinc-400">{s.indicator}:</span>
                    <span className="text-zinc-900 dark:text-zinc-100">{s.detail}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-400">No Bitcoin data available.</p>
        )}
      </section>

      {/* Forex */}
      {(() => {
        const fxPairs = forex?.pairs;
        const fxArbs = forex?.arbitrages;
        return (
          <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Forex</h2>
            {fxPairs ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                {Object.entries(fxPairs).map(([key, p]) => (
                  <StatRow
                    key={key}
                    label={key}
                    value={`${p.currentPrice.toFixed(4)} ${p.pctChange >= 0 ? "+" : ""}${p.pctChange.toFixed(2)}%`}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-400">No forex data available. Run quant engine during market hours.</p>
            )}
            {fxArbs && fxArbs.length > 0 ? (
              <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">Arbitrage</p>
                {fxArbs.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span>{a.profitable ? "⚠️" : "✓"}</span>
                    <span className="text-zinc-600 dark:text-zinc-400">{a.route}:</span>
                    <span className={Math.abs(a.deviationPct) > 0.1 ? "text-amber-500 font-medium" : "text-zinc-900 dark:text-zinc-100"}>
                      {a.deviationPct > 0 ? "+" : ""}{a.deviationPct.toFixed(3)}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-400">No forex data available. Run quant engine during market hours.</p>
            )}
          </section>
        );
      })()}

      {/* Footer note */}
      <p className="text-center text-xs text-zinc-400">
        Data sourced from Yahoo Finance. Options data during NSE market hours only.
      </p>
    </div>
  );
}
