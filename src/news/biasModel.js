// src/news/biasModel.js
// Advanced lexical bias scoring for Iantopia OS — no LLM required

/* ================================
   1. Weighted keyword dictionaries
   ================================ */

const LEFT_KEYWORDS = {
  // politics/government
  "progressive": 2,
  "equity": 2,
  "diversity": 1.5,
  "union": 2,
  "labor": 1.5,
  "workers": 1.5,
  "climate": 2,
  "environmental": 1.5,
  "regulation": 1.5,

  // social issues
  "abortion rights": 3,
  "reproductive rights": 2,
  "gun control": 2,
  "immigration reform": 1.5,
  "social justice": 2,
  "racial justice": 2,
  "pride": 1.5,
  "transgender": 1.5,

  // media language
  "far-right": 2,
  "misinformation": 1.5,
  "extremism": 1.5
};

const RIGHT_KEYWORDS = {
  // politics/government
  "conservative": 2,
  "border security": 2,
  "illegal immigration": 2,
  "tax cuts": 2,
  "family values": 1.5,
  "small government": 1.5,
  "patriotism": 1.5,
  "military strength": 2,

  // social issues
  "pro-life": 3,
  "religious freedom": 2,
  "second amendment": 2,
  "gun rights": 2,
  "woke": 1.5,

  // media language
  "far-left": 2,
  "radical left": 2,
  "anti-american": 2
};

/* ================================
   Source bias baseline map
   (can expand later)
   ================================ */

const SOURCE_BIAS = {
  "Fox News": 2,
  "Breitbart": 3,
  "Daily Wire": 2,

  "CNN": -2,
  "MSNBC": -3,
  "The Guardian": -2,
  "HuffPost": -2,

  "BBC": 0,
  "Reuters": 0,
  "Associated Press": 0
};

/* ================================
   2. Scoring function
   ================================ */

export function scoreBias(text, sourceName = "") {
  text = (text || "").toLowerCase();

  let leftScore = 0;
  let rightScore = 0;

  // Weighted lexical scoring
  for (const [word, weight] of Object.entries(LEFT_KEYWORDS)) {
    if (text.includes(word)) leftScore += weight;
  }

  for (const [word, weight] of Object.entries(RIGHT_KEYWORDS)) {
    if (text.includes(word)) rightScore += weight;
  }

  // Source baseline adjustment
  const sourceBias = SOURCE_BIAS[sourceName] || 0;

  const rawScore = rightScore - leftScore + sourceBias;

  // Normalize into readable scale: -5 to +5
  const normalized = Math.max(-5, Math.min(5, rawScore));

  // Convert to label
  const label =
    normalized > 2 ? "Strong Right" :
    normalized > 0 ? "Leaning Right" :
    normalized < -2 ? "Strong Left" :
    normalized < 0 ? "Leaning Left" :
    "Center";

  // Confidence = how many signals triggered
  const confidence = Math.min(
    Math.abs(rawScore) / 5, 
    1
  );

  return {
    score: normalized,
    label,
    confidence: (confidence * 100).toFixed(0) + "%"
  };
}
