class HLC {
  constructor(now, node, count = 0) {
    this.ts = now;
    this.count = count;
    this.node = node;
  }

  increment(now) {
    if (now > this.ts) {
      this.ts = now;
      this.count = 0;
      this.node = this.node;
      return { ts: now, count: 0, node: this.node };
    }

    this.count = this.count + 1;
    return { ts: this.ts, count: this.count, node: this.node };
  }

  compare(other) {
    if (this.ts == other.ts) {
      if (this.count === other.count) {
        if (this.node === other.node) {
          return 0;
        }
        return this.node < other.node ? -1 : 1;
      }
      return this.count - other.count;
    }
    return this.ts - other.ts;
  }

  receive(remote, now) {
    if (now > this.ts && now > remote.ts) {
      this.ts = now;
      this.count = 0;
      return { ts: now, count: 0, node: this.node };
    }

    if (this.ts === remote.ts) {
      this.count = Math.max(this.count, remote.count) + 1;
      return {
        ts: this.ts,
        count: this.count,
        node: this.node,
      };
    } else if (this.ts > remote.ts) {
      this.count = this.count + 1;
      return { ts: this.ts, count: this.count, node: this.node };
    } else {
      this.ts = remote.ts;
      this.count = remote.count + 1;
      return {
        ts: remote.ts,
        count: this.count,
        node: this.node,
      };
    }
  }

  toString() {
    return (
      this.ts.toString().padStart(15, "0") +
      ":" +
      this.count.toString(36).padStart(5, "0") +
      ":" +
      this.node
    );
  }

  static fromString(str) {
    const [ts, count, ...node] = str.split(":");
    return {
      ts: parseInt(ts),
      count: parseInt(count, 36),
      node: node.join(":"),
    };
  }
}

module.exports = HLC;
