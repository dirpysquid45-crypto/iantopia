#!/usr/bin/env bash
set -e

echo ">> Creating src directory structure..."

# Folders
mkdir -p src/news
mkdir -p src/market
mkdir -p src/ui
mkdir -p src/components
mkdir -p src/utils

########################################
# src/README.md
########################################
cat > src/README.md << 'EOF'
# Iantopia `/src` – Engine Skeleton

This folder holds the **new architecture** for the Iantopia engine.

Subfolders:

- `news/`       – RSS fetching, parsing, bias & sentiment helpers
- `market/`     – catalyst logic, volatility helpers, ticker metadata
- `ui/`         – global styles, mobile tweaks, theme system
- `components/` – small reusable UI widgets (cards, navbar, etc.)
- `utils/`      – storage helpers, date helpers, misc utilities
- `app.js`      – main controller for the engine UI
- `router.js`   – simple client-side router (views / tabs)

This is just the **skeleton**; real logic will grow here over time.
EOF

########################################
# Root engine files
########################################
cat > src/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Iantopia Engine</title>
  <link rel="stylesheet" href="./ui/styles.css">
</head>
<body>
  <div id="app-root">
    <h1>Iantopia Engine</h1>
    <p>This is the new experimental market/news engine. 🚧</p>
    <p>Edit <code>src/app.js</code> and <code>src/router.js</code> to build the real UI.</p>
  </div>
  <script type="module" src="./app.js"></script>
</body>
</html>
EOF

cat > src/app.js << 'EOF'
// src/app.js
// Main entry point for the Iantopia engine UI.

import { initRouter } from './router.js';

export function bootIantopiaEngine() {
  const root = document.getElementById('app-root');
  if (!root) {
    console.error('No #app-root found. Check src/index.html.');
    return;
  }

  root.innerHTML = `
    <header class="topbar">
      <h1>Iantopia Engine</h1>
      <nav id="nav"></nav>
    </header>
    <main id="view"></main>
  `;

  initRouter();
}

// Auto-boot when loaded directly via src/index.html
document.addEventListener('DOMContentLoaded', bootIantopiaEngine);
EOF

cat > src/router.js << 'EOF'
// src/router.js
// Tiny client-side router / view switcher for the engine.

const routes = {
  news:  () => '<h2>News Feed (coming soon)</h2>',
  market:() => '<h2>Market Dashboard (coming soon)</h2>',
  about: () => '<h2>About Iantopia Engine</h2><p>Early skeleton version.</p>',
};

export function initRouter() {
  const nav = document.getElementById('nav');
  const view = document.getElementById('view');
  if (!nav || !view) return;

  nav.innerHTML = `
    <button data-route="news">News</button>
    <button data-route="market">Market</button>
    <button data-route="about">About</button>
  `;

  function render(route) {
    const fn = routes[route] || routes.news;
    view.innerHTML = fn();
  }

  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-route]');
    if (!btn) return;
    render(btn.dataset.route);
  });

  // default view
  render('news');
}
EOF

########################################
# /src/news/*
########################################
cat > src/news/fetchNews.js << 'EOF'
// src/news/fetchNews.js
// Placeholder for RSS fetching logic (no APIs, just public feeds).

/**
 * Fetch raw RSS XML from a URL.
 * NOTE: For now this is just a stub. We'll wire real logic later.
 */
