// src/news/parseRSS.js
// Universal RSS/Atom parser for Iantopia OS
// Handles multiple feed formats + normalizes output

export function parseRSS(xmlString, feedMeta = {}) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlString, "text/xml");

  let items = [];

  /* ========================================
     1. RSS <item> format
     ======================================== */
  const rssItems = [...xml.querySelectorAll("item")];
  if (rssItems.length > 0) {
    items = rssItems.map(item => normalizeArticle(item, feedMeta, "rss"));
    return items.filter(Boolean);
  }

  /* ========================================
     2. Atom <entry> format
     ======================================== */
  const atomEntries = [...xml.querySelectorAll("entry")];
  if (atomEntries.length > 0) {
    items = atomEntries.map(entry => normalizeArticle(entry, feedMeta, "atom"));
    return items.filter(Boolean);
  }

  console.warn("⚠️ Unrecognized feed format for:", feedMeta.label);
  return [];
}

/* ========================================
   Normalizer for both RSS + Atom
   ======================================== */

function normalizeArticle(node, feedMeta, type = "rss") {
  try {
    let title = "";
    let link = "";
    let description = "";
    let pubDate = "";

    if (type === "rss") {
      title = node.querySelector("title")?.textContent?.trim() || "";
      link = node.querySelector("link")?.textContent?.trim() || "";

      const descNode =
        node.querySelector("description") ||
        node.querySelector("summary") ||
        node.querySelector("content");

      description = cleanText(descNode?.textContent || "");

      const dateNode =
        node.querySelector("pubDate") || node.querySelector("dc\\:date");

      pubDate = new Date(dateNode?.textContent || Date.now());
    }

    if (type === "atom") {
      title = node.querySelector("title")?.textContent?.trim() || "";

      const linkNode = node.querySelector("link[href]");
      link = linkNode ? linkNode.getAttribute("href") : "";

      const descNode =
        node.querySelector("summary") ||
        node.querySelector("content") ||
        node.querySelector("description");

      description = cleanText(descNode?.textContent || "");

      const dateNode =
        node.querySelector("updated") ||
        node.querySelector("published");

      pubDate = new Date(dateNode?.textContent || Date.now());
    }

    return {
      title,
      link,
      description,
      pubDate,

      // Source metadata
      source: feedMeta.label || "Unknown Source",
      sourceId: feedMeta.id || null,
      bias: feedMeta.bias || "unknown",
    };
  } catch (err) {
    console.error("❌ Error normalizing article:", err);
    return null;
  }
}

/* ========================================
   Text cleaner
   ======================================== */

function cleanText(text) {
  return text
    .replace(/<\/?[^>]+(>|$)/g, "")     // remove HTML tags
    .replace(/\s+/g, " ")              // collapse whitespace
    .trim();
}
