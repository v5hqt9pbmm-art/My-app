import { useState, useEffect, useCallback, useRef } from “react”;

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_WATCHLIST = [
{ symbol: “NVDA”, name: “NVIDIA”,    type: “stock”  },
{ symbol: “TSLA”, name: “Tesla”,     type: “stock”  },
{ symbol: “GME”,  name: “GameStop”,  type: “meme”   },
{ symbol: “AMC”,  name: “AMC”,       type: “meme”   },
{ symbol: “DOGE”, name: “Dogecoin”,  type: “crypto” },
{ symbol: “SHIB”, name: “Shiba Inu”, type: “crypto” },
];

const CRYPTO_IDS = {
DOGE: “dogecoin”, SHIB: “shiba-inu”, PEPE: “pepe”,
BTC: “bitcoin”,   ETH: “ethereum”,   SOL: “solana”,
FLOKI: “floki”,   WIF: “dogwifcoin”,
};

const TYPE_COLOR = { stock: “#4fc3f7”, meme: “#ff7043”, crypto: “#ab47bc” };
const TYPE_BG    = { stock: “#0d2a3a”, meme: “#2a1a0d”, crypto: “#1e0d2a” };
const TABS = [“Signals”, “Watchlist”, “Insider”, “Setup”];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n, d = 2) => (n === null || n === undefined || isNaN(n)) ? “—” : Number(n).toFixed(d);

function timeAgo(ts) {
const diff = Date.now() - ts;
if (diff < 60000)   return “just now”;
if (diff < 3600000) return Math.floor(diff / 60000) + “m ago”;
return Math.floor(diff / 3600000) + “h ago”;
}

function severity(score) {
if (score >= 75) return { label: “HIGH”, color: “#ff4757” };
if (score >= 45) return { label: “MED”,  color: “#ffa502” };
return               { label: “LOW”,  color: “#2ed573” };
}

// ── API ───────────────────────────────────────────────────────────────────────
async function fetchFinnhub(symbol, apiKey) {
try {
const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`);
if (!r.ok) return null;
const d = await r.json();
// Finnhub returns 0 values when symbol unknown — treat as null
if (!d || d.c === 0) return null;
return d;
} catch { return null; }
}

async function fetchCoinGecko(coinId) {
try {
const r = await fetch(
`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`
);
if (!r.ok) return null;
return await r.json();
} catch { return null; }
}

async function fetchInsider(symbol) {
try {
const start = new Date(Date.now() - 14 * 86400000).toISOString().split(“T”)[0];
const end   = new Date().toISOString().split(“T”)[0];
const r = await fetch(
`https://efts.sec.gov/LATEST/search-index?q=%22${symbol}%22&dateRange=custom&startdt=${start}&enddt=${end}&forms=4`,
{ headers: { “User-Agent”: “SignalScan contact@signalscan.app” } }
);
if (!r.ok) return [];
const d = await r.json();
return (d?.hits?.hits || []).slice(0, 4).map((h) => ({
entity:      h._source?.entity_name || symbol,
filed:       h._source?.file_date   || h._source?.period_of_report || “Unknown”,
description: h._source?.form_type   || “Form 4”,
}));
} catch { return []; }
}

async function aiAnalyse(symbol, price, change) {
try {
const r = await fetch(“https://api.anthropic.com/v1/messages”, {
method: “POST”,
headers: { “Content-Type”: “application/json” },
body: JSON.stringify({
model: “claude-sonnet-4-20250514”,
max_tokens: 1000,
messages: [{
role: “user”,
content: `You are a concise trading signal analyst. ${symbol} is showing a ${fmt(change)}% move. Current price: $${fmt(price)}. In 2 sentences max, what does this signal suggest to a retail trader? Be plain and direct. No disclaimers.`,
}],
}),
});
if (!r.ok) throw new Error();
const d = await r.json();
return d?.content?.[0]?.text || “Analysis unavailable.”;
} catch { return “AI analysis temporarily unavailable.”; }
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Badge({ type }) {
return (
<span style={{
fontSize: 10, fontWeight: 700, padding: “2px 8px”, borderRadius: 99,
background: TYPE_BG[type] || “#1a1a2e”, color: TYPE_COLOR[type] || “#aaa”,
border: `1px solid ${TYPE_COLOR[type] || "#444"}`,
textTransform: “uppercase”, letterSpacing: 1,
}}>{type}</span>
);
}

function SignalCard({ sig, onAnalyse, analysing }) {
const sv = severity(sig.score);
return (
<div style={{
background: “#111827”, borderRadius: 14, padding: 16, marginBottom: 12,
border: “1px solid #1f2937”, borderLeft: `4px solid ${sv.color}`,
}}>
<div style={{ display: “flex”, justifyContent: “space-between”, alignItems: “center”, marginBottom: 8 }}>
<div style={{ display: “flex”, alignItems: “center”, gap: 8 }}>
<span style={{ fontFamily: “monospace”, fontWeight: 800, fontSize: 18, color: “#f9fafb” }}>
{sig.symbol}
</span>
<Badge type={sig.type} />
</div>
<span style={{
fontSize: 11, fontWeight: 800, padding: “3px 10px”, borderRadius: 99,
background: sv.color + “22”, color: sv.color, letterSpacing: 1,
}}>{sv.label}</span>
</div>

```
  <div style={{ display: "flex", gap: 20, marginBottom: 10 }}>
    <div>
      <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>PRICE</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#f9fafb", fontFamily: "monospace" }}>
        ${fmt(sig.price)}
      </div>
    </div>
    <div>
      <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>24H</div>
      <div style={{
        fontSize: 22, fontWeight: 700, fontFamily: "monospace",
        color: sig.change >= 0 ? "#2ed573" : "#ff4757",
      }}>
        {sig.change >= 0 ? "+" : ""}{fmt(sig.change)}%
      </div>
    </div>
  </div>

  <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.6, marginBottom: 10 }}>
    {sig.reason}
  </div>

  {sig.analysis && (
    <div style={{
      background: "#0f172a", borderRadius: 10, padding: "10px 12px",
      fontSize: 13, color: "#cbd5e1", lineHeight: 1.6, marginBottom: 8,
      borderLeft: "3px solid #4fc3f7",
    }}>
      <span style={{ fontSize: 10, color: "#4fc3f7", fontWeight: 700, letterSpacing: 1 }}>AI · </span>
      {sig.analysis}
    </div>
  )}

  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <span style={{ fontSize: 11, color: "#4b5563" }}>{timeAgo(sig.timestamp)}</span>
    {!sig.analysis && (
      <button
        onClick={() => onAnalyse(sig)}
        disabled={analysing}
        style={{
          background: analysing ? "#1f2937" : "#1e3a5f",
          color: analysing ? "#6b7280" : "#4fc3f7",
          border: "none", borderRadius: 8, padding: "6px 14px",
          fontSize: 12, fontWeight: 600,
          cursor: analysing ? "not-allowed" : "pointer",
        }}
      >{analysing ? "Analysing…" : "AI Analyse"}</button>
    )}
  </div>
</div>
```

);
}

function WatchlistRow({ item, onRemove }) {
return (
<div style={{
background: “#111827”, borderRadius: 12, padding: “14px 16px”,
marginBottom: 10, display: “flex”, justifyContent: “space-between”,
alignItems: “center”, border: “1px solid #1f2937”,
}}>
<div style={{ display: “flex”, alignItems: “center”, gap: 10 }}>
<div>
<div style={{ fontFamily: “monospace”, fontWeight: 800, color: “#f9fafb”, fontSize: 16 }}>
{item.symbol}
</div>
<div style={{ fontSize: 12, color: “#6b7280” }}>{item.name}</div>
</div>
<Badge type={item.type} />
</div>
<button onClick={() => onRemove(item.symbol)} style={{
background: “#1f1f2e”, border: “1px solid #374151”, color: “#ef4444”,
borderRadius: 8, padding: “6px 12px”, fontSize: 12, cursor: “pointer”,
}}>Remove</button>
</div>
);
}

function InsiderRow({ filing }) {
return (
<div style={{
background: “#111827”, borderRadius: 12, padding: “14px 16px”,
marginBottom: 10, border: “1px solid #1f2937”, borderLeft: “4px solid #ffa502”,
}}>
<div style={{ fontWeight: 700, color: “#f9fafb”, marginBottom: 4 }}>{filing.entity}</div>
<div style={{ fontSize: 12, color: “#9ca3af”, marginBottom: 2 }}>Filed: {filing.filed}</div>
<div style={{ fontSize: 11, color: “#4b5563” }}>{filing.description} · SEC EDGAR</div>
</div>
);
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
const [tab,           setTab]           = useState(0);
const [watchlist,     setWatchlist]     = useState(DEFAULT_WATCHLIST);
const [signals,       setSignals]       = useState([]);
const [filings,       setFilings]       = useState([]);
const [scanning,      setScanning]      = useState(false);
const [lastScan,      setLastScan]      = useState(null);
const [finnhubKey,    setFinnhubKey]    = useState(””);
const [keyDraft,      setKeyDraft]      = useState(””);
const [keySaved,      setKeySaved]      = useState(false);
const [addSym,        setAddSym]        = useState(””);
const [addName,       setAddName]       = useState(””);
const [addType,       setAddType]       = useState(“stock”);
const [analysing,     setAnalysing]     = useState(false);

const scanLock = useRef(false);

// Load key once on mount
useEffect(() => {
try {
const k = localStorage.getItem(“fh_key”) || “”;
setFinnhubKey(k);
setKeyDraft(k);
setKeySaved(!!k);
} catch { /* ignore if localStorage blocked */ }
}, []);

// ── Scan ──
const runScan = useCallback(async () => {
if (scanLock.current) return;
scanLock.current = true;
setScanning(true);
const results = [];

```
for (const item of watchlist) {
  try {
    let price = null, change = null;

    if (item.type === "crypto") {
      const id = CRYPTO_IDS[item.symbol];
      if (id) {
        const d = await fetchCoinGecko(id);
        if (d && d[id]) {
          price  = d[id].usd ?? null;
          change = d[id].usd_24h_change ?? null;
        }
      }
    } else if (finnhubKey) {
      const d = await fetchFinnhub(item.symbol, finnhubKey);
      if (d) {
        price  = d.c ?? null;
        change = d.dp ?? null;
      }
    }

    if (price === null || change === null) continue;

    const absCh = Math.abs(change);
    if (absCh < 2.5) continue; // ignore tiny moves

    let reason, score;
    if (change < -8) {
      reason = `Sharp drop of ${fmt(change)}% — significant selling pressure or negative news.`;
      score  = Math.min(95, 60 + absCh * 2);
    } else if (change < -4) {
      reason = `Notable dip of ${fmt(change)}% — could be a short-term opportunity or early warning.`;
      score  = 45 + absCh * 2;
    } else if (change > 10) {
      reason = `Strong surge of +${fmt(change)}% — possible news catalyst or momentum buying.`;
      score  = Math.min(95, 60 + change * 1.5);
    } else if (change > 5) {
      reason = `Solid gain of +${fmt(change)}% — upward momentum detected.`;
      score  = 45 + change * 2;
    } else {
      reason = `Moderate ${change > 0 ? "gain" : "drop"} of ${fmt(change)}% — worth watching.`;
      score  = 30 + absCh * 3;
    }

    results.push({
      id:        `${item.symbol}-${Date.now()}`,
      symbol:    item.symbol,
      name:      item.name,
      type:      item.type,
      price,
      change,
      reason,
      score:     Math.round(score),
      analysis:  null,
      timestamp: Date.now(),
    });
  } catch { /* skip item on error */ }
}

results.sort((a, b) => b.score - a.score);
setSignals(results);
setLastScan(Date.now());
setScanning(false);
scanLock.current = false;
```

}, [watchlist, finnhubKey]);

// ── Insider fetch ──
const loadInsider = useCallback(async () => {
const all = [];
for (const item of watchlist.filter(w => w.type !== “crypto”)) {
const rows = await fetchInsider(item.symbol);
all.push(…rows);
}
setFilings(all);
}, [watchlist]);

// Auto-scan on mount and every 5 min
useEffect(() => {
runScan();
loadInsider();
const id = setInterval(runScan, 5 * 60 * 1000);
return () => clearInterval(id);
}, [runScan, loadInsider]);

// ── Handlers ──
const handleAnalyse = async (sig) => {
setAnalysing(true);
const text = await aiAnalyse(sig.symbol, sig.price, sig.change);
setSignals(prev => prev.map(s => s.id === sig.id ? { …s, analysis: text } : s));
setAnalysing(false);
};

const saveKey = () => {
try { localStorage.setItem(“fh_key”, keyDraft); } catch { /* ignore */ }
setFinnhubKey(keyDraft);
setKeySaved(true);
};

const addItem = () => {
const sym = addSym.trim().toUpperCase();
if (!sym) return;
if (watchlist.find(w => w.symbol === sym)) return;
setWatchlist(prev => […prev, { symbol: sym, name: addName.trim() || sym, type: addType }]);
setAddSym(””); setAddName(””);
};

const removeItem = (sym) => setWatchlist(prev => prev.filter(w => w.symbol !== sym));

// ── Styles ──
const S = {
app:   { minHeight: “100vh”, background: “#030712”, color: “#f9fafb”, fontFamily: “‘Segoe UI’, sans-serif”, maxWidth: 480, margin: “0 auto”, paddingBottom: 80 },
hdr:   { padding: “20px 16px 0”, borderBottom: “1px solid #111827” },
title: { fontSize: 22, fontWeight: 800, color: “#f9fafb”, margin: 0, letterSpacing: -0.5 },
sub:   { fontSize: 12, color: “#4b5563”, margin: “4px 0 14px” },
bar:   { display: “flex”, gap: 10, alignItems: “center”, marginBottom: 14 },
scanBtn: (dis) => ({
flex: 1, padding: 12,
background: dis ? “#1f2937” : “#1e3a5f”,
color: dis ? “#6b7280” : “#4fc3f7”,
border: `1px solid ${dis ? "#374151" : "#1d4ed8"}`,
borderRadius: 10, fontSize: 14, fontWeight: 700,
cursor: dis ? “not-allowed” : “pointer”,
}),
tabs:  { display: “flex”, borderBottom: “1px solid #111827” },
tab:   (a) => ({
flex: 1, padding: “13px 4px”, fontSize: 12, fontWeight: a ? 700 : 500,
color: a ? “#4fc3f7” : “#6b7280”, background: “none”, border: “none”,
borderBottom: a ? “2px solid #4fc3f7” : “2px solid transparent”, cursor: “pointer”,
}),
body:  { padding: “14px 14px 0” },
label: { fontSize: 11, fontWeight: 700, color: “#4b5563”, letterSpacing: 1.5, textTransform: “uppercase”, marginBottom: 10 },
input: { width: “100%”, background: “#111827”, border: “1px solid #1f2937”, borderRadius: 10, padding: “12px 14px”, color: “#f9fafb”, fontSize: 14, boxSizing: “border-box”, marginBottom: 10, outline: “none” },
sel:   { width: “100%”, background: “#111827”, border: “1px solid #1f2937”, borderRadius: 10, padding: “12px 14px”, color: “#f9fafb”, fontSize: 14, boxSizing: “border-box”, marginBottom: 10, outline: “none” },
addBtn:  { width: “100%”, padding: 13, background: “#1e3a5f”, color: “#4fc3f7”, border: “1px solid #1d4ed8”, borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: “pointer”, marginBottom: 10 },
saveBtn: { width: “100%”, padding: 13, background: “#052e16”, color: “#2ed573”, border: “1px solid #166534”, borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: “pointer”, marginBottom: 8 },
empty: { textAlign: “center”, padding: “40px 20px”, color: “#4b5563” },
step:  { background: “#111827”, borderRadius: 14, padding: 16, marginBottom: 12, border: “1px solid #1f2937” },
num:   { width: 28, height: 28, background: “#1e3a5f”, color: “#4fc3f7”, borderRadius: “50%”, display: “flex”, alignItems: “center”, justifyContent: “center”, fontSize: 13, fontWeight: 800, marginBottom: 8 },
};

// ── Render tabs ──
const tabSignals = () => (
<div style={S.body}>
<div style={S.label}>{signals.length} signal{signals.length !== 1 ? “s” : “”} found</div>
{!finnhubKey && (
<div style={{ background: “#1c1a0d”, border: “1px solid #854d0e”, borderRadius: 10, padding: “12px 14px”, fontSize: 13, color: “#fbbf24”, marginBottom: 12, lineHeight: 1.6 }}>
⚠ No Finnhub key set — only crypto prices will load. Go to <strong>Setup</strong> to add your free key.
</div>
)}
{signals.length === 0 ? (
<div style={S.empty}>
<div style={{ fontSize: 40, marginBottom: 10 }}>📡</div>
<div style={{ fontSize: 14 }}>{scanning ? “Scanning markets…” : “No signals right now. Try scanning again or add more assets.”}</div>
</div>
) : signals.map(sig => (
<SignalCard key={sig.id} sig={sig} onAnalyse={handleAnalyse} analysing={analysing} />
))}
</div>
);

const tabWatchlist = () => (
<div style={S.body}>
<div style={S.label}>Add Asset</div>
<input style={S.input} placeholder=“Symbol e.g. AAPL, PEPE, BTC” value={addSym} onChange={e => setAddSym(e.target.value)} onKeyDown={e => e.key === “Enter” && addItem()} />
<input style={S.input} placeholder=“Display name (optional)” value={addName} onChange={e => setAddName(e.target.value)} />
<select style={S.sel} value={addType} onChange={e => setAddType(e.target.value)}>
<option value="stock">Stock</option>
<option value="meme">Meme Stock</option>
<option value="crypto">Crypto</option>
</select>
<button style={S.addBtn} onClick={addItem}>+ Add to Watchlist</button>
<div style={{ …S.label, marginTop: 14 }}>Watching ({watchlist.length})</div>
{watchlist.map(item => <WatchlistRow key={item.symbol} item={item} onRemove={removeItem} />)}
</div>
);

const tabInsider = () => (
<div style={S.body}>
<div style={S.label}>SEC Form 4 Insider Filings</div>
<div style={{ fontSize: 12, color: “#6b7280”, marginBottom: 12, lineHeight: 1.6 }}>
Real insider buy/sell filings from the last 14 days. Stocks only — crypto is not SEC-regulated.
</div>
{filings.length === 0 ? (
<div style={S.empty}>
<div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
<div style={{ fontSize: 14 }}>No recent filings found for your watchlist.</div>
<button style={{ …S.addBtn, marginTop: 14, width: “auto”, padding: “10px 24px” }} onClick={loadInsider}>
Refresh
</button>
</div>
) : filings.map((f, i) => <InsiderRow key={i} filing={f} />)}
</div>
);

const tabSetup = () => (
<div style={S.body}>
<div style={S.label}>Finnhub API Key</div>
<div style={{ fontSize: 12, color: “#6b7280”, marginBottom: 10, lineHeight: 1.6 }}>
Get a <strong style={{ color: “#f9fafb” }}>free</strong> key at{” “}
<a href=“https://finnhub.io” target=”_blank” rel=“noreferrer” style={{ color: “#4fc3f7” }}>finnhub.io</a>
{” “}— enables live prices for stocks and meme stocks.
</div>
<input style={S.input} type=“password” placeholder=“Paste key here…” value={keyDraft} onChange={e => { setKeyDraft(e.target.value); setKeySaved(false); }} />
<button style={S.saveBtn} onClick={saveKey}>✓ Save Key</button>
{keySaved && <div style={{ fontSize: 12, color: “#2ed573”, marginBottom: 16 }}>✓ Saved — live stock data active</div>}

```
  <div style={{ ...S.label, marginTop: 16 }}>How to Install as Phone App</div>
  {[
    { n: 1, t: "Create GitHub account", b: "Sign up free at github.com — this stores your app code." },
    { n: 2, t: "Deploy to Vercel",      b: "Go to vercel.com → sign in with GitHub → import your project → get a free URL like yourapp.vercel.app" },
    { n: 3, t: "Open in Safari on iPhone", b: "Paste your Vercel URL into Safari. Must be Safari — not Chrome or Firefox." },
    { n: 4, t: "Add to Home Screen",    b: "Tap the Share icon (box with arrow up) → 'Add to Home Screen' → Add. Done — it's installed." },
    { n: 5, t: "Enter your Finnhub key", b: "Come back to this Setup tab and paste in your free Finnhub API key to activate live stock prices." },
  ].map(s => (
    <div key={s.n} style={S.step}>
      <div style={S.num}>{s.n}</div>
      <div style={{ fontWeight: 700, color: "#f9fafb", marginBottom: 4 }}>{s.t}</div>
      <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.6 }}>{s.b}</div>
    </div>
  ))}
  <div style={{ fontSize: 11, color: "#374151", textAlign: "center", marginTop: 8, lineHeight: 1.8 }}>
    ⚠ SignalScan is a research tool only — not financial advice.{"\n"}Always do your own research before trading.
  </div>
</div>
```

);

return (
<div style={S.app}>
<div style={S.hdr}>
<div style={S.title}>📡 SignalScan</div>
<div style={S.sub}>Stocks · Meme · Crypto · Insider · AI Analysis</div>
<div style={S.bar}>
<button style={S.scanBtn(scanning)} onClick={runScan} disabled={scanning}>
{scanning ? “Scanning…” : “⟳ Scan Now”}
</button>
{lastScan && <span style={{ fontSize: 11, color: “#4b5563” }}>{timeAgo(lastScan)}</span>}
</div>
<div style={S.tabs}>
{TABS.map((t, i) => (
<button key={t} style={S.tab(tab === i)} onClick={() => setTab(i)}>{t}</button>
))}
</div>
</div>

```
  <div style={{ paddingTop: 8 }}>
    {tab === 0 && tabSignals()}
    {tab === 1 && tabWatchlist()}
    {tab === 2 && tabInsider()}
    {tab === 3 && tabSetup()}
  </div>
</div>
```

);
}
