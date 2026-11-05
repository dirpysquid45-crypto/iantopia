// The spoken lines: the turkey (squeaky) and the farmer (gruff). tools/make-voices.mjs records each
// one with Chatterbox on cerebro into voices/<id>.mp3. The words on screen are written separately,
// in capitals (js/rules.js, madeIt); these are how they're said. Ids name the day by its id.
export const LINES = {
  // the farmer, on the day card
  "farmer-day-farm": { who: "farmer", text: "Come back here, you bird!" },
  "farmer-day-corn": { who: "farmer", text: "You can't hide in my corn!" },
  "farmer-day-patch": { who: "farmer", text: "Get outta my pumpkins!" },
  "farmer-day-orchard": { who: "farmer", text: "I'll find ya in these apples!" },
  "farmer-day-fair": { who: "farmer", text: "Has anybody seen my turkey?" },
  "farmer-day-market": { who: "farmer", text: "Grab that bird! He's dinner!" },
  "farmer-day-town": { who: "farmer", text: "Somebody stop that turkey!" },
  "farmer-day-lot": { who: "farmer", text: "I've got a coupon for you, turkey!" },
  "farmer-day-parade": { who: "farmer", text: "Stop that turkey! He's mine!" },
  "farmer-day-snow": { who: "farmer", text: "Snow won't save ya, bird!" },
  "farmer-day-feast": { who: "farmer", text: "The oven's hot! Get over here!" },
  // the farmer, when the turkey stumbles and he catches up
  "farmer-close-0": { who: "farmer", text: "Ha! I'm gaining on ya!" },
  "farmer-close-1": { who: "farmer", text: "Gravy's waiting, buddy!" },
  "farmer-close-2": { who: "farmer", text: "Almost got ya!" },
  // the farmer, when he catches the turkey
  "farmer-caught": { who: "farmer", text: "Gotcha! Dinner is served!" },
  // the turkey, picking up a power-up
  "turkey-pumpkin": { who: "turkey", text: "Pumpkin shield!" },
  "turkey-sneakers": { who: "turkey", text: "Turbo sneakers!" },
  "turkey-magnet": { who: "turkey", text: "Corn magnet!" },
  // the turkey at the end of each day, in the order of that day's madeIt lines
  "turkey-made-farm-0": { who: "turkey", text: "Wow, I'm not getting cooked!" },
  "turkey-made-farm-1": { who: "turkey", text: "Phew! Not cooked yet!" },
  "turkey-made-farm-2": { who: "turkey", text: "That was too close!" },
  "turkey-made-corn-0": { who: "turkey", text: "Still not stuffing!" },
  "turkey-made-corn-1": { who: "turkey", text: "No gravy for me!" },
  "turkey-made-corn-2": { who: "turkey", text: "Gobble gobble, sucker!" },
  "turkey-made-patch-0": { who: "turkey", text: "I'm not a pumpkin pie!" },
  "turkey-made-patch-1": { who: "turkey", text: "Out of the patch!" },
  "turkey-made-orchard-0": { who: "turkey", text: "How do you like them apples?" },
  "turkey-made-orchard-1": { who: "turkey", text: "An apple a day keeps the cook away!" },
  "turkey-made-fair-0": { who: "turkey", text: "Blue ribbon runner!" },
  "turkey-made-fair-1": { who: "turkey", text: "First prize turkey!" },
  "turkey-made-market-0": { who: "turkey", text: "Not for sale!" },
  "turkey-made-market-1": { who: "turkey", text: "I'm not on the menu!" },
  "turkey-made-town-0": { who: "turkey", text: "I'm sweating gravy here!" },
  "turkey-made-town-1": { who: "turkey", text: "Too hot. Oven hot." },
  "turkey-made-lot-0": { who: "turkey", text: "Clean up, aisle five!" },
  "turkey-made-lot-1": { who: "turkey", text: "No sale on this turkey!" },
  "turkey-made-parade-0": { who: "turkey", text: "This parade is for me!" },
  "turkey-made-parade-1": { who: "turkey", text: "Wave to the fans!" },
  "turkey-made-snow-0": { who: "turkey", text: "Thanksgiving is tomorrow?!" },
  "turkey-made-snow-1": { who: "turkey", text: "Brrr! Still not cooked!" },
  "turkey-made-feast-0": { who: "turkey", text: "No oven for me. Pizza tonight!" },
};

export const voiceUrl = (id) => (LINES[id] ? `voices/${id}.mp3` : null);
