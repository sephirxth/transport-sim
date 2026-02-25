# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Transport simulation game — data packets flow through network cables between nodes.
Phaser 3 + TypeScript + Vite.

## Commands

```bash
npm run dev    # 启动 dev server (localhost:5173)
npm run build  # 构建
npx tsc --noEmit  # 类型检查
```

## Architecture

- `src/network.ts` — 纯逻辑层：Network (nodes + cables + packets), BFS 路由, packet 移动
- `src/main.ts` — Phaser 场景：渲染 + 交互 (拖拽/连线/发包)

数据包大小(size 1-10) → 圆点半径；cable.speed → 流速。
