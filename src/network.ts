// ── 网络拓扑 + 数据包模拟（纯逻辑，无 Phaser 依赖） ──

export type NodeType = "client" | "server" | "router";

export interface NetNode {
  id: number;
  x: number;
  y: number;
  label: string;
  type: NodeType;
}

export interface CableTier {
  name: string;
  speed: number;
  bandwidth: number;
  cost: number;
  color: number;
  width: number;
}

export const CABLE_TIERS: CableTier[] = [
  { name: "Copper",  speed: 120, bandwidth: 2, cost: 30,  color: 0x8d6e63, width: 2 },
  { name: "Fiber",   speed: 260, bandwidth: 5, cost: 80,  color: 0x00bcd4, width: 3 },
  { name: "Premium", speed: 420, bandwidth: 9, cost: 200, color: 0xffd54f, width: 4 },
];

export interface Cable {
  id: number;
  from: number;
  to: number;
  tier: CableTier;
  disabled: boolean;
  warning: boolean;
}

export interface Packet {
  id: number;
  cableId: number;
  direction: 1 | -1;
  progress: number;
  size: number;
  color: number;
  requestId?: number;
  _route?: number[];
  _hop?: number;
}

export interface ArrivalEvent {
  requestId?: number;
  nodeId: number;
  failed?: boolean;
  x?: number;
  y?: number;
}

