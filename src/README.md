# 📘 Iantopia `/src` — Developer Guide (v1)

This folder contains the **new architecture** for the upgraded Iantopia project — including the PWA, news engine, bias analyzer, catalyst detector, and future trading tools.

Your legacy fun pages (`index.html`, `never.html`, lootbox, blackjack, etc.) remain untouched.  
**Everything serious and scalable lives here.**

---

## 🔷 Purpose of `/src`

This directory is designed to give Iantopia:

- ✔ structure  
- ✔ modularity  
- ✔ expandability  
- ✔ PWA support  
- ✔ real data pipelines  

This is the future-proof foundation that powers your:

- news scraper  
- bias analysis  
- sentiment scoring  
- catalyst classification  
- watchlists  
- eventual iOS app  
- future AI integrations  

---

## 📁 Folder Overview

/src
/news → RSS + parsing + bias models
/market → catalyst logic + volatility + tickers
/ui → styles + theme engine
/components → reusable UI pieces
/utils → helpers + caching + date tools
app.js → main controller
router.js → app navigation


Each folder is intentionally “small” and modular.

---

## 🗞️ `/news/` – News & Bias Engine

This folder eventually holds:

- `fetchNews.js` – grabs RSS feeds (free sources only)
- `parseRSS.js` – converts RSS → structured objects
- `biasModel.js` – assigns left/center/right heuristic scores
- `sentiment.js` – lightweight NLP (no external API)

This is the core of your Ground-News-style intelligence system.

---

## 📈 `/market/` – Catalyst & Risk Engine

Modules include:

- `tickers.js` – watchlist + metadata for companies
- `catalysts.js` – geopolitical, macro, and earnings triggers
- `volatility.js` – risk scoring from sentiment + sector weighting

This will grow into a powerful personal trading assistant.

---

## 🎨 `/ui/` – Styling Layer

Contains:

- `styles.css`
- `mobile.css`
- `themes.css`

This folder controls layout, typography, responsiveness, and color schemes.  
It keeps styling separate from app logic.

---

## 🧩 `/components/` – Reusable UI Blocks

Example components:

- `navbar.js`
- `newsCard.js`
- `card.js`
- `loader.js`
- `alert.js`

These give you a consistent, modular UI that feels native on mobile.

---

## 🧰 `/utils/` – Helper Functions

Contains general-purpose modules:

- `storage.js` — wrapper for localStorage
- `helpers.js` — small shared functions
- `date.js` — formatting, relative time, timestamps

These prevent code duplication and keep the main modules clean.

---

## 🚦 `app.js` — App Bootloader

This is the **first script** the new Iantopia app runs.

Responsibilities:

- initialize caches
- load first view
- prepare modules
- register service worker

Everything flows through this file.

---

## 🧭 `router.js` — Navigation Engine

A lightweight client-side router to support multi-page navigation:

- `/news`
- `/market`
- `/watchlist`
- `/settings`

…all without reloading the page.

---

## 📱 PWA Support (coming soon)

You will add:

- `manifest.json`
- `service-worker.js`

These turn Iantopia into an **installable iPhone/Android app**.

---

## 🧠 Philosophy

The Iantopia architecture is:

- modular  
- minimal  
- mobile-first  
- zero-backend  
- free to run  
- designed for future AI integration  

As the project grows, you replace placeholders with real logic.

---

## 🔜 Next Steps

Create the initial folder skeleton and commit placeholder files.

If you want, I can generate:

- the entire folder tree  
- empty files  
- boilerplate code  
- manifest.json  
- service-worker.js  

Just say:

**“Generate the skeleton files.”**
