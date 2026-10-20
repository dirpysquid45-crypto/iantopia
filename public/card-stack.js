// Tap a stacked card to lift it out of the stack and read it in full. Phones
// have no hover, so this is what lifts a card there; a tap on the card's own
// button still follows the link. Tapping another card, or the same card again,
// settles the stack.
(function () {
  document.addEventListener('click', function (e) {
    var card = e.target.closest && e.target.closest('.card-stack > .stack-card');
    var opened = document.querySelector('.card-stack > .stack-card.is-open');
    if (opened && opened !== card) opened.classList.remove('is-open');
    if (!card || e.target.closest('a')) return;
    card.classList.toggle('is-open');
  });
})();
