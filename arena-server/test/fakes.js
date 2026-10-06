// In-memory stand-ins for Firestore and Firebase Auth, so the real server code
// can run (and be tested) without credentials or a network.

const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

class FakeDb {
  constructor() {
    this.docs = new Map();      // "users/uid" -> data
    this.lock = Promise.resolve();
    this.failNextSets = 0;      // test hook: make the next N writes throw
    this.failAtWrite = null;    // test hook: make exactly the Nth write from now throw
  }
  ref(path) {
    const db = this;
    return {
      path,
      async get() {
        const has = db.docs.has(path);
        return { exists: has, data: () => clone(db.docs.get(path)) };
      },
      async set(data, opts) { db.write(path, data, opts); },
    };
  }
  collection(name) { return { doc: (id) => this.ref(`${name}/${id}`) }; }
  write(path, data, opts) {
    if (this.failNextSets > 0) { this.failNextSets--; throw new Error('simulated write failure'); }
    if (this.failAtWrite !== null && --this.failAtWrite === 0) { this.failAtWrite = null; throw new Error('simulated write failure'); }
    const prev = this.docs.get(path) || {};
    this.docs.set(path, opts && opts.merge ? Object.assign({}, prev, clone(data)) : clone(data));
  }
  // Serialised like a real transaction: two settling at once cannot interleave
  // their read and write, which is exactly the property the server relies on.
  runTransaction(fn) {
    const run = async () => {
      const writes = [];
      const tx = {
        get: (ref) => ref.get(),
        set: (ref, data, opts) => { writes.push([ref.path, data, opts]); },
      };
      const result = await fn(tx);
      for (const [path, data, opts] of writes) this.write(path, data, opts);
      return result;
    };
    const next = this.lock.then(run, run);
    this.lock = next.catch(() => {});
    return next;
  }
  seed(uid, data) { this.docs.set(`users/${uid}`, clone(data)); }
  balance(uid) {
    const d = this.docs.get(`users/${uid}`);
    return d ? Number(d.strubles_balance_v1 || 0) : 0;
  }
}

// Token format: "tok:<uid>" or "tok:<uid>:<display name>".
const FakeAuth = {
  async verifyIdToken(token) {
    const m = /^tok:([^:]+)(?::(.*))?$/.exec(String(token));
    if (!m) throw new Error('bad token');
    return { uid: m[1], name: m[2] };
  },
};

module.exports = { FakeDb, FakeAuth };
