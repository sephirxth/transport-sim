import Phaser from "phaser";
import { Network, NetNode, Cable, CABLE_TIERS } from "./network";
import { Game, GameEvent } from "./game";

// ══════════════════════════════════════════════════════════
//  美术素材清单  (搜索 [ART] 定位替换点)
// ══════════════════════════════════════════════════════════
//
//  风格: "Clean Data Center Blueprint"
//  深色背景 + 点阵网格 + 几何节点 + 发光线缆 + 粒子特效
//
//  [静态 Static Sprites]
//    assets/nodes/client.png     48x48   用户终端 (绿色调, 显示器造型)
//    assets/nodes/server.png     48x48   数据库服务器 (蓝色调, 机柜造型)
//    assets/nodes/router.png     48x48   交换机 (灰色调, 六边形造型)
//    assets/ui/panel.9.png       9-slice  UI 面板背景 (深蓝半透明)
//    assets/ui/icon_coin.png     16x16   金币图标
//    assets/ui/btn_tier_*.png    3 张    线缆选择按钮 (copper/fiber/premium)
//
//  [动画 Sprite Sheets]
//    assets/fx/spark.sheet       8帧 32x32   电火花 (线路故障/拆线)
//    assets/fx/ring_burst.sheet  6帧 64x64   冲击波环 (送达/故障)
//    assets/fx/confetti.sheet    8帧 32x32   庆祝粒子 (快速送达)
//    assets/packets/data.sheet   4帧 16x16   数据包脉冲动画
//    assets/nodes/server_led.sheet  4帧 8x8  服务器 LED 闪烁
//
//  [背景 Background]
//    assets/bg/grid_tile.png     64x64   点阵网格 (tileable)
//    assets/bg/vignette.png      全屏    暗角遮罩 (营造景深)
//    assets/bg/zone_label.png    文字贴图 "USERS" / "CORE" / "DATABASE"
//
// ══════════════════════════════════════════════════════════

// ── 调色板 ──
const PAL = {
  bg:       0x080c18,
  gridDot:  0x141e38,
  client:   0x4caf50,
  server:   0x42a5f5,
  router:   0x607d8b,
  panel:    0x0d1528,
  panelBdr: 0x1a2a40,
  text:     "#c8d6e5",
  textDim:  "#5a6a7a",
  warn:     0xff6f00,
  danger:   0xf44336,
  success:  0x4caf50,
  accent:   0x00e5ff,
};

const NODE_R = 22;
const PKT_MIN_R = 3;
const PKT_MAX_R = 14;

// ── VFX ──
interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: number; size: number;
}
interface Ring {
  x: number; y: number;
  life: number; maxLife: number; maxR: number; color: number; width: number;
}
interface FloatText {
  obj: Phaser.GameObjects.Text;
  life: number; maxLife: number; startY: number;
}

// ── 教程 ──
interface TutStep {
  text: string;
  hint: string | ((s: NetScene) => string);
  check?: (s: NetScene) => boolean;
  highlight?: (s: NetScene) => { x: number; y: number; r: number }[];
}

function buildTutorial(): TutStep[] {
  return [
    {
      text: [
        "欢迎来到 NetOps !",
        "",
        "你是一名数据中心的网络架构师",
        "用户需要从数据库获取数据",
        "你的工作：接网线，让数据顺畅传输",
      ].join("\n"),
      hint: "[ 点击继续 ]",
    },
    {
      text: [
        "认识你的网络",
        "",
        "  绿色 = User（用户终端）",
        "  蓝色 = DB（数据库服务器）",
        "  灰色 = Switch（网络交换机）",
        "",
        "User 和 DB 不能直连！",
        "必须通过 Switch 中转",
      ].join("\n"),
      hint: "[ 点击继续 ]",
      highlight: (s) => s.net.nodes.map(n => ({ x: n.x, y: n.y, r: NODE_R + 12 })),
    },
    {
      text: [
        "选择网线",
        "",
        "  Q = Copper   便宜但慢   $30",
        "  W = Fiber    均衡之选   $80",
        "  E = Premium  快速但贵   $200",
        "",
        "按 Q 选择铜线试试",
      ].join("\n"),
      hint: "[ 按 Q ]",
      check: (s) => s.tierJustSelected,
    },
    {
      text: [
        "接网线",
        "",
        "  点击一个节点",
        "  再点击另一个节点",
        "",
        "试试把 User A 连到 Switch 1",
        "（绿色光圈 = 可连接目标）",
      ].join("\n"),
      hint: "[ 连接两个节点 ]",
      check: (s) => s.net.cables.length >= 1,
      highlight: (s) => [
        { x: s.net.nodes[0].x, y: s.net.nodes[0].y, r: NODE_R + 14 },
        { x: s.net.nodes[3].x, y: s.net.nodes[3].y, r: NODE_R + 14 },
      ],
    },
    {
      text: [
        "继续接线！构建完整路径",
        "",
        "  User -> Switch -> Switch -> DB",
        "",
        "再接 3 条线",
      ].join("\n"),
      hint: (s: NetScene) => `[ 已接 ${s.net.cables.length} / 4 条 ]`,
      check: (s) => s.net.cables.length >= 4,
    },
    {
      text: [
        "管理网络",
        "",
        "  右键  拆除网线（退还 50%）",
        "  接错了随时调整",
      ].join("\n"),
      hint: "[ 点击继续 ]",
    },
    {
      text: [
        "最后!",
        "",
        "  虚线 = 等待传输的请求",
        "  圆点 = 数据包（大圆 = 大数据）",
        "  线变红 = 拥堵  线路会随机故障!",
        "",
        "  建冗余路径应对故障",
        "  快速送达有额外奖金",
      ].join("\n"),
      hint: "[ 点击开始 ]",
    },
  ];
}

