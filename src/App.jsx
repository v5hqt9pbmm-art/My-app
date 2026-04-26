import { useState, useEffect, useCallback, useRef } from "react";

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

const fmt = (n, d) => {
var digits = d === undefined ? 2 : d;
if (n === null || n === undefined || isNaN(n)) return “–”;
return Number(n).toFixed(digits);
};

function timeAgo(ts) {
var diff = Date.now() - ts;
if (diff < 60000)   return “just now”;
if (diff < 3600000) return Math.floor(diff / 60000) + “m ago”;
return Math.floor(diff / 3600000) + “h ago”;
}

function severity(score) {
if (score >= 75) return { label: “HIGH”, color: “#ff4757” };
if (score >= 45) return { label: “MED”,  color: “#ffa502” };
return               { label: “LOW”,  color: “#2ed573” };
}

async function fetchFinnhub(symbol, apiKey) {
try {
var r = await fetch(“https://finnhub.io/api/v1/quote?symbol=” + symbol + “&token=” + apiKey);
if (!r.ok) return null;
var d = await r.json();
if (!d || d.c === 0) return null;
return d;
} catch (e) { return null; }
}

async function fetchCoinGecko(coinId) {
try {
var r = await fetch(
“https://api.coingecko.com/api/v3/simple/price?ids=” + coinId + “&vs_currencies=usd&include_24hr_change=true”
);
if (!r.ok) return null;
return await r.json();
} catch (e) { return null; }
}

async function fetchInsider(symbol) {
try {
var start = new Date(Date.now() - 14 * 86400000).toISOString().split(“T”)[0];
var end   = new Date().toISOString().split(“T”)[0];
var r = await fetch(
“https://efts.sec.gov/LATEST/search-index?q=%22” + symbol + “%22&dateRange=custom&startdt=” + start + “&enddt=” + end + “&forms=4”,
{ headers: { “User-Agent”: “SignalScan contact@signalscan.app” } }
);
if (!r.ok) return [];
var d = await r.json();
var hits = (d && d.hits && d.hits.hits) ? d.hits.hits : [];
return hits.slice(0, 4).map(function(h) {
return {
entity:      (h._source && h._source.entity_name) ? h._source.entity_name : symbol,
filed:       (h._source && h._source.file_date)   ? h._source.file_date : “Unknown”,
description: (h._source && h._source.form_type)   ? h._source.form_type : “Form 4”,
};
});
} catch (e) { return []; }
}

async function aiAnalyse(symbol, price, change) {
try {
var r = await fetch(“https://api.anthropic.com/v1/messages”, {
method: “POST”,
headers: { “Content-Type”: “application/json” },
body: JSON.stringify({
model: “claude-sonnet-4-20250514”,
max_tokens: 1000,
messages: [{
role: “user”,
content: “You are a concise trading signal analyst. “ + symbol + “ is showing a “ + fmt(change) + “% move. Current price: $” + fmt(price) + “. In 2 sentences max, what does this signal suggest to a retail trader? Be plain and direct. No disclaimers.”,
}],
}),
});
if (!r.ok) throw new Error(“fail”);
var d = await r.json();
return (d && d.content && d.content[0]) ? d.content[0].text : “Analysis unavailable.”;
} catch (e) { return “AI analysis temporarily unavailable.”; }
}

function Badge({ type }) {
return (
<span style={{
fontSize: 10, fontWeight: 700, padding: “2px 8px”, borderRadius: 99,
background: TYPE_BG[type] || “#1a1a2e”, color: TYPE_COLOR[type] || “#aaa”,
border: “1px solid “ + (TYPE_COLOR[type] || “#444”),
textTransform: “uppercase”, letterSpacing: 1,
}}>{type}</span>
);
}

function SignalCard({ sig, onAnalyse, analysing }) {
var sv = severity(sig.score);
return (
<div style={{
background: “#111827”, borderRadius: 14, padding: 16, marginBottom: 12,
border: “1px solid #1f2937”, borderLeft: “4px solid “ + sv.color,
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
<div style={{ display: “flex”, gap: 20, marginBottom: 10 }}>
<div>
<div style={{ fontSize: 10, color: “#6b7280”, marginBottom: 2 }}>PRICE</div>
<div style={{ fontSize: 22, fontWeight: 700, color: “#f9fafb”, fontFamily: “monospace” }}>
${fmt(sig.price)}
</div>
</div>
<div>
<div style={{ fontSize: 10, color: “#6b7280”, marginBottom: 2 }}>24H</div>
<div style={{
fontSize: 22, fontWeight: 700, fontFamily: “monospace”,
color: sig.change >= 0 ? “#2ed573” : “#ff4757”,
}}>
{sig.change >= 0 ? “+” : “”}{fmt(sig.change)}%
</div>
</div>
</div>
<div style={{ fontSize: 13, color: “#9ca3af”, lineHeight: 1.6, marginBottom: 10 }}>
{sig.reason}
</div>
{sig.analysis && (
<div style={{
background: “#0f172a”, borderRadius: 10, padding: “10px 12px”,
fontSize: 13, color: “#cbd5e1”, lineHeight: 1.6, marginBottom: 8,
borderLeft: “3px solid #4fc3f7”,
}}>
<span style={{ fontSize: 10, color: “#4fc3f7”, fontWeight: 700, letterSpacing: 1 }}>AI - </span>
{sig.analysis}
</div>
)}
<div style={{ display: “flex”, justifyContent: “space-between”, alignItems: “center” }}>
<span style={{ fontSize: 11, color: “#4b5563” }}>{timeAgo(sig.timestamp)}</span>
{!sig.analysis && (
<button
onClick={() => onAnalyse(sig)}
disabled={analysing}
style={{
background: analysing ? “#1f2937” : “#1e3a5f”,
color: analysing ? “#6b7280” : “#4fc3f7”,
border: “none”, borderRadius: 8, padding: “6px 14px”,
fontSize: 12, fontWeight: 600,
cursor: analysing ? “not-allowed” : “pointer”,
}}
>{analysing ? “Analysing…” : “AI Analyse”}</button>
)}
</div>
</div>
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
<div style={{ fontSize: 11, color: “#4b5563” }}>{filing.description} - SEC EDGAR</div>
</div>
);
}

export default function App() {
var [tab,        setTab]        = useState(0);
var [watchlist,  setWatchlist]  = useState(DEFAULT_WATCHLIST);
var [signals,    setSignals]    = useState([]);
var [filings,    setFilings]    = useState([]);
var [scanning,   setScanning]   = useState(false);
var [lastScan,   setLastScan]   = useState(null);
var [finnhubKey, setFinnhubKey] = useState(””);
var [keyDraft,   setKeyDraft]   = useState(””);
var [keySaved,   setKeySaved]   = useState(false);
var [addSym,     setAddSym]     = useState(””);
var [addName,    setAddName]    = useState(””);
var [addType,    setAddType]    = useState(“stock”);
var [analysing,  setAnalysing]  = useState(false);

var scanLock = useRef(false);

useEffect(function() {
try {
var k = localStorage.getItem(“fh_key”) || “”;
setFinnhubKey(k);
setKeyDraft(k);
setKeySaved(!!k);
} catch (e) {}
}, []);

var runScan = useCallback(async function() {
if (scanLock.current) return;
scanLock.current = true;
setScanning(true);
var results = [];

```
for (var i = 0; i < watchlist.length; i++) {
  var item = watchlist[i];
  try {
    var price = null;
    var change = null;

    if (item.type === "crypto") {
      var id = CRYPTO_IDS[item.symbol];
      if (id) {
        var cdata = await fetchCoinGecko(id);
        if (cdata && cdata[id]) {
          price  = cdata[id].usd !== undefined ? cdata[id].usd : null;
          change = cdata[id].usd_24h_change !== undefined ? cdata[id].usd_24h_change : null;
        }
      }
    } else if (finnhubKey) {
      var fdata = await fetchFinnhub(item.symbol, finnhubKey);
      if (fdata) {
        price  = fdata.c !== undefined ? fdata.c : null;
        change = fdata.dp !== undefined ? fdata.dp : null;
      }
    }

    if (price === null || change === null) continue;

    var absCh = Math.abs(change);
    if (absCh < 2.5) continue;

    var reason, score;
    if (change < -8) {
      reason = "Sharp drop of " + fmt(change) + "% - significant selling pressure or negative news.";
      score  = Math.min(95, 60 + absCh * 2);
    } else if (change < -4) {
      reason = "Notable dip of " + fmt(change) + "% - could be a short-term opportunity or early warning.";
      score  = 45 + absCh * 2;
    } else if (change > 10) {
      reason = "Strong surge of +" + fmt(change) + "% - possible news catalyst or momentum buying.";
      score  = Math.min(95, 60 + change * 1.5);
    } else if (change > 5) {
      reason = "Solid gain of +" + fmt(change) + "% - upward momentum detected.";
      score  = 45 + change * 2;
    } else {
      reason = "Moderate " + (change > 0 ? "gain" : "drop") + " of " + fmt(change) + "% - worth watching.";
      score  = 30 + absCh * 3;
    }

    results.push({
      id:        item.symbol + "-" + Date.now(),
      symbol:    item.symbol,
      name:      item.name,
      type:      item.type,
      price:     price,
      change:    change,
      reason:    reason,
      score:     Math.round(score),
      analysis:  null,
      timestamp: Date.now(),
    });
  } catch (e) {}
}

results.sort(function(a, b) { return b.score - a.score; });
setSignals(results);
setLastScan(Date.now());
setScanning(false);
scanLock.current = false;
```

}, [watchlist, finnhubKey]);

var loadInsider = useCallback(async function() {
var all = [];
var stocks = watchlist.filter(function(w) { return w.type !== “crypto”; });
for (var i = 0; i < stocks.length; i++) {
var rows = await fetchInsider(stocks[i].symbol);
all = all.concat(rows);
}
setFilings(all);
}, [watchlist]);

useEffect(function() {
runScan();
loadInsider();
var id = setInterval(runScan, 5 * 60 * 1000);
return function() { clearInterval(id); };
}, [runScan, loadInsider]);

var handleAnalyse = async function(sig) {
setAnalysing(true);
var text = await aiAnalyse(sig.symbol, sig.price, sig.change);
setSignals(function(prev) {
return prev.map(function(s) {
return s.id === sig.id ? Object.assign({}, s, { analysis: text }) : s;
});
});
setAnalysing(false);
};

var saveKey = function() {
try { localStorage.setItem(“fh_key”, keyDraft); } catch (e) {}
setFinnhubKey(keyDraft);
setKeySaved(true);
};

var addItem = function() {
var sym = addSym.trim().toUpperCase();
if (!sym) return;
if (watchlist.find(function(w) { return w.symbol === sym; })) return;
setWatchlist(function(prev) {
return prev.concat([{ symbol: sym, name: addName.trim() || sym, type: addType }]);
});
setAddSym(””);
setAddName(””);
};

var removeItem = function(sym) {
setWatchlist(function(prev) {
return prev.filter(function(w) { return w.symbol !== sym; });
});
};

var S = {
app:     { minHeight: “100vh”, background: “#030712”, color: “#f9fafb”, fontFamily: “sans-serif”, maxWidth: 480, margin: “0 auto”, paddingBottom: 80 },
hdr:     { padding: “20px 16px 0”, borderBottom: “1px solid #111827” },
title:   { fontSize: 22, fontWeight: 800, color: “#f9fafb”, margin: 0 },
sub:     { fontSize: 12, color: “#4b5563”, margin: “4px 0 14px” },
bar:     { display: “flex”, gap: 10, alignItems: “center”, marginBottom: 14 },
tabs:    { display: “flex”, borderBottom: “1px solid #111827” },
body:    { padding: “14px 14px 0” },
label:   { fontSize: 11, fontWeight: 700, color: “#4b5563”, letterSpacing: 1.5, textTransform: “uppercase”, marginBottom: 10 },
input:   { width: “100%”, background: “#111827”, border: “1px solid #1f2937”, borderRadius: 10, padding: “12px 14px”, color: “#f9fafb”, fontSize: 14, boxSizing: “border-box”, marginBottom: 10, outline: “none” },
sel:     { width: “100%”, background: “#111827”, border: “1px solid #1f2937”, borderRadius: 10, padding: “12px 14px”, color: “#f9fafb”, fontSize: 14, boxSizing: “border-box”, marginBottom: 10, outline: “none” },
addBtn:  { width: “100%”, padding: 13, background: “#1e3a5f”, color: “#4fc3f7”, border: “1px solid #1d4ed8”, borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: “pointer”, marginBottom: 10 },
saveBtn: { width: “100%”, padding: 13, background: “#052e16”, color: “#2ed573”, border: “1px solid #166534”, borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: “pointer”, marginBottom: 8 },
empty:   { textAlign: “center”, padding: “40px 20px”, color: “#4b5563” },
step:    { background: “#111827”, borderRadius: 14, padding: 16, marginBottom: 12, border: “1px solid #1f2937” },
num:     { width: 28, height: 28, background: “#1e3a5f”, color: “#4fc3f7”, borderRadius: “50%”, display: “flex”, alignItems: “center”, justifyContent: “center”, fontSize: 13, fontWeight: 800, marginBottom: 8 },
};

var scanBtnStyle = {
flex: 1, padding: 12,
background: scanning ? “#1f2937” : “#1e3a5f”,
color: scanning ? “#6b7280” : “#4fc3f7”,
border: “1px solid “ + (scanning ? “#374151” : “#1d4ed8”),
borderRadius: 10, fontSize: 14, fontWeight: 700,
cursor: scanning ? “not-allowed” : “pointer”,
};

var tabStyle = function(active) {
return {
flex: 1, padding: “13px 4px”, fontSize: 12, fontWeight: active ? 700 : 500,
color: active ? “#4fc3f7” : “#6b7280”, background: “none”, border: “none”,
borderBottom: active ? “2px solid #4fc3f7” : “2px solid transparent”, cursor: “pointer”,
};
};

var tabSignals = function() {
return (
<div style={S.body}>
<div style={S.label}>{signals.length} signal{signals.length !== 1 ? “s” : “”} found</div>
{!finnhubKey && (
<div style={{ background: “#1c1a0d”, border: “1px solid #854d0e”, borderRadius: 10, padding: “12px 14px”, fontSize: 13, color: “#fbbf24”, marginBottom: 12, lineHeight: 1.6 }}>
No Finnhub key set - only crypto prices will load. Go to Setup to add your free key.
</div>
)}
{signals.length === 0 ? (
<div style={S.empty}>
<div style={{ fontSize: 40, marginBottom: 10 }}>[scan]</div>
<div style={{ fontSize: 14 }}>{scanning ? “Scanning markets…” : “No signals right now. Try scanning again or add more assets.”}</div>
</div>
) : signals.map(function(sig) {
return <SignalCard key={sig.id} sig={sig} onAnalyse={handleAnalyse} analysing={analysing} />;
})}
</div>
);
};

var tabWatchlist = function() {
return (
<div style={S.body}>
<div style={S.label}>Add Asset</div>
<input style={S.input} placeholder=“Symbol e.g. AAPL, PEPE, BTC” value={addSym} onChange={function(e) { setAddSym(e.target.value); }} onKeyDown={function(e) { if (e.key === “Enter”) addItem(); }} />
<input style={S.input} placeholder=“Display name (optional)” value={addName} onChange={function(e) { setAddName(e.target.value); }} />
<select style={S.sel} value={addType} onChange={function(e) { setAddType(e.target.value); }}>
<option value="stock">Stock</option>
<option value="meme">Meme Stock</option>
<option value="crypto">Crypto</option>
</select>
<button style={S.addBtn} onClick={addItem}>+ Add to Watchlist</button>
<div style={Object.assign({}, S.label, { marginTop: 14 })}>Watching ({watchlist.length})</div>
{watchlist.map(function(item) {
return <WatchlistRow key={item.symbol} item={item} onRemove={removeItem} />;
})}
</div>
);
};

var tabInsider = function() {
return (
<div style={S.body}>
<div style={S.label}>SEC Form 4 Insider Filings</div>
<div style={{ fontSize: 12, color: “#6b7280”, marginBottom: 12, lineHeight: 1.6 }}>
Real insider buy/sell filings from the last 14 days. Stocks only.
</div>
{filings.length === 0 ? (
<div style={S.empty}>
<div style={{ fontSize: 36, marginBottom: 10 }}>[docs]</div>
<div style={{ fontSize: 14 }}>No recent filings found for your watchlist.</div>
<button style={Object.assign({}, S.addBtn, { marginTop: 14, width: “auto”, padding: “10px 24px” })} onClick={loadInsider}>
Refresh
</button>
</div>
) : filings.map(function(f, i) {
return <InsiderRow key={i} filing={f} />;
})}
</div>
);
};

var tabSetup = function() {
return (
<div style={S.body}>
<div style={S.label}>Finnhub API Key</div>
<div style={{ fontSize: 12, color: “#6b7280”, marginBottom: 10, lineHeight: 1.6 }}>
Get a free key at finnhub.io - enables live prices for stocks and meme stocks.
</div>
<input style={S.input} type=“password” placeholder=“Paste key here…” value={keyDraft} onChange={function(e) { setKeyDraft(e.target.value); setKeySaved(false); }} />
<button style={S.saveBtn} onClick={saveKey}>Save Key</button>
{keySaved && <div style={{ fontSize: 12, color: “#2ed573”, marginBottom: 16 }}>Saved - live stock data active</div>}
<div style={Object.assign({}, S.label, { marginTop: 16 })}>How to Install as Phone App</div>
{[
{ n: 1, t: “Create GitHub account”, b: “Sign up free at github.com” },
{ n: 2, t: “Deploy to Vercel”,      b: “Go to vercel.com, sign in with GitHub, import your project, get a free URL” },
{ n: 3, t: “Open in Safari on iPhone”, b: “Paste your Vercel URL into Safari - must be Safari not Chrome” },
{ n: 4, t: “Add to Home Screen”,    b: “Tap Share icon then Add to Home Screen. Done.” },
{ n: 5, t: “Enter your Finnhub key”, b: “Come back to this Setup tab and paste in your free Finnhub API key.” },
].map(function(s) {
return (
<div key={s.n} style={S.step}>
<div style={S.num}>{s.n}</div>
<div style={{ fontWeight: 700, color: “#f9fafb”, marginBottom: 4 }}>{s.t}</div>
<div style={{ fontSize: 13, color: “#9ca3af”, lineHeight: 1.6 }}>{s.b}</div>
</div>
);
})}
<div style={{ fontSize: 11, color: “#374151”, textAlign: “center”, marginTop: 8 }}>
SignalScan is a research tool only - not financial advice.
</div>
</div>
);
};

return (
<div style={S.app}>
<div style={S.hdr}>
<div style={S.title}>SignalScan</div>
<div style={S.sub}>Stocks - Meme - Crypto - Insider - AI Analysis</div>
<div style={S.bar}>
<button style={scanBtnStyle} onClick={runScan} disabled={scanning}>
{scanning ? “Scanning…” : “Scan Now”}
</button>
{lastScan && <span style={{ fontSize: 11, color: “#4b5563” }}>{timeAgo(lastScan)}</span>}
</div>
<div style={S.tabs}>
{TABS.map(function(t, i) {
return <button key={t} style={tabStyle(tab === i)} onClick={function() { setTab(i); }}>{t}</button>;
})}
</div>
</div>
<div style={{ paddingTop: 8 }}>
{tab === 0 && tabSignals()}
{tab === 1 && tabWatchlist()}
{tab === 2 && tabInsider()}
{tab === 3 && tabSetup()}
</div>
</div>
);
}
