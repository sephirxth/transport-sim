// ── 游戏逻辑：请求、经济、故障、难度 ──

import { Network, ArrivalEvent, CABLE_TIERS } from "./network";

export interface Request {
  id: number;
  from: number;
  to: number;
  size: number;
  deadline: number;
  maxDeadline: number;
  reward: number;
  status: "pending" | "routing" | "delivered" | "failed";
  color: number;
}

export interface Popup {
  text: string;
  color: number;
  nodeId: number;
}

export interface GameEvent {
  type: "delivery" | "timeout" | "cable_warn" | "cable_fail" | "cable_repair" | "packet_lost";
  x: number;
  y: number;
  cableId?: number;
  reward?: number;
  fast?: boolean;
}

export interface GameOutput {
  popups: Popup[];
  events: GameEvent[];
}

// ── 故障系统 ──
export interface CableFailure {
  cableId: number;
  phase: "warning" | "failed";
  timer: number;
}

const REQ_COLORS = [0x66bb6a, 0xffa726, 0xef5350, 0xab47bc, 0x29b6f6, 0xffee58];
let _rid = 0;

export class Game {
  money = 300;
  score = 0;
  requests: Request[] = [];
  delivered = 0;
  failed = 0;
  spawnTimer = 6;
  difficulty = 0;
  paused = true;

  // 故障
  failures: CableFailure[] = [];
  failureTimer = 28;   // 教程结束后 ~28s 首次故障

  update(dt: number, net: Network): GameOutput {
    const popups: Popup[] = [];
    const events: GameEvent[] = [];

    // 倒计时 & 超时
    for (const r of this.requests) {
      if (r.status !== "pending" && r.status !== "routing") continue;
      r.deadline -= dt;
      if (r.deadline <= 0) {
        r.status = "failed";
        this.failed++;
        popups.push({ text: "TIMEOUT", color: 0xef5350, nodeId: r.to });
        const node = net.getNode(r.to);
        if (node) events.push({ type: "timeout", x: node.x, y: node.y });
      }
    }

    this.requests = this.requests.filter(r => r.status === "pending" || r.status === "routing");

    if (this.paused) return { popups, events };

    // ── 故障系统 ──
    this.updateFailures(dt, net, events);

    // 生成请求
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.spawnInterval();
      const req = this.createRequest(net);
      if (req) {
        this.requests.push(req);
        const ok = net.send(req.from, req.to, req.size, req.color, req.id);
        req.status = ok ? "routing" : "pending";
      }
    }

    // pending 请求重试
    for (const r of this.requests) {
      if (r.status === "pending") {
        const ok = net.send(r.from, r.to, r.size, r.color, r.id);
        if (ok) r.status = "routing";
      }
    }

    return { popups, events };
  }

  onArrivals(events: ArrivalEvent[]): GameOutput {
    const popups: Popup[] = [];
    const gameEvents: GameEvent[] = [];

    for (const ev of events) {
      if (ev.requestId == null) continue;
      const req = this.requests.find(r => r.id === ev.requestId);
      if (!req) continue;

      // 故障导致丢包 → 回到 pending 重试
      if (ev.failed) {
        if (req.status === "routing") req.status = "pending";
        if (ev.x != null && ev.y != null) {
          gameEvents.push({ type: "packet_lost", x: ev.x, y: ev.y });
        }
        continue;
      }

      if (req.status !== "routing") continue;
      req.status = "delivered";

      const timeRatio = req.deadline / req.maxDeadline;
      const fast = timeRatio > 0.5;
      const bonus = fast ? Math.round(req.reward * 0.3) : 0;
      const total = req.reward + bonus;
      this.money += total;
      this.score += total;
      this.delivered++;
      if (this.delivered % 5 === 0) this.difficulty++;

      const label = bonus > 0 ? `+$${total} FAST!` : `+$${total}`;
      popups.push({ text: label, color: 0x66bb6a, nodeId: req.to });
      if (ev.x != null && ev.y != null) {
        gameEvents.push({ type: "delivery", x: ev.x, y: ev.y, reward: total, fast });
      }
    }
    return { popups, events: gameEvents };
  }

  // ── 故障生命周期 ──
  private updateFailures(dt: number, net: Network, events: GameEvent[]) {
    // 清理已删除 cable 的故障
    this.failures = this.failures.filter(f => {
      const cable = net.getCable(f.cableId);
      if (!cable) return false;
      return true;
    });

    // 现有故障倒计时
    for (const f of this.failures) {
      f.timer -= dt;
      if (f.timer <= 0) {
        const cable = net.getCable(f.cableId);
        if (!cable) { f.timer = -1; continue; }

        if (f.phase === "warning") {
          // 故障发生
          f.phase = "failed";
          f.timer = 18 + Math.random() * 12; // 18-30s
          cable.disabled = true;
          cable.warning = false;
          const mid = net.cableMid(cable);
          events.push({ type: "cable_fail", x: mid.x, y: mid.y, cableId: cable.id });
        } else {
          // 修复
          cable.disabled = false;
          const mid = net.cableMid(cable);
          events.push({ type: "cable_repair", x: mid.x, y: mid.y, cableId: cable.id });
          f.timer = -1; // 标记移除
        }
      }
    }
    this.failures = this.failures.filter(f => f.timer >= 0);

    // 调度新故障
    this.failureTimer -= dt;
    if (this.failureTimer <= 0) {
      const maxFail = Math.min(3, 1 + Math.floor(this.difficulty / 3));
      if (this.failures.length < maxFail && net.cables.length > 0) {
        const ok = net.cables.filter(c => !c.disabled && !c.warning);
        if (ok.length > 0) {
          const cable = ok[Math.floor(Math.random() * ok.length)];
          cable.warning = true;
          this.failures.push({ cableId: cable.id, phase: "warning", timer: 2.5 });
          const mid = net.cableMid(cable);
          events.push({ type: "cable_warn", x: mid.x, y: mid.y, cableId: cable.id });
        }
      }
      this.failureTimer = Math.max(15, 32 - this.difficulty * 2) + Math.random() * 8;
    }
  }

  private createRequest(net: Network): Request | null {
    const servers = net.nodes.filter(n => n.type === "server");
    const clients = net.nodes.filter(n => n.type === "client");
    if (!servers.length || !clients.length) return null;
    const from = servers[Math.floor(Math.random() * servers.length)];
    const to = clients[Math.floor(Math.random() * clients.length)];
    const size = Math.min(10, Math.floor(Math.random() * (3 + this.difficulty)) + 1);
    const deadline = Math.max(6, 15 - this.difficulty * 0.8);
    const reward = 15 + size * 6;
    return {
      id: ++_rid, from: from.id, to: to.id,
      size, deadline, maxDeadline: deadline, reward,
      status: "pending",
      color: REQ_COLORS[_rid % REQ_COLORS.length],
    };
  }

  private spawnInterval(): number {
    return Math.max(1.2, 3.5 - this.difficulty * 0.25 + (Math.random() - 0.5));
  }

  buyCable(tierIdx: number): boolean {
    const tier = CABLE_TIERS[tierIdx];
    if (!tier || this.money < tier.cost) return false;
    this.money -= tier.cost;
    return true;
  }

  refundCable(tierIdx: number) {
    const tier = CABLE_TIERS[tierIdx];
    if (tier) this.money += Math.floor(tier.cost * 0.5);
  }
}
