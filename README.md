# NetOps

A data center network routing puzzle game. Build cable infrastructure, route data packets, and keep your network profitable as traffic scales up.

**[Play Now →](https://transport-sim-xi.vercel.app)**

## Gameplay

You manage a virtual data center network. Clients generate data requests that must reach servers through your cable infrastructure. Route packets through switches, upgrade cables to handle congestion, and repair failures — all while staying profitable.

### Core Mechanics

- **Build networks** — Purchase and lay cables between nodes (clients → switches → servers). Three cable tiers with different speed/bandwidth/cost tradeoffs.
- **Route packets** — Packets auto-route via BFS pathfinding. Congestion on shared cables reduces throughput proportionally.
- **Manage failures** — Cables degrade and fail after warnings, disabling them for 18–30 seconds. Lost packets return to pending status for retry.
- **Scale under pressure** — Difficulty increases every 5 deliveries: faster spawn rates, tighter deadlines, larger packets, more cable failures.

### Cable Tiers

| Tier | Speed | Bandwidth | Cost |
|------|-------|-----------|------|
| Copper | Baseline | 1 packet/cycle | Low |
| Fiber | Fast | Higher throughput | Medium |
| Premium | Fastest | Highest capacity | High |

### Economy

- Start with $300
- Earn rewards per delivery: base $15 + $6 × packet size
- 30% bonus for fast deliveries (>50% time remaining)
- Failed cables sell for 50% refund

## When to Use This

- Teaching networking concepts (routing, congestion, failure handling)
- Quick browser game for network engineers who want to unwind
- Game jam inspiration for simulation/tycoon mechanics
- Phaser 3 + TypeScript project reference

## Quick Start

```bash
npm install
npm run dev
# → http://localhost:5173
```

### Build for Production

```bash
npm run build
# Output in dist/
```

## Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| Phaser | 3.90.0 | Game framework |
| TypeScript | 5.9.3 | Type-safe game logic |
| Vite | 7.3.1 | Build tool & dev server |

## Project Structure

```
src/
├── main.ts       # Phaser game initialization
├── game.ts       # Main scene: UI, economy, player interaction
└── network.ts    # Network simulation: nodes, cables, packets, pathfinding
```

## License

ISC
