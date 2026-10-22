// Strubles for solo Tetris. Earned points come from the engine (rewardPoints:
// line clears, combos, back-to-back Tetrises, level), and are paid once, at game
// over, so there is no reward for stopping and starting.
//
// Caps keep this small next to the economy: at most PER_GAME per game and PER_DAY
// per day in this browser. The account watch also checks every balance rise.
// Versus is friendly-only and never pays.
//
// window.TetrisRewards:
//   PER_GAME, PER_DAY
//   left()                  Strubles still payable today
//   settle(points)          the amount to pay for a finished game (already capped, and recorded)
(function () {
  var PER_GAME = 150;
  var PER_DAY = 600;
  var KEY = 'tetris_rewards_v1';

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (o && o.day === today()) return o;
    } catch (e) { /* private mode: start the day at zero */ }
    return { day: today(), paid: 0 };
  }

  function save(o) {
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
  }

  function left() { return Math.max(0, PER_DAY - load().paid); }

  function settle(points) {
    var o = load();
    var amount = Math.max(0, Math.min(Math.floor(points || 0), PER_GAME, PER_DAY - o.paid));
    o.paid += amount;
    save(o);
    return amount;
  }

  window.TetrisRewards = { PER_GAME: PER_GAME, PER_DAY: PER_DAY, left: left, settle: settle };
})();
