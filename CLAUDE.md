# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Prompt Battles** is an LLM-powered tank battle game where players write natural language prompts that get converted to JavaScript AI controller code, which then runs in real-time battles. The LLM runs entirely in-browser using WebGPU.

## Commands

```bash
npm run dev      # Start Vite dev server on port 1420
npm run build    # TypeScript check + production build
npm run preview  # Preview production build
npm run tauri    # Tauri desktop app commands
```

## Architecture

### Tech Stack
- **Phaser 3** + Matter.js physics (top-down 2D arena)
- **React 19** for UI screens (home, download, editor)
- **WebLLM** (@mlc-ai/web-llm) for in-browser LLM inference via WebGPU
- **Vite** for dev server and builds
- **TypeScript** with strict mode

### Core Flow

```
React UI (main.tsx)
    ↓
PromptEditorScreen → LLMService.generateBehavior(prompt)
    ↓                        ↓
    ↓              WebLLMProvider → CodeValidator
    ↓                        ↓
    ↓              TankBehavior { code, strategy, isValid }
    ↓
BattleScene.init({ behaviors })
    ↓
Per frame: TankBrain.execute() → TankAPI → Tank entity
```

### Key Modules

**`src/main.tsx`** - React-Phaser bridge. Manages game lifecycle, creates/destroys Phaser instance, handles screen transitions via custom window events.

**`src/ui/`** - React UI layer with Newgrounds-style retro aesthetics. PromptEditorScreen is where players configure their tank AI.

**`src/scenes/BattleScene.ts`** - Main game loop. Spawns 4 tanks, runs AI each frame via TankBrain, handles hitscan weapons and collision, manages HUD and victory conditions.

**`src/llm/`** - LLM integration:
- `WebLLMProvider` - WebGPU-based inference, default model: Qwen2.5-Coder-1.5B
- `LLMService` - High-level API with auto-retry on validation failure
- `PromptBuilder` - System prompt defining Tank API spec
- `CodeValidator` - Security checks, syntax validation, code cleaning

**`src/sandbox/TankBrain.ts`** - Executes LLM-generated code safely. Compiles via `new Function()`, wraps Tank methods in TankAPI with try-catch.

**`src/entities/Tank.ts`** - Tank physics, movement, turret control, health, firing.

### Tank API (available to generated code)

```javascript
// Sensors
tank.getPosition()      // { x, y }
tank.getHealth()        // 0-100
tank.getHeading()       // degrees
tank.getNearestEnemy()  // { id, position, distance, bearing, health } | null
tank.getEnemies()       // array of enemies
tank.canFire()          // boolean

// Actions
tank.move(speed)        // -1 to 1
tank.turn(rate)         // -1 to 1
tank.aimAt(point)       // { x, y }
tank.fire()             // boolean
```

### Security Model

Generated code runs in a sandboxed environment:
- Only `tank.*` methods exposed via TankAPI
- Forbidden patterns blocked: `eval`, `Function`, `fetch`, `window`, `document`, `require`, `import`
- All API calls wrapped in try-catch
- Code cleaned of markdown/function wrappers before execution

### React-Phaser Communication

```javascript
// Phaser → React (in BattleScene)
window.dispatchEvent(new CustomEvent('phaserEvent', { detail: 'backToMenu' }));

// React listens in main.tsx
window.addEventListener('phaserEvent', handlePhaserEvent);
```

### State Management

- Behaviors (`Map<number, TankBehavior>`) managed in `main.tsx`, passed to both React UI and Phaser
- Player only configures Tank 0 (blue); other tanks use default AI
- Behaviors persist across battle → editor transitions
