// Rate limiting by IP and per-connection message rate
class RateLimit {
  constructor() {
    this.ipConnections = new Map(); // ip -> count
    this.connectionMessageCount = new Map(); // sessionId -> {count, resetTime}
    this.maxConnectionsPerIP = 5;
    this.maxMessagesPerSec = 10;
    this.windowMs = 1000;
  }

  isLimited(ip) {
    const count = this.ipConnections.get(ip) || 0;
    if (count >= this.maxConnectionsPerIP) return true;
    this.ipConnections.set(ip, count + 1);
    return false;
  }

  allowMessage(sessionId) {
    const now = Date.now();
    const state = this.connectionMessageCount.get(sessionId) || { count: 0, resetTime: now + this.windowMs };

    if (now >= state.resetTime) {
      state.count = 1;
      state.resetTime = now + this.windowMs;
    } else {
      state.count++;
      if (state.count > this.maxMessagesPerSec) {
        return false;
      }
    }
    this.connectionMessageCount.set(sessionId, state);
    return true;
  }
}

module.exports = RateLimit;