// ══════════════════════════════════════
//  场景
// ══════════════════════════════════════
class NetScene extends Phaser.Scene {
  net!: Network;
  gm!: Game;
  gfx!: Phaser.GameObjects.Graphics;

  selectedTier = 0;
  cableStart: NetNode | null = null;
  tierJustSelected = false;

  // VFX
  particles: Particle[] = [];
  rings: Ring[] = [];
  floats: FloatText[] = [];
  shakeIntensity = 0;
  displayMoney = 300;

  // UI
  moneyTxt!: Phaser.GameObjects.Text;
  scoreTxt!: Phaser.GameObjects.Text;
  infoTxt!: Phaser.GameObjects.Text;
  tierTxts: Phaser.GameObjects.Text[] = [];
  reqTxts: Phaser.GameObjects.Text[] = [];
  labelCache = new Map<number, Phaser.GameObjects.Text>();
  repairCache = new Map<number, Phaser.GameObjects.Text>();
  zoneTxts: Phaser.GameObjects.Text[] = [];

  // 教程
  tutStep = 0;
  tutSteps!: TutStep[];
  tutOverlay!: Phaser.GameObjects.Rectangle;
  tutPanel!: Phaser.GameObjects.Rectangle;
  tutText!: Phaser.GameObjects.Text;
  tutHint!: Phaser.GameObjects.Text;
  tutGfx!: Phaser.GameObjects.Graphics;

  constructor() { super("net"); }

  create() {
    this.net = new Network();
    this.gm = new Game();
    this.gfx = this.add.graphics();

    this.drawBackground();
    this.buildLevel();
    this.buildUI();
    this.buildTutorialUI();
    this.setupInput();
    this.enterTutStep(0);
  }

  // ── 背景 ──
  drawBackground() {
    // [ART] 替换为: assets/bg/grid_tile.png (64x64 tileable)
    const bg = this.add.graphics().setDepth(-10);
    const w = this.scale.width, h = this.scale.height;
    const grid = 32;
    bg.fillStyle(PAL.gridDot, 0.6);
    for (let x = 0; x < w; x += grid) {
      for (let y = 0; y < h; y += grid) {
        bg.fillCircle(x, y, 0.8);
      }
    }

    // [ART] 替换为: assets/bg/vignette.png (全屏暗角)
    const v = this.add.graphics().setDepth(-5);
    v.fillStyle(0x000000, 0.3);
    v.fillRect(0, 0, w, 40);            // top bar bg
    v.fillRect(0, h - 46, w, 46);       // bottom bar bg
    v.fillStyle(0x000000, 0.15);
    v.fillRect(w - 260, 40, 260, h - 86); // right panel bg

    // [ART] 替换为: assets/bg/zone_label.png (文字贴图)
    const zoneStyle = { fontSize: "11px", fontFamily: "monospace", color: PAL.textDim };
    this.zoneTxts.push(
      this.add.text(w * 0.08, 48, "U S E R S", zoneStyle).setOrigin(0.5, 0).setDepth(-4),
      this.add.text(w * 0.45, 48, "N E T W O R K   C O R E", zoneStyle).setOrigin(0.5, 0).setDepth(-4),
      this.add.text(w * 0.88, 48, "D A T A B A S E", zoneStyle).setOrigin(0.5, 0).setDepth(-4),
    );
  }

