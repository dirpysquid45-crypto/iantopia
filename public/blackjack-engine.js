// Isomorphic blackjack game engine (browser + Node.js)
// Shared between solo blackjack.astro and arena-server
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.BlackjackEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const SUITS = ['♠', '♥', '♦', '♣'];
  const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const SPECIAL_CARDS = {
    GOAL_CARD: { v: '🎯', name: 'Goal Card', raises_limit_to: 31 } // Raises bust limit to 31
  };

  function makeDeck() {
    const d = [];
    for (const s of SUITS) {
      for (const v of VALUES) {
        d.push({ s, v });
      }
    }
    // Fisher-Yates shuffle
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }

  function cardValue(c) {
    if (c.isGoalCard) return 0; // Goal card doesn't add value
    if (c.v === 'A') return 11;
    if (['K', 'Q', 'J'].includes(c.v)) return 10;
    return parseInt(c.v, 10);
  }

  function hasGoalCard(hand) {
    return hand.some(c => c.isGoalCard);
  }

  function hasAceWildcard(hand) {
    return hand.some(c => c.v === 'A' && c.isWildcard);
  }

  function isTrumpCard(card) {
    return card.isGoalCard || (card.v === 'A' && card.isWildcard);
  }

  function handValue(hand) {
    let total = 0, aces = 0;
    for (const c of hand) {
      total += cardValue(c);
      if (c.v === 'A') aces++;
    }
    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }
    return total;
  }

  function isBust(hand) {
    // Goal card raises bust limit to 31
    const limit = hasGoalCard(hand) ? 31 : 21;
    return handValue(hand) > limit;
  }

  function getBustLimit(hand) {
    return hasGoalCard(hand) ? 31 : 21;
  }

  return {
    SUITS,
    VALUES,
    SPECIAL_CARDS,
    makeDeck,
    cardValue,
    handValue,
    isBust,
    hasGoalCard,
    hasAceWildcard,
    isTrumpCard,
    getBustLimit
  };
});
