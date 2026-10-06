// Rate limiting by IP and per-connection message rate.
class RateLimit {
  constructor(opts = {}) {
    this.ipConnections = new Map(); // ip -> count
    this.connectionMessageCount = new Map(); // sessionId -> {count, resetTime}
    // Households and phones on one NAT share an address, and every page that
    // talks to the arena holds a connection, so this is deliberately more
    // generous than a single player's needs.
    this.maxConnectionsPerIP = opts.maxConnectionsPerIP || 12;
    this.maxMessagesPerSec = opts.maxMessagesPerSec || 12;
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
        this.connectionMessageCount.set(sessionId, state);
        return false;
      }
    }
    this.connectionMessageCount.set(sessionId, state);
    return true;
  }

  removeConnection(ip) {
    const count = this.ipConnections.get(ip) || 0;
    if (count > 1) {
      this.ipConnections.set(ip, count - 1);
    } else {
      this.ipConnections.delete(ip);
    }
  }

  // Per-session counters were never removed, so the map grew for the life of
  // the process, one entry per connection ever made.
  removeSession(sessionId) {
    this.connectionMessageCount.delete(sessionId);
  }
}

module.exports = RateLimit;