  // ── 关卡 ──
  buildLevel() {
    const w = this.scale.width, h = this.scale.height;
    this.net.addNode(w * 0.08, h * 0.24, "User A", "client");
    this.net.addNode(w * 0.08, h * 0.50, "User B", "client");
    this.net.addNode(w * 0.08, h * 0.76, "User C", "client");
    this.net.addNode(w * 0.33, h * 0.32, "Switch 1", "router");
    this.net.addNode(w * 0.33, h * 0.68, "Switch 2", "router");
    this.net.addNode(w * 0.57, h * 0.32, "Switch 3", "router");
    this.net.addNode(w * 0.57, h * 0.68, "Switch 4", "router");
    this.net.addNode(w * 0.88, h * 0.24, "DB Alpha", "server");
    this.net.addNode(w * 0.88, h * 0.50, "DB Beta",  "server");
    this.net.addNode(w * 0.88, h * 0.76, "DB Gamma", "server");
  }

  // ── UI ──
  buildUI() {
    const s = { fontSize: "14px", fontFamily: "monospace", color: PAL.text };
    this.moneyTxt = this.add.text(16, 12, "", { ...s, fontSize: "20px" }).setDepth(100);
    this.scoreTxt = this.add.text(220, 14, "", { ...s, fontSize: "13px" }).setDepth(100);
    this.infoTxt  = this.add.text(this.scale.width / 2, 14, "", { ...s, color: PAL.textDim, fontSize: "13px" }).setOrigin(0.5, 0).setDepth(100);

    // [ART] 替换为: assets/ui/btn_tier_*.png (按钮贴图)
    const by = this.scale.height - 34;
    CABLE_TIERS.forEach((_, i) => {
      const txt = this.add.text(16 + i * 230, by, "", {
        ...s, fontSize: "13px", padding: { x: 10, y: 5 }, backgroundColor: "#0d1528",
      }).setDepth(100).setInteractive();
      txt.on("pointerdown", () => { this.selectedTier = i; this.tierJustSelected = true; });
      this.tierTxts.push(txt);
    });

    for (let i = 0; i < 6; i++) {
      this.reqTxts.push(this.add.text(this.scale.width - 245, 68 + i * 46, "", {
        ...s, fontSize: "12px", color: "#8a9ab5", lineSpacing: 3,
      }).setDepth(100));
    }
  }