let _uid = 0;
const uid = () => ++_uid;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class Network {
  nodes: NetNode[] = [];
  cables: Cable[] = [];
  packets: Packet[] = [];

  addNode(x: number, y: number, label: string, type: NodeType): NetNode {
    const n: NetNode = { id: uid(), x, y, label, type };
    this.nodes.push(n);
    return n;
  }

  /** 检查两个节点是否可以连线 */
  canConnect(fromId: number, toId: number): { ok: boolean; reason?: string } {
    const a = this.getNode(fromId), b = this.getNode(toId);
    if (!a || !b || a.id === b.id) return { ok: false };
    // 禁止 Client ↔ Server 直连
    if ((a.type === "client" && b.type === "server") ||
        (a.type === "server" && b.type === "client"))
      return { ok: false, reason: "Must route through Switch!" };
    // 禁止同类型直连（router 除外）
    if (a.type === b.type && a.type !== "router")
      return { ok: false, reason: "Can't connect same type!" };
    // 重复
    const dup = this.cables.some(
      c => (c.from === fromId && c.to === toId) || (c.from === toId && c.to === fromId)
    );
    if (dup) return { ok: false, reason: "Already connected!" };
    return { ok: true };
  }

  addCable(fromId: number, toId: number, tier: CableTier): Cable | null {
    const check = this.canConnect(fromId, toId);
    if (!check.ok) return null;
    const cable: Cable = { id: uid(), from: fromId, to: toId, tier, disabled: false, warning: false };
    this.cables.push(cable);
    return cable;
  }

  removeCable(cableId: number): CableTier | null {
    const idx = this.cables.findIndex(c => c.id === cableId);
    if (idx < 0) return null;
    const tier = this.cables[idx].tier;
    this.packets = this.packets.filter(p => p.cableId !== cableId);
    this.cables.splice(idx, 1);
    return tier;
  }

  getNode(id: number) { return this.nodes.find(n => n.id === id); }
  getCable(id: number) { return this.cables.find(c => c.id === id); }

  cableLen(c: Cable): number {
    const a = this.getNode(c.from)!, b = this.getNode(c.to)!;
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  cableMid(c: Cable): { x: number; y: number } {
    const a = this.getNode(c.from)!, b = this.getNode(c.to)!;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /** BFS 最短路（跳过 disabled） */
  findPath(from: number, to: number): number[] | null {
    if (from === to) return [from];
    const adj = new Map<number, number[]>();
    for (const n of this.nodes) adj.set(n.id, []);
    for (const c of this.cables) {
      if (c.disabled) continue; // 跳过故障线路
      adj.get(c.from)!.push(c.to);
      adj.get(c.to)!.push(c.from);
    }
    const visited = new Set([from]);
    const parent = new Map<number, number>();
    const q = [from];
    while (q.length) {
      const cur = q.shift()!;
      for (const nb of adj.get(cur) ?? []) {
        if (visited.has(nb)) continue;
        visited.add(nb);
        parent.set(nb, cur);
        if (nb === to) {
          const path: number[] = [];
          let n = to;
          while (n !== from) { path.unshift(n); n = parent.get(n)!; }
          path.unshift(from);
          return path;
        }
        q.push(nb);
      }
    }
    return null;
  }

  send(fromId: number, toId: number, size: number, color: number, requestId?: number): boolean {
    const path = this.findPath(fromId, toId);
    if (!path || path.length < 2) return false;
    const a = path[0], b = path[1];
    const cable = this.cables.find(
      c => !c.disabled && ((c.from === a && c.to === b) || (c.from === b && c.to === a))
    );
    if (!cable) return false;
    const dir: 1 | -1 = cable.from === a ? 1 : -1;
    this.packets.push({
      id: uid(), cableId: cable.id, direction: dir,
      progress: dir === 1 ? 0 : 1,
      size, color, requestId,
      _route: path, _hop: 1,
    });
    return true;
  }

  packetCountByCable(): Map<number, number> {
    const m = new Map<number, number>();
    for (const p of this.packets) m.set(p.cableId, (m.get(p.cableId) ?? 0) + 1);
    return m;
  }

  update(dt: number): ArrivalEvent[] {
    const counts = this.packetCountByCable();
    const arrivals: ArrivalEvent[] = [];
    const remove: Packet[] = [];

    // 故障线路上的 packet 被摧毁
    for (const p of this.packets) {
      const cable = this.getCable(p.cableId);
      if (cable && cable.disabled) {
        const pos = this.packetPos(p);
        arrivals.push({ requestId: p.requestId, nodeId: -1, failed: true, x: pos.x, y: pos.y });
        remove.push(p);
      }
    }

    for (const p of this.packets) {
      if (remove.includes(p)) continue;
      const cable = this.getCable(p.cableId);
      if (!cable) { remove.push(p); continue; }
      const len = this.cableLen(cable);
      if (len < 1) { remove.push(p); continue; }

      const count = counts.get(cable.id) ?? 1;
      const speedMul = count > cable.tier.bandwidth ? cable.tier.bandwidth / count : 1;
      const step = (cable.tier.speed * speedMul * dt) / len;
      p.progress += step * p.direction;

      if (p.progress >= 1 || p.progress <= 0) {
        p.progress = clamp(p.progress, 0, 1);
        const arrivedAt = p.direction === 1 ? cable.to : cable.from;
        const route = p._route;
        const hop = p._hop;
        if (route && hop != null && hop < route.length - 1) {
          const nextId = route[hop + 1];
          const nextCable = this.cables.find(
            c => !c.disabled &&
              ((c.from === arrivedAt && c.to === nextId) || (c.from === nextId && c.to === arrivedAt))
          );
          if (nextCable) {
            p.cableId = nextCable.id;
            p.direction = nextCable.from === arrivedAt ? 1 : -1;
            p.progress = p.direction === 1 ? 0 : 1;
            p._hop = hop + 1;
            continue;
          }
        }
        const node = this.getNode(arrivedAt);
        arrivals.push({ requestId: p.requestId, nodeId: arrivedAt, x: node?.x, y: node?.y });
        remove.push(p);
      }
    }

    for (const p of remove) {
      const i = this.packets.indexOf(p);
      if (i >= 0) this.packets.splice(i, 1);
    }
    return arrivals;
  }

  packetPos(p: Packet): { x: number; y: number } {
    const cable = this.getCable(p.cableId);
    if (!cable) return { x: 0, y: 0 };
    const a = this.getNode(cable.from)!, b = this.getNode(cable.to)!;
    return {
      x: a.x + (b.x - a.x) * p.progress,
      y: a.y + (b.y - a.y) * p.progress,
    };
  }
}
