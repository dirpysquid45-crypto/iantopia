// src/components/newsCard.js
// Renders a single article card for the News Engine

/* ================================
   Bias → Color Mapping
   ================================ */
const BIAS_COLOR = {
  left:    "#3b82f6",   // blue
  center:  "#94a3b8",   // gray
  right:   "#ef4444",   // red
  unknown: "#64748b"    // fallback
};

/* ================================
   Sentiment → Color Mapping
   ================================ */
function sentimentColor(score) {
  if (score > 0.3) return "#22c55e";  // green (positive)
  if (score < -0.3) return "#ef4444"; // red (negative)
  return "#eab308";                   // yellow (neutral)
}

/* ================================
   Create a clean Article Card
   ================================ */
export function renderNewsCard(article) {
  const bias = article.bias?.label || "unknown";
  const biasScore = article.bias?.score || 0;

  const sentimentScore = article.sentiment?.score || 0;
  const sentimentLabel = article.sentiment?.label || "neutral";

  const date = new Date(article.pubDate).toLocaleString();

  /* ================================
     Card HTML
     ================================ */
  return `
    <div class="news-card" style="
      background:#0f172a;
      border:1px solid #1e293b;
      padding:16px;
      border-radius:14px;
      margin-bottom:18px;
      box-shadow:0 4px 12px rgba(0,0,0,.25);
    ">

      <h3 style="margin:0 0 8px 0; color:#e2e8f0;">
        ${article.title}
      </h3>

      <p style="margin:0 0 10px 0; color:#cbd5e1; font-size:0.95rem;">
        ${article.description || ""}
      </p>

      <p style="color:#64748b; font-size:0.8rem; margin:0 0 12px 0;">
        ${article.source} • ${date}
      </p>

      <!-- Bias Badge -->
      <div style="
        display:flex;
        align-items:center;
        gap:8px;
        margin-bottom:8px;
      ">
        <span style="
          padding:4px 8px;
          border-radius:6px;
          background:${BIAS_COLOR[bias]};
          color:white;
          font-size:0.75rem;
          text-transform:capitalize;
        ">
          ${bias}
        </span>

        <small style="color:#cbd5e1;">
          Bias score: ${biasScore.toFixed(2)}
        </small>
      </div>

      <!-- Sentiment Meter -->
      <div style="margin-top:6px;">
        <strong style="color:#cbd5e1; font-size:0.85rem;">
          Sentiment: ${sentimentLabel}
        </strong>

        <div style="
          width:100%;
          height:6px;
          background:#1e293b;
          border-radius:4px;
          margin-top:4px;
        ">
          <div style="
            width:${Math.abs(sentimentScore) * 100}%;
            height:100%;
            border-radius:4px;
            background:${sentimentColor(sentimentScore)};
            margin-left:${sentimentScore < 0 ? (50 - Math.abs(sentimentScore)*50)+'%' : '50%'};
          "></div>
        </div>
      </div>

      <!-- Link Button -->
      <div style="margin-top:10px;">
        <a href="${article.link}" target="_blank"
          style="
            padding:6px 12px;
            background:#1e293b;
            border:1px solid #334155;
            border-radius:8px;
            text-decoration:none;
            color:#e2e8f0;
            font-size:0.8rem;
          ">
          Open Article →
        </a>
      </div>

    </div>
  `;
}