  // ── 教程 ──
  buildTutorialUI() {
    this.tutSteps = buildTutorial();
    const cx = this.scale.width / 2, cy = this.scale.height / 2;
    this.tutOverlay = this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x000000, 0.55).setDepth(300);
    this.tutPanel = this.add.rectangle(cx, cy, 480, 310, PAL.panel, 1).setStrokeStyle(1, PAL.panelBdr).setDepth(301);
    this.tutText = this.add.text(cx, cy - 40, "", {
      fontSize: "15px", fontFamily: "monospace", color: PAL.text,
      align: "center", lineSpacing: 6, wordWrap: { width: 440 },
    }).setOrigin(0.5).setDepth(302);
    this.tutHint = this.add.text(cx, cy + 125, "", {
      fontSize: "13px", fontFamily: "monospace", color: PAL.textDim, align: "center",
    }).setOrigin(0.5).setDepth(302);
    this.tutGfx = this.add.graphics().setDepth(299);
  }

  enterTutStep(idx: number) {
    this.tutStep = idx;
    if (idx >= this.tutSteps.length) {
      this.tutOverlay.setVisible(false);
      this.tutPanel.setVisible(false);
      this.tutText.setVisible(false);
      this.tutHint.setVisible(false);
      this.tutGfx.clear();
      this.gm.paused = false;
      this.gm.spawnTimer = 3;
      return;
    }
    this.tutText.setText(this.tutSteps[idx].text);
    this.tutOverlay.setAlpha(this.tutSteps[idx].check ? 0.25 : 0.55);
  }

  advanceTut() {
    if (this.tutStep >= this.tutSteps.length) return;
    const step = this.tutSteps[this.tutStep];
    if (step.check && !step.check(this)) return;
    this.enterTutStep(this.tutStep + 1);
  }

  get inTutorial() { return this.tutStep < this.tutSteps.length; }

  // ── 输入 ──
  setupInput() {
    this.input.keyboard!.on("keydown-Q", () => { this.selectedTier = 0; this.tierJustSelected = true; });
    this.input.keyboard!.on("keydown-W", () => { this.selectedTier = 1; this.tierJustSelected = true; });
    this.input.keyboard!.on("keydown-E", () => { this.selectedTier = 2; this.tierJustSelected = true; });

    this.input.on("pointerdown", (ptr: Phaser.Input.Pointer) => {
      if (ptr.rightButtonDown()) return this.onRightClick(ptr);

      if (this.inTutorial) {
        const step = this.tutSteps[this.tutStep];
        if (!step.check || step.check(this)) {
          if (!this.hitNode(ptr.x, ptr.y)) { this.advanceTut(); return; }
        }
      }

      const node = this.hitNode(ptr.x, ptr.y);
      if (!node) { this.cableStart = null; return; }
      if (!this.cableStart) {
        this.cableStart = node;
      } else {
        if (this.cableStart.id !== node.id) {
          const check = this.net.canConnect(this.cableStart.id, node.id);
          if (!check.ok) {
            // 连线被拒绝
            if (check.reason) this.spawnFloat(node.x, node.y - 30, check.reason, PAL.warn);
            this.shake(2);
            this.cableStart = null;
            return;
          }
          if (this.gm.buyCable(this.selectedTier)) {
            const cable = this.net.addCable(this.cableStart.id, node.id, CABLE_TIERS[this.selectedTier]);
            if (cable) {
              const a = this.net.getNode(cable.from)!, b = this.net.getNode(cable.to)!;
              this.spawnRing((a.x + b.x) / 2, (a.y + b.y) / 2, cable.tier.color, 30, 1.5);
              this.spawnSparks(a.x, a.y, cable.tier.color, 4);
              this.spawnSparks(b.x, b.y, cable.tier.color, 4);
            }
          } else {
            this.spawnFloat(node.x, node.y - 30, "Not enough $", PAL.danger);
          }
        }
        this.cableStart = null;
      }
    });
  }

  onRightClick(ptr: Phaser.Input.Pointer) {
    const cable = this.hitCable(ptr.x, ptr.y);
    if (!cable) return;
    const mid = this.net.cableMid(cable);
    this.spawnSparks(mid.x, mid.y, PAL.danger, 6);
    const tierIdx = CABLE_TIERS.indexOf(cable.tier);
    this.net.removeCable(cable.id);
    this.gm.refundCable(tierIdx);
    const rl = this.repairCache.get(cable.id);
    if (rl) { rl.destroy(); this.repairCache.delete(cable.id); }
  }

  hitNode(x: number, y: number): NetNode | null {
    for (const n of this.net.nodes) {
      if (Math.hypot(x - n.x, y - n.y) < NODE_R + 6) return n;
    }
    return null;
  }

  hitCable(x: number, y: number): Cable | null {
    for (const c of this.net.cables) {
      const a = this.net.getNode(c.from)!, b = this.net.getNode(c.to)!;
      const p = nearestPt(a.x, a.y, b.x, b.y, x, y);
      if (Math.hypot(x - p.x, y - p.y) < 12) return c;
    }
    return null;
  }

  // ══════════════════════════════════════
  //  VFX 生成
  // ══════════════════════════════════════
  spawnSparks(cx: number, cy: number, color: number, count: number) {
    // [ART] 替换为: assets/fx/spark.sheet (粒子发射器)
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 140;
      this.particles.push({
        x: cx, y: cy, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 40,
        life: 0.3 + Math.random() * 0.5, maxLife: 0.8, color, size: 1.5 + Math.random() * 2.5,
      });
    }
  }

  spawnRing(cx: number, cy: number, color: number, maxR: number, width = 2) {
    // [ART] 替换为: assets/fx/ring_burst.sheet (帧动画)
    this.rings.push({ x: cx, y: cy, life: 0.5, maxLife: 0.5, maxR, color, width });
  }

  spawnFloat(x: number, y: number, text: string, color: number) {
    const obj = this.add.text(x, y, text, {
      fontSize: "15px", fontFamily: "monospace", fontStyle: "bold",
      color: "#" + color.toString(16).padStart(6, "0"),
      stroke: "#000", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(200);
    this.floats.push({ obj, life: 1.4, maxLife: 1.4, startY: y });
  }

  shake(intensity: number) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  // ══════════════════════════════════════
  //  主循环
  // ══════════════════════════════════════
  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs / 1000, 0.05);

    if (this.inTutorial) {
      const step = this.tutSteps[this.tutStep];
      if (step.check && step.check(this)) {
        this.time.delayedCall(400, () => {
          if (this.inTutorial && this.tutSteps[this.tutStep] === step) this.advanceTut();
        });
      }
    }

    const gOut = this.gm.update(dt, this.net);
    const arrivals = this.net.update(dt);
    const aOut = this.gm.onArrivals(arrivals);

    for (const p of [...gOut.popups, ...aOut.popups]) {
      const node = this.net.getNode(p.nodeId);
      if (node) this.spawnFloat(node.x, node.y - NODE_R - 16, p.text, p.color);
    }
    for (const ev of [...gOut.events, ...aOut.events]) this.handleEvent(ev);

    this.updateVFX(dt);

    // 屏幕震动
    if (this.shakeIntensity > 0.3) {
      this.cameras.main.setScroll(
        (Math.random() - 0.5) * this.shakeIntensity * 2,
        (Math.random() - 0.5) * this.shakeIntensity * 2,
      );
      this.shakeIntensity *= 0.87;
    } else {
      this.cameras.main.setScroll(0, 0);
      this.shakeIntensity = 0;
    }

    this.displayMoney += (this.gm.money - this.displayMoney) * Math.min(1, dt * 10);

    this.draw();
    this.drawUI();
    if (this.inTutorial) this.drawTutorial();
  }

  handleEvent(ev: GameEvent) {
    switch (ev.type) {
      case "delivery":
        this.spawnRing(ev.x, ev.y, PAL.success, 50, 2.5);
        this.spawnRing(ev.x, ev.y, 0xffffff, 25, 1);
        this.spawnSparks(ev.x, ev.y, ev.fast ? 0xffee58 : PAL.success, ev.fast ? 16 : 8);
        // [ART] 快速送达时: assets/fx/confetti.sheet
        this.shake(ev.fast ? 3 : 1.5);
        break;
      case "timeout":
        this.spawnRing(ev.x, ev.y, PAL.danger, 35, 2);
        this.shake(2);
        break;
      case "cable_fail":
        this.spawnSparks(ev.x, ev.y, PAL.warn, 20);
        this.spawnSparks(ev.x, ev.y, 0xffffff, 8);
        this.spawnRing(ev.x, ev.y, PAL.danger, 55, 3);
        this.shake(7);
        this.spawnFloat(ev.x, ev.y - 20, "CABLE DOWN!", PAL.danger);
        break;
      case "cable_repair":
        this.spawnRing(ev.x, ev.y, PAL.accent, 45, 2);
        this.spawnRing(ev.x, ev.y, 0xffffff, 22, 1);
        this.spawnSparks(ev.x, ev.y, PAL.accent, 10);
        this.spawnFloat(ev.x, ev.y - 20, "REPAIRED", PAL.accent);
        break;
      case "packet_lost":
        this.spawnSparks(ev.x, ev.y, PAL.danger, 8);
        break;
    }
  }

  updateVFX(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 90 * dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i].life -= dt;
      if (this.rings[i].life <= 0) this.rings.splice(i, 1);
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      const t = 1 - f.life / f.maxLife;
      f.obj.y = f.startY - 35 * easeOut(t);
      const sc = t < 0.12 ? t / 0.12 * 1.3 : t < 0.25 ? 1.3 - (t - 0.12) / 0.13 * 0.3 : 1;
      f.obj.setScale(sc);
      f.obj.setAlpha(t > 0.6 ? (1 - t) / 0.4 : 1);
      if (f.life <= 0) { f.obj.destroy(); this.floats.splice(i, 1); }
    }
  }

  // ══════════════════════════════════════
  //  绘制
  // ══════════════════════════════════════
  draw() {
    const g = this.gfx;
    g.clear();
    const counts = this.net.packetCountByCable();
    const now = this.time.now;

    // ── 请求虚线 ──
    for (const req of this.gm.requests) {
      const from = this.net.getNode(req.from), to = this.net.getNode(req.to);
      if (!from || !to) continue;
      const urg = 1 - req.deadline / req.maxDeadline;
      const col = urg < 0.5
        ? lerpColor(0x2e7d32, 0xf9a825, urg * 2)
        : lerpColor(0xf9a825, 0xc62828, (urg - 0.5) * 2);
      g.lineStyle(1, col, 0.35);
      dashedLine(g, from.x, from.y, to.x, to.y, 8, 6);
    }

    // ── 线缆 ──
    for (const c of this.net.cables) {
      const a = this.net.getNode(c.from)!, b = this.net.getNode(c.to)!;
      this.drawCable(g, c, a, b, counts.get(c.id) ?? 0, now);
    }

    // ── 数据包（尾迹 + 主体） ──
    for (const p of this.net.packets) {
      // [ART] 替换为: assets/packets/data.sheet (帧动画精灵)
      const cable = this.net.getCable(p.cableId);
      if (!cable) continue;
      const na = this.net.getNode(cable.from)!, nb = this.net.getNode(cable.to)!;
      const r = lerp(PKT_MIN_R, PKT_MAX_R, p.size / 10);

      // 尾迹
      for (let i = 1; i <= 3; i++) {
        const tp = p.progress - i * 0.04 * p.direction;
        if (tp < 0 || tp > 1) continue;
        g.fillStyle(p.color, 0.2 - i * 0.05);
        g.fillCircle(na.x + (nb.x - na.x) * tp, na.y + (nb.y - na.y) * tp, r * (1 - i * 0.2));
      }

      const pos = this.net.packetPos(p);
      g.fillStyle(p.color, 0.10);
      g.fillCircle(pos.x, pos.y, r + 7); // 外发光
      g.fillStyle(p.color, 0.85);
      g.fillCircle(pos.x, pos.y, r);
      g.fillStyle(0xffffff, 0.4);
      g.fillCircle(pos.x - r * 0.2, pos.y - r * 0.2, r * 0.3); // 高光
    }

    // ── 节点 ──
    for (const n of this.net.nodes) this.drawNode(g, n, now);

    // ── 连线预览 + 可连目标提示 ──
    if (this.cableStart) {
      const ptr = this.input.activePointer;
      g.lineStyle(2, CABLE_TIERS[this.selectedTier].color, 0.4);
      dashedLine(g, this.cableStart.x, this.cableStart.y, ptr.x, ptr.y, 10, 6);

      // 高亮可连接目标
      for (const n of this.net.nodes) {
        if (n === this.cableStart) continue;
        const ck = this.net.canConnect(this.cableStart.id, n.id);
        if (ck.ok) {
          const pulse = 0.3 + 0.2 * Math.sin(now / 250);
          g.lineStyle(1.5, PAL.success, pulse);
          g.strokeCircle(n.x, n.y, NODE_R + 8);
        }
      }
    }

    // ── VFX rings ──
    for (const r of this.rings) {
      const t = 1 - r.life / r.maxLife;
      g.lineStyle(r.width * (1 - t * 0.5), r.color, (1 - t) * 0.8);
      g.strokeCircle(r.x, r.y, r.maxR * easeOut(t));
    }

    // ── VFX particles ──
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      g.fillStyle(p.color, alpha * 0.9);
      g.fillCircle(p.x, p.y, p.size * (0.3 + alpha * 0.7));
    }
  }

  // ── 线缆绘制 ──
  drawCable(g: Phaser.GameObjects.Graphics, c: Cable, a: NetNode, b: NetNode, pktCount: number, now: number) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);

    if (c.disabled) {
      // 故障态：红色虚线 + 闪烁X + 修复倒计时
      g.lineStyle(c.tier.width, 0x7f1d1d, 0.5);
      dashedLine(g, a.x, a.y, b.x, b.y, 5, 7);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const xa = 0.4 + 0.4 * Math.sin(now / 180);
      g.lineStyle(2.5, PAL.danger, xa);
      g.beginPath(); g.moveTo(mx - 8, my - 8); g.lineTo(mx + 8, my + 8); g.strokePath();
      g.beginPath(); g.moveTo(mx + 8, my - 8); g.lineTo(mx - 8, my + 8); g.strokePath();
      this.showRepairTimer(c, mx, my + 16);
      return;
    }

    if (c.warning) {
      // [ART] 替换为: 警告动画 shader / 闪烁 sprite
      const on = Math.sin(now / 50) > 0;
      g.lineStyle(c.tier.width + (on ? 4 : 0), on ? PAL.warn : c.tier.color, on ? 0.8 : 0.3);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.strokePath();
      return;
    }

    const congested = pktCount > c.tier.bandwidth;

    // 拥堵光晕
    if (congested) {
      const pulse = 0.15 + 0.12 * Math.sin(now / 120);
      g.lineStyle(c.tier.width + 8, PAL.danger, pulse);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.strokePath();
    }

    // 线缆外发光
    g.lineStyle(c.tier.width + 4, c.tier.color, 0.08);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.strokePath();

    // 线缆主体
    g.lineStyle(c.tier.width, c.tier.color, congested ? 0.55 : 0.8);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.strokePath();

    // 线缆能量脉冲（空闲时也显示活力）
    if (len > 10) {
      const pulseCount = Math.max(2, Math.ceil(len / 100));
      const speed = c.tier.speed / 200;
      for (let i = 0; i < pulseCount; i++) {
        const t = ((now / 1000 * speed + i / pulseCount) % 1);
        g.fillStyle(c.tier.color, 0.25);
        g.fillCircle(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 1.5);
      }
    }
  }

  // ── 节点绘制 ──
  drawNode(g: Phaser.GameObjects.Graphics, n: NetNode, now: number) {
    const hl = n === this.cableStart;
    const col = n.type === "client" ? PAL.client : n.type === "server" ? PAL.server : PAL.router;

    // 活跃请求脉冲
    const hasReq = this.gm.requests.some(r => r.to === n.id || r.from === n.id);
    if (hasReq) {
      const pulse = 0.2 + 0.15 * Math.sin(now / 280);
      g.fillStyle(col, pulse);
      g.fillCircle(n.x, n.y, NODE_R + 12);
    }

    // 高亮环
    if (hl) {
      g.lineStyle(2, 0xffab40, 0.8);
      g.strokeCircle(n.x, n.y, NODE_R + 6);
    }

    // 按类型绘制不同形状
    if (n.type === "client") this.drawClientNode(g, n.x, n.y, col, now);
    else if (n.type === "server") this.drawServerNode(g, n.x, n.y, col, now);
    else this.drawRouterNode(g, n.x, n.y, col, now);

    // label
    this.drawNodeLabel(n);
  }

  drawClientNode(g: Phaser.GameObjects.Graphics, x: number, y: number, col: number, _now: number) {
    // [ART] 替换为: assets/nodes/client.png (48x48 monitor sprite)
    const w = 36, h = 28;
    // 阴影
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(x - w / 2 + 2, y - h / 2 + 2, w, h, 4);
    // 外壳
    g.fillStyle(darken(col, 0.35), 1);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 4);
    // 屏幕
    g.fillStyle(darken(col, 0.7), 1);
    g.fillRoundedRect(x - w / 2 + 3, y - h / 2 + 3, w - 6, h - 6, 2);
    // 屏幕高光
    g.fillStyle(col, 0.15);
    g.fillRoundedRect(x - w / 2 + 4, y - h / 2 + 4, w - 8, h - 8, 2);
    // 底座
    g.fillStyle(darken(col, 0.35), 1);
    g.fillRect(x - 3, y + h / 2, 6, 5);
    g.fillRect(x - 9, y + h / 2 + 5, 18, 3);
    // 播放图标
    g.fillStyle(col, 0.8);
    g.fillTriangle(x - 4, y - 5, x - 4, y + 5, x + 6, y);
  }

  drawServerNode(g: Phaser.GameObjects.Graphics, x: number, y: number, col: number, now: number) {
    // [ART] 替换为: assets/nodes/server.png (48x48 rack sprite)
    // [ART] LED 闪烁: assets/nodes/server_led.sheet
    const w = 30, h = 40;
    // 阴影
    g.fillStyle(0x000000, 0.3);
    g.fillRect(x - w / 2 + 2, y - h / 2 + 2, w, h);
    // 机柜外壳
    g.fillStyle(darken(col, 0.3), 1);
    g.fillRect(x - w / 2, y - h / 2, w, h);
    g.fillStyle(darken(col, 0.55), 1);
    g.fillRect(x - w / 2 + 2, y - h / 2 + 2, w - 4, h - 4);
    // 3 个硬盘槽位
    for (let i = 0; i < 3; i++) {
      const sy = y - h / 2 + 5 + i * 12;
      g.fillStyle(darken(col, 0.35), 1);
      g.fillRect(x - w / 2 + 4, sy, w - 8, 9);
      // LED（用时间偏移模拟不同步闪烁）
      const ledOn = Math.sin(now / 300 + i * 2.1) > 0;
      g.fillStyle(ledOn ? col : darken(col, 0.2), ledOn ? 0.9 : 0.4);
      g.fillCircle(x + w / 2 - 8, sy + 4.5, 2);
    }
  }

  drawRouterNode(g: Phaser.GameObjects.Graphics, x: number, y: number, col: number, _now: number) {
    // [ART] 替换为: assets/nodes/router.png (48x48 hexagon sprite)
    const r = NODE_R;
    // 阴影
    g.fillStyle(0x000000, 0.3);
    fillHex(g, x + 2, y + 2, r);
    // 外壳
    g.fillStyle(darken(col, 0.35), 1);
    fillHex(g, x, y, r);
    // 内部
    g.fillStyle(darken(col, 0.6), 1);
    fillHex(g, x, y, r - 3);
    // 内环
    g.lineStyle(1.5, col, 0.5);
    g.strokeCircle(x, y, r * 0.4);
    // 四个信号点
    g.fillStyle(col, 0.7);
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i + Math.PI / 4;
      g.fillCircle(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, 2.5);
    }
  }

  drawNodeLabel(n: NetNode) {
    let t = this.labelCache.get(n.id);
    if (!t) {
      t = this.add.text(0, 0, n.label, {
        fontSize: "10px", color: PAL.text, fontFamily: "monospace", align: "center",
      }).setOrigin(0.5).setDepth(50);
      this.labelCache.set(n.id, t);
    }
    // server 更高，label 下移
    const offset = n.type === "server" ? 28 : n.type === "client" ? 26 : 24;
    t.setPosition(n.x, n.y + offset);
  }

  showRepairTimer(c: Cable, x: number, y: number) {
    const failure = this.gm.failures.find(f => f.cableId === c.id && f.phase === "failed");
    let t = this.repairCache.get(c.id);
    if (!failure) {
      if (t) t.setVisible(false);
      return;
    }
    if (!t) {
      t = this.add.text(0, 0, "", {
        fontSize: "10px", fontFamily: "monospace", color: "#ef5350", align: "center",
        stroke: "#000", strokeThickness: 2,
      }).setOrigin(0.5).setDepth(60);
      this.repairCache.set(c.id, t);
    }
    t.setPosition(x, y).setText(`${Math.ceil(failure.timer)}s`).setVisible(true);
  }

  // ── 教程 ──
  drawTutorial() {
    const step = this.tutSteps[this.tutStep];
    if (!step) return;
    this.tutGfx.clear();
    if (step.highlight) {
      const areas = step.highlight(this);
      const pulse = 0.5 + 0.3 * Math.sin(this.time.now / 250);
      for (const a of areas) {
        this.tutGfx.lineStyle(2, 0xffab40, pulse);
        this.tutGfx.strokeCircle(a.x, a.y, a.r);
      }
    }
    const hint = typeof step.hint === "function" ? step.hint(this) : step.hint;
    this.tutHint.setText(hint).setAlpha(0.5 + 0.3 * Math.sin(this.time.now / 400));
  }

  // ── UI ──
  drawUI() {
    const dm = Math.round(this.displayMoney);
    // [ART] 替换为: assets/ui/icon_coin.png + 数字
    this.moneyTxt.setText(`$ ${dm}`);
    this.moneyTxt.setColor(dm < 50 ? "#ef5350" : "#66bb6a");

    this.scoreTxt.setText(`Score ${this.gm.score}  |  OK ${this.gm.delivered}  Fail ${this.gm.failed}`);

    this.infoTxt.setText(
      this.cableStart
        ? "Click target node  |  Green = valid target"
        : "Click node to start cable  |  Right-click cable to remove"
    );

    CABLE_TIERS.forEach((t, i) => {
      const sel = i === this.selectedTier;
      const key = ["Q", "W", "E"][i];
      this.tierTxts[i].setText(`[${key}] ${t.name}  $${t.cost}  spd ${t.speed}`);
      this.tierTxts[i].setBackgroundColor(sel ? "#1a2a4e" : "#0d1528");
      this.tierTxts[i].setColor(sel ? "#" + t.color.toString(16).padStart(6, "0") : "#5a6a7a");
    });

    const reqs = this.gm.requests.slice(0, this.reqTxts.length);
    for (let i = 0; i < this.reqTxts.length; i++) {
      const txt = this.reqTxts[i];
      if (i >= reqs.length) { txt.setText(""); continue; }
      const r = reqs[i];
      const from = this.net.getNode(r.from), to = this.net.getNode(r.to);
      if (!from || !to) { txt.setText(""); continue; }
      const bar = deadlineBar(r.deadline, r.maxDeadline, 10);
      const st = r.status === "pending" ? " !" : "";
      txt.setText(`${from.label} > ${to.label}\n${bar} ${r.deadline.toFixed(1)}s $${r.reward}${st}`);
      const urg = 1 - r.deadline / r.maxDeadline;
      txt.setColor(urg > 0.7 ? "#ef5350" : urg > 0.4 ? "#ffa726" : "#8a9ab5");
    }
  }
}

