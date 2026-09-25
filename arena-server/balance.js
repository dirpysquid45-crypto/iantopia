// Server-authoritative balance management via Firestore
// Never trusts client-reported balances
class BalanceManager {
  constructor(db) {
    this.db = db;
  }

  async getBalance(userId) {
    const doc = await this.db.collection('users').doc(userId).get();
    if (!doc.exists) return 0;
    const data = doc.data();
    return Number(data.strubles_balance_v1 || 0);
  }

  async getWalletCap(userId) {
    const doc = await this.db.collection('users').doc(userId).get();
    if (!doc.exists) return 20000;
    const data = doc.data();
    const bankLevel = Number(data.tycoon_bank_level_v1 || 0);
    const invStr = data.strubles_inventory_v1 || '{}';
    let inv = {};
    try { inv = JSON.parse(invStr); } catch {}
    const taipei = (Array.isArray(inv.buildings) ? inv.buildings : []).filter(k => k === 'taipei_101').length;
    const taipeiBonus = Math.min(taipei, 5) * 10000;
    let cap = 20000;
    for (let i = 1; i <= bankLevel; i++) {
      if (i <= 3) {
        const gains = [0, 15000, 25000, 40000];
        cap += gains[i] || 0;
      } else {
        cap += 40000 * Math.pow(3, i - 3);
      }
    }
    return cap + taipeiBonus;
  }

  async deductBet(userId, amount) {
    const balance = await this.getBalance(userId);
    if (balance < amount) throw new Error('Insufficient balance');
    const newBalance = balance - amount;
    await this.db.collection('users').doc(userId).set({
      strubles_balance_v1: String(newBalance)
    }, { merge: true });
    return newBalance;
  }

  async creditPayout(userId, amount) {
    const balance = await this.getBalance(userId);
    const cap = await this.getWalletCap(userId);
    const newBalance = Math.min(balance + amount, cap);
    await this.db.collection('users').doc(userId).set({
      strubles_balance_v1: String(newBalance)
    }, { merge: true });
    return newBalance;
  }
}

module.exports = BalanceManager;
