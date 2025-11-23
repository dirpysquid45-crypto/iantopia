// src/news/sentiment.js

const positiveWords = ["good", "great", "positive", "success", "growth", "up", "gain"];
const negativeWords = ["bad", "crisis", "negative", "fall", "loss", "down", "risk", "fear"];

export function scoreSentiment(text) {
  let score = 0;

  text = text.toLowerCase();

  positiveWords.forEach(w => { if (text.includes(w)) score++; });
  negativeWords.forEach(w => { if (text.includes(w)) score--; });

  return {
    score,
    label:
      score > 0 ? "Positive" :
      score < 0 ? "Negative" :
      "Neutral"
  };
}
