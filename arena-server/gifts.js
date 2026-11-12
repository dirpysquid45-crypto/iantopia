// Gifts to a visitable village: a Strubles gift, or a free note. The server moves the
// money: a gift debits the sender in the same transaction that writes the gift, and a
// collect credits the receiver once. Clients can't write gifts (firestore.rules), so the
// limits and the word filter here are the only ones.
const crypto = require('crypto');
const BalanceManager = require('./balance');
const moderation = require('./moderation');

const { balanceOf } = BalanceManager;
const GIFT_MAX = 1000;             // Strubles per gift
const GIFT_DAILY_LIMIT = 1;        // Strubles gifts per sender per UTC day
const NOTE_DAILY_LIMIT = 20;       // notes per sender per UTC day (PROVISIONAL)
const NOTE_MAX_CHARS = 140;
const STICKERS = ['sunflower', 'balloon', 'cake', 'star', 'cat', 'letter'];
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function dayKey(now) {
  return new Date(now).toISOString().slice(0, 10);
}
// The sender's name comes from the verified token, never from the request.
function nameFrom(token) {
  const s = String(token && token.name || '').replace(/[\u0000-\u001f<>&"]/g, '').trim().slice(0, 24);
  return s || 'Player';
}

class Gifts {
  constructor(db, { now = () => Date.now(), balance } = {}) {
    this.db = db;
    this.now = now;
    this.balance = balance || new BalanceManager(db);
  }

  villageRef(uid) { return this.db.collection('village_snapshots').doc(uid); }
  giftRef(uid, giftId) { return this.db.collection(`village_snapshots/${uid}/gifts`).doc(giftId); }
  userRef(uid) { return this.db.collection('users').doc(uid); }
  ledgerRef(id) { return this.db.collection('account_log').doc(id); }

  // The day's counts for one sender: { day, strubles, notes }. A new day starts at zero.
  static todays(data, now) {
    const g = data && data.gift_day;
    const day = dayKey(now);
    if (g && g.day === day) return { day, strubles: Number(g.strubles) || 0, notes: Number(g.notes) || 0 };
    return { day, strubles: 0, notes: 0 };
  }

  // Checks shared by a gift and a note. Returns an error response, or null if fine.
  checkCommon(sender, body, { needAmount }) {
    const toUid = body && body.toUid;
    if (typeof toUid !== 'string' || !ID_RE.test(toUid)) return { status: 400, body: { error: 'bad_request' } };
    if (!STICKERS.includes(body.stickerId)) return { status: 400, body: { error: 'bad_request' } };
    const note = body.note == null ? '' : body.note;
    if (typeof note !== 'string' || note.length > NOTE_MAX_CHARS) return { status: 400, body: { error: 'bad_request' } };
    if (needAmount && !(Number.isSafeInteger(body.amount) && body.amount >= 1 && body.amount <= GIFT_MAX)) {
      return { status: 400, body: { error: 'bad_request' } };
    }
    if (toUid === sender.uid) return { status: 400, body: { error: 'self' } };
    if (moderation.isBlocked(note)) return { status: 400, body: { error: 'blocked_text' } };
    return null;
  }

  // A Strubles gift: debit the sender, and write a pending gift for the receiver.
  async sendStrubles(sender, body) {
    const bad = this.checkCommon(sender, body, { needAmount: true });
    if (bad) return bad;
    const now = this.now();
    const giftId = crypto.randomBytes(12).toString('hex');
    const note = body.note == null ? '' : body.note;
    const toUid = body.toUid;
    return this.db.runTransaction(async (tx) => {
      const target = await tx.get(this.villageRef(toUid));
      if (!target.exists || target.data().visitable !== true) return { status: 403, body: { error: 'not_visitable' } };
      const snap = await tx.get(this.userRef(sender.uid));
      const data = snap.exists ? snap.data() : {};
      const today = Gifts.todays(data, now);
      if (today.strubles >= GIFT_DAILY_LIMIT) return { status: 429, body: { error: 'limit' } };
      const bal = balanceOf(data);
      if (bal < body.amount) return { status: 402, body: { error: 'insufficient' } };
      const after = bal - body.amount;
      // A gift is not a purchase, so the refund budget is left alone.
      tx.set(this.userRef(sender.uid), {
        strubles_balance_v1: String(after),
        gift_day: { ...today, strubles: today.strubles + 1 },
        wallet_last_op: JSON.stringify({ kind: 'gift_out', amount: body.amount, page: null, at: now, game: null, source: null }),
      }, { merge: true });
      tx.set(this.giftRef(toUid, giftId), {
        kind: 'strubles', status: 'pending', amount: body.amount, stickerId: body.stickerId, note,
        fromUid: sender.uid, fromName: nameFrom(sender), createdAt: new Date(now),
      });
      tx.set(this.ledgerRef(`gift_${giftId}_out`), { kind: 'gift_out', uid: sender.uid, giftId, to: toUid, amount: body.amount, at: now });
      return { status: 200, body: { ok: true, balance: after, giftId } };
    });
  }

  // A free note: a sticker and up to 140 characters, with no Strubles.
  async sendNote(sender, body) {
    const bad = this.checkCommon(sender, body, { needAmount: false });
    if (bad) return bad;
    const now = this.now();
    const toUid = body.toUid;
    const note = body.note == null ? '' : body.note;
    return this.db.runTransaction(async (tx) => {
      const target = await tx.get(this.villageRef(toUid));
      if (!target.exists || target.data().visitable !== true) return { status: 403, body: { error: 'not_visitable' } };
      const snap = await tx.get(this.userRef(sender.uid));
      const data = snap.exists ? snap.data() : {};
      const today = Gifts.todays(data, now);
      if (today.notes >= NOTE_DAILY_LIMIT) return { status: 429, body: { error: 'limit' } };
      const noteId = crypto.randomBytes(12).toString('hex');
      tx.set(this.userRef(sender.uid), { gift_day: { ...today, notes: today.notes + 1 } }, { merge: true });
      tx.set(this.giftRef(toUid, noteId), {
        kind: 'note', status: 'note', amount: 0, stickerId: body.stickerId, note,
        fromUid: sender.uid, fromName: nameFrom(sender), createdAt: new Date(now),
      });
      return { status: 200, body: { ok: true, noteId } };
    });
  }

  // The owner collects a pending gift. The whole amount must fit under the wallet cap:
  // nothing is partly credited. A collected gift can't be collected again.
  async collect(caller, body) {
    const giftId = body && body.giftId;
    if (typeof giftId !== 'string' || !ID_RE.test(giftId)) return { status: 400, body: { error: 'bad_request' } };
    const now = this.now();
    return this.db.runTransaction(async (tx) => {
      const gift = await tx.get(this.giftRef(caller.uid, giftId));
      if (!gift.exists || gift.data().kind !== 'strubles') return { status: 404, body: { error: 'not_found' } };
      const g = gift.data();
      if (g.status !== 'pending') return { status: 409, body: { error: 'already_collected' } };
      const snap = await tx.get(this.userRef(caller.uid));
      const data = snap.exists ? snap.data() : {};
      const bal = balanceOf(data);
      const cap = this.balance.capFromData(data);
      if (bal + g.amount > cap) return { status: 409, body: { error: 'cap' } };
      const after = bal + g.amount;
      tx.set(this.userRef(caller.uid), {
        strubles_balance_v1: String(after),
        // A grant, so the account watch does not count it as a win.
        strubles_last_gain_v1: JSON.stringify({ amount: g.amount, page: null, at: now, kind: 'grant' }),
        wallet_last_op: JSON.stringify({ kind: 'gift_in', amount: g.amount, page: null, at: now, game: null, source: null }),
      }, { merge: true });
      tx.set(this.giftRef(caller.uid, giftId), { status: 'collected', collectedAt: new Date(now) }, { merge: true });
      tx.set(this.ledgerRef(`gift_${giftId}_in`), { kind: 'gift_in', uid: caller.uid, giftId, from: g.fromUid, amount: g.amount, at: now });
      return { status: 200, body: { ok: true, balance: after, applied: g.amount } };
    });
  }
}

module.exports = { Gifts, GIFT_MAX, GIFT_DAILY_LIMIT, NOTE_DAILY_LIMIT, STICKERS };
