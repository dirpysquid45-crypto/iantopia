// src/news/biasModel.js

const leftWords = ["climate", "equity", "rights", "progressive", "union", "regulation"];
const rightWords = ["tax cuts", "border", "crime", "conservative", "freedom", "military"];

export function scoreBias(text) {
  text = text.toLowerCase();

  let score = 0;

  leftWords.forEach(w => { if (text.includes(w)) score--; });
  rightWords.forEach(w => { if (text.includes(w)) score++; });

  return {
    score,
    label:
      score > 0 ? "Leaning Right" :
      score < 0 ? "Leaning Left" :
      "Center"
  };
}
