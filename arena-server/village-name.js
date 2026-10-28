// A village's name, set through the server so the word filter always runs. The name is
// stored as village_name on the player's user document, a server-owned field (see
// firestore.rules), so a browser can't write a name that skipped the filter.
const moderation = require('./moderation');

const NAME_MAX = 24;

class VillageNames {
  constructor(db) {
    this.db = db;
  }

  async setName(who, body) {
    const raw = body && body.name;
    if (typeof raw !== 'string') return { status: 400, body: { error: 'bad_request' } };
    const name = raw.replace(/[\u0000-\u001f<>&"]/g, '').trim().slice(0, NAME_MAX);
    if (!name) return { status: 400, body: { error: 'empty' } };
    if (moderation.isBlocked(name)) return { status: 400, body: { error: 'blocked_text' } };
    await this.db.collection('users').doc(who.uid).set({ village_name: name }, { merge: true });
    return { status: 200, body: { ok: true, name } };
  }
}

module.exports = { VillageNames, NAME_MAX };
