// The site chat. Writing goes through the server, so the word filter, the rate limit and the
// ban check always run: a browser can't write a message itself (see firestore.rules). Reading
// is live in the browser: the page listens to the chat_messages collection only while the chat
// is open, so nothing polls and nothing runs when nobody is looking.
const crypto = require('crypto');
const BalanceManager = require('./balance');
const moderation = require('./moderation');
const { StrublesBoard } = require('./strubles-board');

const COLLECTION = 'chat_messages';
const TEXT_MAX = 200;
const QUOTE_MAX = 80;           // how much of the message being replied to is copied
const MIN_GAP_MS = 1500;        // between two messages from one player
const PER_MINUTE = 10;          // messages per player per minute
const KEEP_MS = 3 * 24 * 3600 * 1000;   // older messages are cleared away
const PRUNE_EVERY_MS = 10 * 60 * 1000;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

class Chat {
  constructor(db, { now = () => Date.now() } = {}) {
    this.db = db;
    this.now = now;
    this.recent = new Map();    // uid -> times of their last messages
    this.lastPrune = 0;
  }

  // Plain text: control characters and markup characters removed, spaces collapsed.
  static cleanText(raw) {
    return String(raw == null ? '' : raw).replace(/[\u0000-\u001f\u007f<>&"]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  allow(uid, now) {
    const list = (this.recent.get(uid) || []).filter((t) => now - t < 60000);
    this.recent.set(uid, list);
    if (list.length && now - list[list.length - 1] < MIN_GAP_MS) return 'slow_down';
    if (list.length >= PER_MINUTE) return 'limit';
    list.push(now);
    return null;
  }

  // who: { uid, name } from the verified sign-in. body: { text, replyTo? }.
  async send(who, body) {
    if (!body || typeof body.text !== 'string') return { status: 400, body: { error: 'bad_request' } };
    const text = Chat.cleanText(body.text);
    if (!text || text.length > TEXT_MAX) return { status: 400, body: { error: 'bad_request' } };
    if (moderation.isBlocked(text)) return { status: 400, body: { error: 'blocked_text' } };
    const replyId = body && body.replyTo;
    if (replyId != null && (typeof replyId !== 'string' || !ID_RE.test(replyId))) return { status: 400, body: { error: 'bad_reply' } };
    const now = this.now();
    if (await BalanceManager.isBanned(this.db, who.uid, now)) return { status: 403, body: { error: 'banned' } };
    const blocked = this.allow(who.uid, now);
    if (blocked) return { status: 429, body: { error: blocked } };

    // The quote comes from the stored message, never from the browser, so a reply can't
    // put words in another player's mouth.
    let replyTo = null;
    if (replyId) {
      const snap = await this.db.collection(COLLECTION).doc(replyId).get();
      if (!snap.exists) return { status: 400, body: { error: 'bad_reply' } };
      const q = snap.data();
      replyTo = { id: replyId, name: String(q.name || 'Player'), text: String(q.text || '').slice(0, QUOTE_MAX) };
    }

    const id = crypto.randomBytes(10).toString('hex');
    await this.db.collection(COLLECTION).doc(id).set({
      uid: who.uid,
      name: StrublesBoard.cleanName(who.name),
      text,
      replyTo,
      createdAt: new Date(now),
    });
    this.prune(now).catch((e) => console.error('[chat] prune failed:', e.message));
    return { status: 200, body: { ok: true, id } };
  }

  // Clears old messages, at most once every ten minutes, so the collection stays small.
  async prune(now) {
    if (now - this.lastPrune < PRUNE_EVERY_MS) return;
    this.lastPrune = now;
    const old = await this.db.collection(COLLECTION).where('createdAt', '<', new Date(now - KEEP_MS)).limit(100).get();
    for (const d of old.docs) await this.db.collection(COLLECTION).doc(d.id).delete();
  }
}

module.exports = { Chat, COLLECTION, TEXT_MAX, MIN_GAP_MS, PER_MINUTE };