export async function fetchRSS(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch RSS: ${res.status}`);
  return await res.text();
}
EOF

cat > src/news/parseRSS.js << 'EOF'
// src/news/parseRSS.js
// Tiny helper to turn RSS XML into a JS object (very basic for now).

export function parseRSS(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const items = [...doc.querySelectorAll('item')].map(item => ({
    title: item.querySelector('title')?.textContent ?? '',
    link:  item.querySelector('link')?.textContent ?? '',
    pubDate: item.querySelector('pubDate')?.textContent ?? '',
    description: item.querySelector('description')?.textContent ?? '',
  }));
  return items;
}
EOF

cat > src/news/biasModel.js << 'EOF'
// src/news/biasModel.js
// Heuristic bias estimation placeholder.

const LEFT_WORDS  = ['union','inequality','climate','justice'];
const RIGHT_WORDS = ['tax cuts','regulation','border','security'];

export function estimateBias(article) {
  const text = (article.title + ' ' + article.description).toLowerCase();
  let leftScore = 0;
  let rightScore = 0;

  LEFT_WORDS.forEach(w  => { if (text.includes(w)) leftScore++;  });
  RIGHT_WORDS.forEach(w => { if (text.includes(w)) rightScore++; });

  if (leftScore === rightScore) return 'center';
  return leftScore > rightScore ? 'leans-left' : 'leans-right';
}
EOF

cat > src/news/sentiment.js << 'EOF'
// src/news/sentiment.js
// Super simple sentiment scoring (placeholder). Not real NLP.

const NEGATIVE = ['crash','war','down','loss','fear','panic','fraud'];
const POSITIVE = ['rally','up','gain','record','growth','peace','deal'];

export function scoreSentiment(article) {
  const text = (article.title + ' ' + article.description).toLowerCase();
  let score = 0;

  POSITIVE.forEach(w => { if (text.includes(w)) score++;  });
  NEGATIVE.forEach(w => { if (text.includes(w)) score--; });

  return score; // >0 bullish, <0 bearish, 0 neutral
}
EOF

########################################
# /src/market/*
########################################
cat > src/market/tickers.js << 'EOF'
// src/market/tickers.js
// Basic ticker metadata store (can grow over time).

export const WATCHLIST = [
  { symbol: 'NVDA', name: 'NVIDIA Corp', sector: 'Technology' },
  { symbol: 'AMZN', name: 'Amazon.com Inc', sector: 'Consumer Discretionary' },
  { symbol: 'SONY', name: 'Sony Group', sector: 'Communication Services' },
];

export function findTicker(symbol) {
  return WATCHLIST.find(t => t.symbol === symbol.toUpperCase()) || null;
}
EOF

cat > src/market/catalysts.js << 'EOF'
// src/market/catalysts.js
// Placeholder: classify headline into catalyst buckets.

const CATEGORIES = [
  { key: 'macro',      keywords: ['fed','inflation','gdp','rates','unemployment'] },
  { key: 'sector',     keywords: ['semiconductor','banking','energy sector','retail'] },
  { key: 'company',    keywords: ['earnings','guidance','upgrade','downgrade','lawsuit'] },
  { key: 'geopolitical', keywords: ['sanction','war','conflict','tariff','treaty'] },
];

export function classifyCatalyst(article) {
  const text = (article.title + ' ' + article.description).toLowerCase();
  const hits = [];

  for (const cat of CATEGORIES) {
    if (cat.keywords.some(k => text.includes(k))) hits.push(cat.key);
  }

  return hits.length ? hits : ['uncategorized'];
}
EOF

cat > src/market/volatility.js << 'EOF'
// src/market/volatility.js
// Combines sentiment + catalyst hits into a rough "volatility" score.

import { scoreSentiment } from '../news/sentiment.js';
import { classifyCatalyst } from './catalysts.js';

export function estimateVolatility(article) {
  const sentiment = scoreSentiment(article);       // -inf .. +inf
  const catalysts = classifyCatalyst(article);     // array of labels

  let base = Math.abs(sentiment);
  base += catalysts.includes('macro')       ? 2 : 0;
  base += catalysts.includes('geopolitical')? 2 : 0;
  base += catalysts.includes('company')     ? 1 : 0;

  if (base === 0) return 'low';
  if (base <= 2)  return 'medium';
  return 'high';
}
EOF

########################################
# /src/ui/*
########################################
cat > src/ui/styles.css << 'EOF'
/* src/ui/styles.css */
/* Global look for Iantopia engine */

:root{
  --bg:#05060b;
  --panel:#111522;
  --ink:#f5f7ff;
  --muted:#9aa4c6;
  --accent:#22d3ee;
}

*{ box-sizing:border-box; }

body{
  margin:0;
  font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
  background:radial-gradient(circle at top,#1a1f33 0,#05060b 60%);
  color:var(--ink);
}

#app-root{
  max-width:960px;
  margin:40px auto;
  padding:24px;
  background:var(--panel);
  border-radius:18px;
  box-shadow:0 24px 60px rgba(0,0,0,.6);
}

.topbar{
  display:flex;
  justify-content:space-between;
  align-items:center;
  margin-bottom:16px;
}

button{
  border:none;
  border-radius:999px;
  padding:8px 14px;
  background:#151b2a;
  color:var(--ink);
  cursor:pointer;
}
button:hover{ background:#1e273a; }
EOF

cat > src/ui/mobile.css << 'EOF'
/* src/ui/mobile.css */
/* Extra tiny-screen tweaks (placeholder) */

@media (max-width:600px){
  #app-root{
    margin:12px;
    padding:16px;
  }
}
EOF

cat > src/ui/themes.css << 'EOF'
/* src/ui/themes.css */
/* Future theme system (dark / light / special palettes). */
EOF

########################################
# /src/components/*
########################################
cat > src/components/navbar.js << 'EOF'
// src/components/navbar.js
// Simple navbar renderer (optional if you want to use it later).

export function renderNavbar(el, items) {
  if (!el) return;
  el.innerHTML = items.map(i => `
    <button data-route="${i.route}">${i.label}</button>
  `).join('');
}
EOF

cat > src/components/card.js << 'EOF'
// src/components/card.js
// Generic card wrapper component.

export function renderCard(content) {
  return `<article class="card">${content}</article>`;
}
EOF

cat > src/components/newsCard.js << 'EOF'
// src/components/newsCard.js
// Turn a news article into a formatted card.

import { estimateBias } from '../news/biasModel.js';
import { scoreSentiment } from '../news/sentiment.js';
import { estimateVolatility } from '../market/volatility.js';

export function renderNewsCard(article){
  const bias = estimateBias(article);
  const sentiment = scoreSentiment(article);
  const vol = estimateVolatility(article);

  return `
    <article class="card news-card">
      <h3><a href="${article.link}" target="_blank" rel="noopener">${article.title}</a></h3>
      <p>${article.description || ''}</p>
      <small>
        Bias: <strong>${bias}</strong> ·
        Sentiment: <strong>${sentiment}</strong> ·
        Volatility: <strong>${vol}</strong>
      </small>
    </article>
  `;
}
EOF

cat > src/components/loader.js << 'EOF'
// src/components/loader.js
// Tiny loading spinner markup.

export function renderLoader(text='Loading...'){
  return `<div class="loader">${text}</div>`;
}
EOF

cat > src/components/alert.js << 'EOF'
// src/components/alert.js
// Simple alert banner.

export function renderAlert(kind, message){
  return `<div class="alert alert-${kind}">${message}</div>`;
}
EOF

########################################
# /src/utils/*
########################################
cat > src/utils/storage.js << 'EOF'
// src/utils/storage.js
// Thin wrapper around localStorage with JSON helpers.

const PREFIX = 'iantopia_';

export function load(key, fallback=null){
  try{
    const raw = localStorage.getItem(PREFIX+key);
    return raw ? JSON.parse(raw) : fallback;
  }catch{
    return fallback;
  }
}

export function save(key, value){
  try{
    localStorage.setItem(PREFIX+key, JSON.stringify(value));
  }catch(e){
    console.warn('storage save failed', e);
  }
}
EOF

cat > src/utils/helpers.js << 'EOF'
// src/utils/helpers.js
// Misc helper utilities.

export function clamp(x, min, max){
  return Math.max(min, Math.min(max, x));
}
EOF

cat > src/utils/date.js << 'EOF'
// src/utils/date.js
// Date formatting helpers.

export function formatDate(dateLike){
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}
EOF

echo ">> Done! src skeleton created."