// ══════════════════════════════════════
//  工具函数
// ══════════════════════════════════════
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function easeOut(t: number) { return 1 - (1 - t) * (1 - t); }

function lerpColor(c1: number, c2: number, t: number): number {
  return (
    (Math.round(lerp((c1 >> 16) & 0xff, (c2 >> 16) & 0xff, t)) << 16) |
    (Math.round(lerp((c1 >> 8) & 0xff, (c2 >> 8) & 0xff, t)) << 8) |
    Math.round(lerp(c1 & 0xff, c2 & 0xff, t))
  );
}

function darken(c: number, f: number): number {
  return (
    (Math.round(((c >> 16) & 0xff) * f) << 16) |
    (Math.round(((c >> 8) & 0xff) * f) << 8) |
    Math.round((c & 0xff) * f)
  );
}

function deadlineBar(cur: number, max: number, len: number): string {
  const f = Math.max(0, Math.round((cur / max) * len));
  return "\u2588".repeat(f) + "\u2591".repeat(Math.max(0, len - f));
}

function dashedLine(
  g: Phaser.GameObjects.Graphics,
  x1: number, y1: number, x2: number, y2: number, dash: number, gap: number,
) {
  const dx = x2 - x1, dy = y2 - y1, dist = Math.hypot(dx, dy);
  if (dist < 1) return;
  const nx = dx / dist, ny = dy / dist;
  let d = 0, on = true;
  g.beginPath(); g.moveTo(x1, y1);
  while (d < dist) {
    const end = Math.min(d + (on ? dash : gap), dist);
    const ex = x1 + nx * end, ey = y1 + ny * end;
    if (on) g.lineTo(ex, ey); else g.moveTo(ex, ey);
    d = end; on = !on;
  }
  g.strokePath();
}

function fillHex(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a);
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
  g.fillPath();
}

function nearestPt(
  x1: number, y1: number, x2: number, y2: number, px: number, py: number,
): { x: number; y: number } {
  const dx = x2 - x1, dy = y2 - y1, ls = dx * dx + dy * dy;
  if (ls === 0) return { x: x1, y: y1 };
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / ls));
  return { x: x1 + t * dx, y: y1 + t * dy };
}

// ── 启动 ──
new Phaser.Game({
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: PAL.bg,
  scene: NetScene,
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { mouse: { preventDefaultWheel: false } },
  banner: false,
});
