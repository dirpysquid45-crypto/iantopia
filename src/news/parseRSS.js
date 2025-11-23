// src/news/parseRSS.js

export function parseRSS(xmlString) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlString, "text/xml");
  const items = [...xml.querySelectorAll("item")];

  return items.map(item => ({
    title: item.querySelector("title")?.textContent || "",
    link: item.querySelector("link")?.textContent || "",
    description: item.querySelector("description")?.textContent || "",
    pubDate: item.querySelector("pubDate")?.textContent || "",
  }));
}
