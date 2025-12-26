import Phaser from 'phaser';
import { Tank } from '../entities/Tank';
import { DEFAULT_BATTLE_CONFIG, EnemyInfo, Point, SensorConfig } from '../types/game';
import { TankBrain, TraceEntry } from '../sandbox/TankBrain';
import { TankBehavior } from '../llm/types';

// Tank colors for different players
const TANK_COLORS = [
  0x4a90d9, // Blue
  0xd94a4a, // Red
  0x4ad94a, // Green
  0xd9d94a, // Yellow
  0xd94ad9, // Magenta
  0x4ad9d9, // Cyan
  0xd9944a, // Orange
  0x944ad9, // Purple
];

export class BattleScene extends Phaser.Scene {
  private tanks: Tank[] = [];
  private tankBrains: Map<string, TankBrain> = new Map();
  private behaviors: (TankBehavior | null)[] = [];
  private battleTimer: number = 0;
  private isGameOver: boolean = false;
  private isPaused: boolean = false;
  private timerEvent?: Phaser.Time.TimerEvent;
  private tracerGraphics!: Phaser.GameObjects.Graphics;
  private sensorGraphics!: Phaser.GameObjects.Graphics;

  // HUD elements
  private timerText!: Phaser.GameObjects.Text;
  private healthBars: Map<string, Phaser.GameObjects.Graphics> = new Map();
  private pauseButton!: Phaser.GameObjects.Container;
  private pauseMenu!: Phaser.GameObjects.Container;

  // Code display panel
  private codePanel!: Phaser.GameObjects.Container;
  private codeText!: Phaser.GameObjects.Text;
  private codePanelBg!: Phaser.GameObjects.Rectangle;
  private panelPreviewGraphics!: Phaser.GameObjects.Graphics;
  private scrollContainer!: Phaser.GameObjects.Container;
  private scrollY: number = 0;
  private maxScrollY: number = 0;
  private panelContentHeight: number = 0;

  constructor() {
    super({ key: 'BattleScene' });
  }

  init(data: { behaviors?: (TankBehavior | null)[] }): void {
    // Receive behaviors from PromptEditorScene
    this.behaviors = data.behaviors || [];
  }

  create(): void {
    // Reset all state
    this.tanks = [];
    this.tankBrains = new Map();
    this.healthBars = new Map();
    this.isGameOver = false;
    this.isPaused = false;
    this.battleTimer = DEFAULT_BATTLE_CONFIG.battleDuration;

    // Create sensor visualization graphics (below tanks)
    this.sensorGraphics = this.add.graphics();
    this.sensorGraphics.setDepth(-5);

    // Create tracer graphics for hitscan visuals
    this.tracerGraphics = this.add.graphics();
    this.tracerGraphics.setDepth(50);

    // Create arena walls
    this.createArena();

    // Spawn tanks
    this.spawnTanks(DEFAULT_BATTLE_CONFIG.tankCount);

    // Set up collision handling
    this.setupCollisions();

    // Create HUD
    this.createHUD();

    // Create pause button and menu
    this.createPauseButton();
    this.createPauseMenu();

    // Keyboard shortcut for pause (Escape key)
    this.input.keyboard?.on('keydown-ESC', () => this.togglePause());

    // Create code display panel
    this.createCodePanel();

    // Listen for tank deaths (use once pattern or remove old listener first)
    this.events.off('tankDeath', this.onTankDeath, this);
    this.events.on('tankDeath', this.onTankDeath, this);

    // Start battle timer
    if (this.timerEvent) {
      this.timerEvent.destroy();
    }
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      callback: this.updateTimer,
      callbackScope: this,
      loop: true,
    });
  }

  shutdown(): void {
    // Clean up event listeners
    this.events.off('tankDeath', this.onTankDeath, this);
    if (this.timerEvent) {
      this.timerEvent.destroy();
    }
  }

  update(_time: number, delta: number): void {
    if (this.isGameOver || this.isPaused) return;

    // Clear graphics from previous frame
    this.tracerGraphics.clear();
    this.sensorGraphics.clear();

    // Update all tanks (create a copy to avoid modification during iteration)
    const activeTanks = this.tanks.filter(t => t.active && !t.isDead() && t.body);
    for (const tank of activeTanks) {
      // Run tank AI - use TankBrain if available, otherwise fallback
      const brain = this.tankBrains.get(tank.tankId);
      if (brain && brain.isValid()) {
        brain.execute();
      } else {
        this.runTankAI(tank);
      }

      // Update tank physics
      tank.update(delta);

      // Wrap tank position (toroidal arena)
      this.wrapPosition(tank);

      // Check for firing - use hitscan
      const fireResult = tank.consumeFire();
      if (fireResult.fired) {
        this.fireHitscan(tank, fireResult.position, fireResult.angle);
      }
    }

    // Draw sensor cones and gun range for player's tank (tank-0)
    const playerTank = this.tanks.find(t => t.tankId === 'tank-0' && !t.isDead());
    if (playerTank) {
      this.drawTankSensors(playerTank);
    }

    // Update health bars
    this.updateHealthBars();

    // Update code panel
    this.updateCodePanel();

    // Check win condition
    this.checkWinCondition();
  }

  private createArena(): void {
    const { arenaWidth, arenaHeight } = DEFAULT_BATTLE_CONFIG;

    // No physical walls - arena wraps around (toroidal space)

    // Draw arena background
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a2e);
    bg.fillRect(0, 0, arenaWidth, arenaHeight);

    // Draw grid pattern
    bg.lineStyle(1, 0x2a2a4e, 0.5);
    const gridSize = 50;
    for (let x = 0; x <= arenaWidth; x += gridSize) {
      bg.lineBetween(x, 0, x, arenaHeight);
    }
    for (let y = 0; y <= arenaHeight; y += gridSize) {
      bg.lineBetween(0, y, arenaWidth, y);
    }

    // Draw wrap-around edge indicators (dashed lines to show infinite wrap)
    bg.lineStyle(2, 0x4a90d9, 0.4);
    const dashLength = 10;
    const gapLength = 10;

    // Top and bottom edges
    for (let x = 0; x < arenaWidth; x += dashLength + gapLength) {
      bg.lineBetween(x, 0, Math.min(x + dashLength, arenaWidth), 0);
      bg.lineBetween(x, arenaHeight, Math.min(x + dashLength, arenaWidth), arenaHeight);
    }
    // Left and right edges
    for (let y = 0; y < arenaHeight; y += dashLength + gapLength) {
      bg.lineBetween(0, y, 0, Math.min(y + dashLength, arenaHeight));
      bg.lineBetween(arenaWidth, y, arenaWidth, Math.min(y + dashLength, arenaHeight));
    }

    bg.setDepth(-10);
  }

  private spawnTanks(count: number): void {
    const { arenaWidth, arenaHeight } = DEFAULT_BATTLE_CONFIG;
    const margin = 80;

    // Generate spawn positions
    const positions = [
      { x: margin, y: margin },
      { x: arenaWidth - margin, y: margin },
      { x: margin, y: arenaHeight - margin },
      { x: arenaWidth - margin, y: arenaHeight - margin },
      { x: arenaWidth / 2, y: margin },
      { x: arenaWidth / 2, y: arenaHeight - margin },
      { x: margin, y: arenaHeight / 2 },
      { x: arenaWidth - margin, y: arenaHeight / 2 },
    ];

    for (let i = 0; i < Math.min(count, positions.length); i++) {
      const pos = positions[i];
      const tank = new Tank(
        this,
        pos.x,
        pos.y,
        `tank-${i}`,
        TANK_COLORS[i % TANK_COLORS.length]
      );

      // Face center
      const angle = Phaser.Math.Angle.Between(
        pos.x,
        pos.y,
        arenaWidth / 2,
        arenaHeight / 2
      );
      tank.setRotation(angle);

      this.tanks.push(tank);

      // Create TankBrain if we have a behavior for this tank
      const behavior = this.behaviors[i];
      if (behavior && behavior.isValid && behavior.code) {
        const brain = new TankBrain(
          tank,
          behavior.code,
          () => this.getEnemiesFor(tank)
        );
        this.tankBrains.set(tank.tankId, brain);
        console.log(`Tank ${i} using LLM behavior: ${behavior.strategy}`);
      } else {
        console.log(`Tank ${i} using default AI`);
      }
    }
  }

  private setupCollisions(): void {
    // No wall collisions needed - arena wraps around
    // Tank-tank collisions are handled by Matter.js physics automatically
  }

  /**
   * Wrap a tank's position when it goes off the edge (toroidal space)
   */
  private wrapPosition(tank: Tank): void {
    // Safety check - tank may have been destroyed
    if (!tank || !tank.body || !tank.active) return;

    const { arenaWidth, arenaHeight } = DEFAULT_BATTLE_CONFIG;
    let x: number, y: number;

    try {
      x = tank.x;
      y = tank.y;
    } catch {
      return; // Tank body was destroyed mid-frame
    }
    let wrapped = false;

    // Wrap horizontally
    if (x < 0) {
      x = arenaWidth + x;
      wrapped = true;
    } else if (x > arenaWidth) {
      x = x - arenaWidth;
      wrapped = true;
    }

    // Wrap vertically
    if (y < 0) {
      y = arenaHeight + y;
      wrapped = true;
    } else if (y > arenaHeight) {
      y = y - arenaHeight;
      wrapped = true;
    }

    if (wrapped) {
      tank.setPosition(x, y);
    }
  }

  // Hitscan weapon system - instant hit detection (with wrap-around support)
  private fireHitscan(shooter: Tank, startPos: Point, angle: number): void {
    // Safety check
    if (!shooter || !shooter.active || shooter.isDead()) return;

    const { arenaWidth, arenaHeight } = DEFAULT_BATTLE_CONFIG;
    const gunRange = shooter.getGunRange();

    // Calculate end point of the ray at gun range
    const endX = startPos.x + Math.cos(angle) * gunRange;
    const endY = startPos.y + Math.sin(angle) * gunRange;

    // Find the closest hit (check both direct and wrapped positions)
    let closestHit: { tank: Tank; distance: number; point: Point } | null = null;

    // Check against all enemy tanks (including wrapped positions)
    for (const tank of this.tanks) {
      if (tank.tankId === shooter.tankId || tank.isDead() || !tank.active) continue;

      // Get all possible wrapped positions of this tank
      const wrappedPositions = this.getWrappedPositions({ x: tank.x, y: tank.y }, arenaWidth, arenaHeight);
      const tankRadius = 24; // Half of tank width

      for (const pos of wrappedPositions) {
        const hit = this.lineCircleIntersection(
          startPos,
          { x: endX, y: endY },
          pos,
          tankRadius
        );

        if (hit) {
          const distance = Phaser.Math.Distance.Between(startPos.x, startPos.y, hit.x, hit.y);
          if (distance <= gunRange && (!closestHit || distance < closestHit.distance)) {
            closestHit = { tank, distance, point: hit };
          }
        }
      }
    }

    // Determine final hit point
    let finalHitPoint: Point;
    let hitTank: Tank | null = null;

    if (closestHit) {
      finalHitPoint = closestHit.point;
      hitTank = closestHit.tank;
    } else {
      // No hit - tracer goes to gun range (may go off screen, that's ok)
      finalHitPoint = { x: endX, y: endY };
    }

    // Draw tracer line
    const shooterColor = shooter.getColor();
    this.tracerGraphics.lineStyle(2, shooterColor, 0.8);
    this.tracerGraphics.lineBetween(startPos.x, startPos.y, finalHitPoint.x, finalHitPoint.y);

    // Draw impact point
    this.tracerGraphics.fillStyle(0xffff00, 1);
    this.tracerGraphics.fillCircle(finalHitPoint.x, finalHitPoint.y, 4);

    // Apply damage if hit a tank
    if (hitTank) {
      hitTank.takeDamage(shooter.stats.projectileDamage);

      // Impact effect - red for damage
      this.tracerGraphics.fillStyle(0xff0000, 1);
      this.tracerGraphics.fillCircle(finalHitPoint.x, finalHitPoint.y, 8);
    }
  }

  /**
   * Get all wrapped positions for a point (original + 8 adjacent "ghost" positions)
   */
  private getWrappedPositions(pos: Point, arenaWidth: number, arenaHeight: number): Point[] {
    const positions: Point[] = [pos]; // Original position

    // Add wrapped positions (for targets near edges)
    const offsets = [
      { dx: -arenaWidth, dy: 0 },
      { dx: arenaWidth, dy: 0 },
      { dx: 0, dy: -arenaHeight },
      { dx: 0, dy: arenaHeight },
      { dx: -arenaWidth, dy: -arenaHeight },
      { dx: arenaWidth, dy: -arenaHeight },
      { dx: -arenaWidth, dy: arenaHeight },
      { dx: arenaWidth, dy: arenaHeight },
    ];

    for (const offset of offsets) {
      positions.push({ x: pos.x + offset.dx, y: pos.y + offset.dy });
    }

    return positions;
  }

  // Line-circle intersection for hitscan
  private lineCircleIntersection(
    lineStart: Point,
    lineEnd: Point,
    circleCenter: Point,
    radius: number
  ): Point | null {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const fx = lineStart.x - circleCenter.x;
    const fy = lineStart.y - circleCenter.y;

    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - radius * radius;

    let discriminant = b * b - 4 * a * c;

    if (discriminant < 0) return null;

    discriminant = Math.sqrt(discriminant);
    const t1 = (-b - discriminant) / (2 * a);
    const t2 = (-b + discriminant) / (2 * a);

    // We want the first intersection point (entering the circle)
    let t = t1;
    if (t < 0 || t > 1) {
      t = t2;
      if (t < 0 || t > 1) return null;
    }

    return {
      x: lineStart.x + t * dx,
      y: lineStart.y + t * dy
    };
  }

  // Default AI - uses same constraints as player (sensors, gun range, etc.)
  private runTankAI(tank: Tank): void {
    // Safety check
    if (!tank || !tank.body || !tank.active || tank.isDead()) return;

    // Use same constraints as player (sensors, gun range)
    const gunRange = tank.getGunRange();

    // Check each sensor direction for threats
    const frontEnemies = this.getEnemiesInSensor(tank, 0);  // sensor 0 = front
    const leftEnemies = this.getEnemiesInSensor(tank, 1);   // sensor 1 = left
    const rightEnemies = this.getEnemiesInSensor(tank, 2);  // sensor 2 = right
    const rearEnemies = this.getEnemiesInSensor(tank, 3);   // sensor 3 = rear

    try {
      // Priority 1: React to rear threats
      if (rearEnemies.length > 0) {
        tank.turn(1); // Spin to face them
        tank.move(0.5);
        return;
      }

      // Priority 2: Attack front enemies
      if (frontEnemies.length > 0) {
        const enemy = frontEnemies[0];
        tank.aimAt(enemy.position);

        // Only fire within gun range
        if (enemy.distance <= gunRange && tank.canFire()) {
          tank.fire();
        }

        // Move toward or maintain distance
        if (enemy.distance > gunRange * 0.8) {
          tank.move(0.8);
        } else if (enemy.distance < 150) {
          tank.move(-0.5);
        } else {
          tank.move(0.3);
        }
        return;
      }

      // Priority 3: Turn toward side threats
      if (leftEnemies.length > 0) {
        tank.turn(-0.5);
        tank.move(0.3);
        return;
      }
      if (rightEnemies.length > 0) {
        tank.turn(0.5);
        tank.move(0.3);
        return;
      }

      // No enemies detected - patrol
      tank.turn(0.3);
      tank.move(0.5);
    } catch {
      // Tank was destroyed during AI execution
      return;
    }
  }

  private getEnemiesFor(tank: Tank): EnemyInfo[] {
    const enemies: EnemyInfo[] = [];
    const { arenaWidth, arenaHeight } = DEFAULT_BATTLE_CONFIG;

    // Safety check - make sure the requesting tank is valid
    if (!tank || !tank.body || !tank.active || tank.isDead()) {
      return enemies;
    }

    // Cache tank position to avoid repeated getter calls
    let tankX: number, tankY: number;
    try {
      tankX = tank.x;
      tankY = tank.y;
    } catch {
      return enemies; // Tank body was destroyed
    }

    for (const other of this.tanks) {
      // Skip self, dead tanks, or tanks without valid bodies
      if (!other || other.tankId === tank.tankId || other.isDead() || !other.body || !other.active) continue;

      try {
        const otherX = other.x;
        const otherY = other.y;

        // Find the shortest wrapped distance and best position
        const { bestPos, distance } = this.getShortestWrappedDistance(
          { x: tankX, y: tankY },
          { x: otherX, y: otherY },
          arenaWidth,
          arenaHeight
        );

        const bearing = Phaser.Math.Angle.Between(tankX, tankY, bestPos.x, bestPos.y);

        enemies.push({
          id: other.tankId,
          position: bestPos, // Use wrapped position for accurate targeting
          heading: other.getHeading(),
          turretHeading: other.getTurretHeading(),
          velocity: { x: 0, y: 0 },
          health: other.getHealth(),
          distance,
          bearing: Phaser.Math.RadToDeg(bearing),
        });
      } catch {
        // Tank was destroyed mid-iteration, skip it
        continue;
      }
    }

    // Sort by distance
    enemies.sort((a, b) => a.distance - b.distance);

    return enemies;
  }

  /**
   * Calculate the shortest distance considering wrap-around
   * Returns the best wrapped position and the distance
   */
  private getShortestWrappedDistance(
    from: Point,
    to: Point,
    arenaWidth: number,
    arenaHeight: number
  ): { bestPos: Point; distance: number } {
    let bestDistance = Infinity;
    let bestPos = to;

    // Check all 9 possible positions (original + 8 wrapped)
    const wrappedPositions = this.getWrappedPositions(to, arenaWidth, arenaHeight);

    for (const pos of wrappedPositions) {
      const dist = Phaser.Math.Distance.Between(from.x, from.y, pos.x, pos.y);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestPos = pos;
      }
    }

    return { bestPos, distance: bestDistance };
  }

  /**
   * Get enemies detected by a specific sensor index
   */
  getEnemiesInSensor(tank: Tank, sensorIndex: number): EnemyInfo[] {
    const allEnemies = this.getEnemiesFor(tank);
    return allEnemies.filter(enemy => tank.isPointInSensorIndex(enemy.position, sensorIndex));
  }

  /**
   * Get all enemies detectable by any sensor (union, no duplicates)
   */
  getDetectableEnemies(tank: Tank): EnemyInfo[] {
    const allEnemies = this.getEnemiesFor(tank);
    return allEnemies.filter(enemy => tank.isPointDetectable(enemy.position));
  }

  private createHUD(): void {
    // Timer
    this.timerText = this.add.text(
      DEFAULT_BATTLE_CONFIG.arenaWidth / 2,
      20,
      this.formatTime(this.battleTimer),
      {
        font: '24px monospace',
        color: '#ffffff',
      }
    );
    this.timerText.setOrigin(0.5, 0);
    this.timerText.setDepth(100);

    // Title
    const title = this.add.text(
      DEFAULT_BATTLE_CONFIG.arenaWidth / 2,
      50,
      'PROMPT BATTLES',
      {
        font: 'bold 16px monospace',
        color: '#666688',
      }
    );
    title.setOrigin(0.5, 0);
    title.setDepth(100);

    // Create health bars for each tank
    for (const tank of this.tanks) {
      const healthBar = this.add.graphics();
      healthBar.setDepth(100);
      this.healthBars.set(tank.tankId, healthBar);
    }
  }

  private createPauseButton(): void {
    const { arenaWidth } = DEFAULT_BATTLE_CONFIG;

    // Create pause button container
    this.pauseButton = this.add.container(arenaWidth - 50, 30);
    this.pauseButton.setDepth(150);

    // Button background
    const bg = this.add.graphics();
    bg.fillStyle(0x333355, 0.8);
    bg.fillRoundedRect(-25, -15, 50, 30, 5);
    bg.lineStyle(2, 0x4a90d9);
    bg.strokeRoundedRect(-25, -15, 50, 30, 5);

    // Pause icon (two bars)
    const icon = this.add.graphics();
    icon.fillStyle(0xffffff);
    icon.fillRect(-8, -8, 5, 16);
    icon.fillRect(3, -8, 5, 16);

    this.pauseButton.add([bg, icon]);

    // Make interactive
    const hitArea = this.add.rectangle(0, 0, 50, 30, 0x000000, 0);
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on('pointerdown', () => this.togglePause());
    hitArea.on('pointerover', () => bg.setAlpha(1));
    hitArea.on('pointerout', () => bg.setAlpha(0.8));
    this.pauseButton.add(hitArea);
  }

  private createPauseMenu(): void {
    const { arenaWidth, arenaHeight } = DEFAULT_BATTLE_CONFIG;
    const centerX = arenaWidth / 2;
    const centerY = arenaHeight / 2;

    // Create pause menu container (hidden by default)
    this.pauseMenu = this.add.container(centerX, centerY);
    this.pauseMenu.setDepth(200);
    this.pauseMenu.setVisible(false);

    // Dimmed background overlay
    const overlay = this.add.rectangle(0, 0, arenaWidth, arenaHeight, 0x000000, 0.7);
    overlay.setInteractive(); // Block clicks to game behind

    // Menu panel
    const panel = this.add.graphics();
    panel.fillStyle(0x1a1a2e, 0.95);
    panel.fillRoundedRect(-150, -140, 300, 280, 15);
    panel.lineStyle(3, 0x4a90d9);
    panel.strokeRoundedRect(-150, -140, 300, 280, 15);

    // Title
    const title = this.add.text(0, -110, 'PAUSED', {
      font: 'bold 32px monospace',
      color: '#ffffff',
    });
    title.setOrigin(0.5);

    // Create menu buttons
    const resumeBtn = this.createMenuButton(0, -40, '▶ RESUME', 0x4ad94a, () => this.togglePause());
    const rematchBtn = this.createMenuButton(0, 30, '> REMATCH', 0x4a90d9, () => this.handleRematch());
    const editBtn = this.createMenuButton(0, 100, '> EDIT PROMPTS', 0xd9944a, () => this.handleEditPrompts());

    this.pauseMenu.add([overlay, panel, title, ...resumeBtn, ...rematchBtn, ...editBtn]);
  }

  private createMenuButton(
    x: number,
    y: number,
    text: string,
    color: number,
    onClick: () => void
  ): Phaser.GameObjects.GameObject[] {
    const btnWidth = 200;
    const btnHeight = 45;

    const bg = this.add.graphics();
    bg.fillStyle(color, 0.3);
    bg.fillRoundedRect(x - btnWidth / 2, y - btnHeight / 2, btnWidth, btnHeight, 8);
    bg.lineStyle(2, color);
    bg.strokeRoundedRect(x - btnWidth / 2, y - btnHeight / 2, btnWidth, btnHeight, 8);

    const label = this.add.text(x, y, text, {
      font: 'bold 18px monospace',
      color: '#ffffff',
    });
    label.setOrigin(0.5);

    const hitArea = this.add.rectangle(x, y, btnWidth, btnHeight, 0x000000, 0);
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on('pointerdown', onClick);
    hitArea.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(color, 0.6);
      bg.fillRoundedRect(x - btnWidth / 2, y - btnHeight / 2, btnWidth, btnHeight, 8);
      bg.lineStyle(2, color);
      bg.strokeRoundedRect(x - btnWidth / 2, y - btnHeight / 2, btnWidth, btnHeight, 8);
    });
    hitArea.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(color, 0.3);
      bg.fillRoundedRect(x - btnWidth / 2, y - btnHeight / 2, btnWidth, btnHeight, 8);
      bg.lineStyle(2, color);
      bg.strokeRoundedRect(x - btnWidth / 2, y - btnHeight / 2, btnWidth, btnHeight, 8);
    });

    return [bg, label, hitArea];
  }

  private togglePause(): void {
    if (this.isGameOver) return;

    this.isPaused = !this.isPaused;
    this.pauseMenu.setVisible(this.isPaused);

    // Pause/resume the timer
    if (this.isPaused) {
      this.timerEvent?.paused ? null : (this.timerEvent!.paused = true);
    } else {
      this.timerEvent?.paused ? (this.timerEvent!.paused = false) : null;
    }
  }

  private handleRematch(): void {
    // Restart the scene with the same behaviors
    this.scene.restart({ behaviors: this.behaviors });
  }

  private handleEditPrompts(): void {
    // Dispatch event to React to return to editor
    window.dispatchEvent(new CustomEvent('phaserEvent', { detail: 'backToMenu' }));
  }

  private updateHealthBars(): void {
    for (const tank of this.tanks) {
      const healthBar = this.healthBars.get(tank.tankId);
      if (!healthBar || tank.isDead()) {
        healthBar?.clear();
        continue;
      }

      healthBar.clear();

      const barWidth = 40;
      const barHeight = 6;
      const x = tank.x - barWidth / 2;
      const y = tank.y - 30;

      // Background
      healthBar.fillStyle(0x333333);
      healthBar.fillRect(x, y, barWidth, barHeight);

      // Health (green to red based on health)
      const healthPercent = tank.getHealth() / tank.stats.maxHealth;
      const red = new Phaser.Display.Color(255, 0, 0);
      const green = new Phaser.Display.Color(0, 255, 0);
      const healthColor = Phaser.Display.Color.Interpolate.ColorWithColor(
        red,
        green,
        100,
        healthPercent * 100
      );
      healthBar.fillStyle(
        Phaser.Display.Color.GetColor(healthColor.r, healthColor.g, healthColor.b)
      );
      healthBar.fillRect(x, y, barWidth * healthPercent, barHeight);

      // Border
      healthBar.lineStyle(1, 0xffffff, 0.5);
      healthBar.strokeRect(x, y, barWidth, barHeight);
    }
  }

  private updateTimer(): void {
    if (this.isGameOver) return;

    this.battleTimer--;
    this.timerText.setText(this.formatTime(this.battleTimer));

    if (this.battleTimer <= 0) {
      this.endGame();
    }
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private onTankDeath(tank: Tank): void {
    // Clean up health bar
    const healthBar = this.healthBars.get(tank.tankId);
    if (healthBar) {
      healthBar.clear();
      healthBar.destroy();
      this.healthBars.delete(tank.tankId);
    }

    // Remove from tanks array
    this.tanks = this.tanks.filter((t) => t !== tank);

    this.checkWinCondition();
  }

  private checkWinCondition(): void {
    const aliveTanks = this.tanks.filter((t) => !t.isDead());

    if (aliveTanks.length <= 1) {
      this.endGame(aliveTanks[0]);
    }
  }

  private endGame(winner?: Tank): void {
    if (this.isGameOver) return;
    this.isGameOver = true;

    // Display winner
    const text = winner
      ? `Winner: ${winner.tankId}`
      : 'Draw!';

    const winnerText = this.add.text(
      DEFAULT_BATTLE_CONFIG.arenaWidth / 2,
      DEFAULT_BATTLE_CONFIG.arenaHeight / 2 - 30,
      text,
      {
        font: 'bold 48px monospace',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
      }
    );
    winnerText.setOrigin(0.5);
    winnerText.setDepth(200);

    // Rematch button - restart with same behaviors
    const rematchBtn = this.add.rectangle(
      DEFAULT_BATTLE_CONFIG.arenaWidth / 2 - 120,
      DEFAULT_BATTLE_CONFIG.arenaHeight / 2 + 50,
      180, 45, 0x4a90d9
    ).setInteractive({ useHandCursor: true })
      .on('pointerover', () => rematchBtn.setFillStyle(0x5aa0e9))
      .on('pointerout', () => rematchBtn.setFillStyle(0x4a90d9))
      .on('pointerdown', () => this.scene.restart({ behaviors: this.behaviors }));
    rematchBtn.setDepth(200);

    this.add.text(
      DEFAULT_BATTLE_CONFIG.arenaWidth / 2 - 120,
      DEFAULT_BATTLE_CONFIG.arenaHeight / 2 + 50,
      'Rematch',
      { font: 'bold 18px monospace', color: '#ffffff' }
    ).setOrigin(0.5).setDepth(201);

    // Back to Editor button
    const editorBtn = this.add.rectangle(
      DEFAULT_BATTLE_CONFIG.arenaWidth / 2 + 120,
      DEFAULT_BATTLE_CONFIG.arenaHeight / 2 + 50,
      180, 45, 0x4ad94a
    ).setInteractive({ useHandCursor: true })
      .on('pointerover', () => editorBtn.setFillStyle(0x5ae95a))
      .on('pointerout', () => editorBtn.setFillStyle(0x4ad94a))
      .on('pointerdown', () => {
        // Dispatch event to React to go back to menu
        window.dispatchEvent(new CustomEvent('phaserEvent', { detail: 'backToMenu' }));
      });
    editorBtn.setDepth(200);

    this.add.text(
      DEFAULT_BATTLE_CONFIG.arenaWidth / 2 + 120,
      DEFAULT_BATTLE_CONFIG.arenaHeight / 2 + 50,
      'Edit Prompts',
      { font: 'bold 18px monospace', color: '#ffffff' }
    ).setOrigin(0.5).setDepth(201);
  }

  /**
   * Draw sensor cones and gun range for a tank
   */
  private drawTankSensors(tank: Tank): void {
    // Color palette for sensors (cycles if more than 8)
    const sensorColors = [
      0x4a90d9,  // Blue
      0x90d94a,  // Green
      0xd9904a,  // Orange
      0xd94a4a,  // Red
      0xd94ad9,  // Magenta
      0x4ad9d9,  // Cyan
      0xd9d94a,  // Yellow
      0x944ad9,  // Purple
    ];

    // Get dynamic sensors from tank
    const sensors = tank.getSensors();

    // Draw each sensor cone
    sensors.forEach((config, index) => {
      const color = sensorColors[index % sensorColors.length];
      this.drawSensorCone(tank, config, color);
    });

    // Draw gun range circle (dashed, very subtle)
    const gunRange = tank.getGunRange();
    this.sensorGraphics.lineStyle(1, 0xffff00, 0.15);
    this.sensorGraphics.strokeCircle(tank.x, tank.y, gunRange);
  }

  /**
   * Draw a single sensor cone
   */
  private drawSensorCone(tank: Tank, config: SensorConfig, color: number): void {
    const tankHeading = tank.rotation; // radians
    const sensorAngle = tankHeading + Phaser.Math.DegToRad(config.offset);
    const halfArc = Phaser.Math.DegToRad(config.arc / 2);

    // Draw filled arc
    this.sensorGraphics.fillStyle(color, 0.08);
    this.sensorGraphics.beginPath();
    this.sensorGraphics.moveTo(tank.x, tank.y);
    this.sensorGraphics.arc(
      tank.x, tank.y,
      config.range,
      sensorAngle - halfArc,
      sensorAngle + halfArc,
      false
    );
    this.sensorGraphics.closePath();
    this.sensorGraphics.fillPath();

    // Draw arc outline
    this.sensorGraphics.lineStyle(1, color, 0.25);
    this.sensorGraphics.beginPath();
    this.sensorGraphics.arc(
      tank.x, tank.y,
      config.range,
      sensorAngle - halfArc,
      sensorAngle + halfArc,
      false
    );
    this.sensorGraphics.strokePath();

    // Draw edge lines
    const startAngle = sensorAngle - halfArc;
    const endAngle = sensorAngle + halfArc;
    this.sensorGraphics.lineBetween(
      tank.x, tank.y,
      tank.x + Math.cos(startAngle) * config.range,
      tank.y + Math.sin(startAngle) * config.range
    );
    this.sensorGraphics.lineBetween(
      tank.x, tank.y,
      tank.x + Math.cos(endAngle) * config.range,
      tank.y + Math.sin(endAngle) * config.range
    );
  }

  /**
   * Create the code display panel on the right side
   */
  private createCodePanel(): void {
    const panelWidth = 280;
    const panelHeight = 450;
    const panelX = DEFAULT_BATTLE_CONFIG.arenaWidth - panelWidth - 10;
    const panelY = 60;
    const previewHeight = 120;
    const scrollAreaY = panelY + previewHeight + 40;
    const scrollAreaHeight = panelHeight - previewHeight - 50;

    // Background
    this.codePanelBg = this.add.rectangle(
      panelX + panelWidth / 2,
      panelY + panelHeight / 2,
      panelWidth,
      panelHeight,
      0x1a1a2e,
      0.9
    );
    this.codePanelBg.setStrokeStyle(2, 0x4a90d9);
    this.codePanelBg.setDepth(90);

    // Title
    const title = this.add.text(
      panelX + 10,
      panelY + 8,
      ':: YOUR TANK AI',
      {
        font: 'bold 14px monospace',
        color: '#4a90d9',
      }
    );
    title.setDepth(91);

    // Mini tank preview area
    const previewBg = this.add.rectangle(
      panelX + panelWidth / 2,
      panelY + 30 + previewHeight / 2,
      panelWidth - 20,
      previewHeight,
      0x0a0a1e,
      1
    );
    previewBg.setStrokeStyle(1, 0x333366);
    previewBg.setDepth(91);

    // Graphics for mini sensor preview
    this.panelPreviewGraphics = this.add.graphics();
    this.panelPreviewGraphics.setDepth(92);

    // Divider line
    const divider = this.add.rectangle(
      panelX + panelWidth / 2,
      scrollAreaY - 5,
      panelWidth - 20,
      2,
      0x4a90d9,
      0.5
    );
    divider.setDepth(91);

    // Scroll area label
    const scrollLabel = this.add.text(
      panelX + 10,
      scrollAreaY,
      '▶ LIVE EXECUTION:',
      {
        font: 'bold 11px monospace',
        color: '#88ff88',
      }
    );
    scrollLabel.setDepth(91);

    // Create scrollable container for trace text
    this.scrollContainer = this.add.container(panelX + 10, scrollAreaY + 18);
    this.scrollContainer.setDepth(91);

    // Code/trace text inside scroll container
    this.codeText = this.add.text(0, 0, 'Loading...', {
      font: '10px monospace',
      color: '#88ff88',
      wordWrap: { width: panelWidth - 30 },
      lineSpacing: 2,
    });
    this.scrollContainer.add(this.codeText);

    // Create mask for scrollable area
    const maskShape = this.add.graphics();
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(panelX, scrollAreaY + 15, panelWidth, scrollAreaHeight);
    const mask = maskShape.createGeometryMask();
    this.scrollContainer.setMask(mask);

    // Handle mouse wheel scrolling
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
      // Check if mouse is over the panel
      const pointer = this.input.activePointer;
      if (pointer.x >= panelX && pointer.x <= panelX + panelWidth &&
          pointer.y >= scrollAreaY && pointer.y <= scrollAreaY + scrollAreaHeight) {
        this.scrollY = Phaser.Math.Clamp(
          this.scrollY + deltaY * 0.5,
          0,
          Math.max(0, this.maxScrollY)
        );
        this.scrollContainer.y = scrollAreaY + 18 - this.scrollY;
      }
    });

    // Create main container for organization
    this.codePanel = this.add.container(0, 0, [
      this.codePanelBg, title, previewBg, divider, scrollLabel
    ]);
    this.codePanel.setDepth(90);
  }

  /**
   * Update the code panel with current tank behavior and execution trace
   */
  private updateCodePanel(): void {
    if (!this.codeText) return;

    const panelWidth = 280;
    const panelX = DEFAULT_BATTLE_CONFIG.arenaWidth - panelWidth - 10;
    const panelY = 60;
    const previewHeight = 120;
    const scrollAreaHeight = 450 - previewHeight - 50;

    // Get player's behavior and tank
    const playerBehavior = this.behaviors[0];
    const playerTank = this.tanks.find(t => t.tankId === 'tank-0');

    // Draw mini tank preview
    this.drawMiniTankPreview(playerTank, panelX, panelY, panelWidth, previewHeight);

    if (!playerBehavior || !playerBehavior.code) {
      this.codeText.setText('No AI code loaded');
      return;
    }

    // Get player tank status
    const isAlive = playerTank && !playerTank.isDead();
    const status = isAlive
      ? `HP: ${playerTank.getHealth()}%`
      : 'DESTROYED';

    // Get execution trace from TankBrain
    const brain = this.tankBrains.get('tank-0');
    const trace = brain ? brain.getLastTrace() : [];

    // Format trace entries
    const traceLines = this.formatTrace(trace);

    // Build display text
    const displayText = [
      `${status} | ${playerTank?.getSensorCount() || 4} sensors`,
      `Strategy: ${playerBehavior.strategy?.slice(0, 25) || 'Custom'}...`,
      '─'.repeat(32),
      ...traceLines,
    ].join('\n');

    this.codeText.setText(displayText);

    // Calculate max scroll based on content height
    this.panelContentHeight = this.codeText.height;
    this.maxScrollY = Math.max(0, this.panelContentHeight - scrollAreaHeight + 20);
  }

  /**
   * Draw mini tank preview with sensors
   */
  private drawMiniTankPreview(tank: Tank | undefined, panelX: number, panelY: number, panelWidth: number, previewHeight: number): void {
    this.panelPreviewGraphics.clear();

    const centerX = panelX + panelWidth / 2;
    const centerY = panelY + 30 + previewHeight / 2;
    const scale = 0.25; // Scale down sensors for preview

    // Draw gun range circle
    const gunRange = tank ? tank.getGunRange() : 350;
    this.panelPreviewGraphics.lineStyle(1, 0xffff00, 0.3);
    this.panelPreviewGraphics.strokeCircle(centerX, centerY, gunRange * scale);

    // Get sensors from tank or use defaults
    const sensors = tank ? tank.getSensors() : [
      { arc: 90, range: 400, offset: 0 },
      { arc: 120, range: 250, offset: -90 },
      { arc: 120, range: 250, offset: 90 },
      { arc: 90, range: 150, offset: 180 },
    ];

    // Color palette for sensors
    const sensorColors = [
      0x4a90d9, 0x90d94a, 0xd9904a, 0xd94a4a,
      0xd94ad9, 0x4ad9d9, 0xd9d94a, 0x944ad9,
    ];

    // Get tank rotation or default to 0 (facing right)
    const tankRotation = tank ? tank.rotation : -Math.PI / 2; // Default facing up

    // Draw each sensor cone
    sensors.forEach((config, index) => {
      const color = sensorColors[index % sensorColors.length];
      const sensorAngle = tankRotation + Phaser.Math.DegToRad(config.offset);
      const halfArc = Phaser.Math.DegToRad(config.arc / 2);
      const range = config.range * scale;

      // Filled arc
      this.panelPreviewGraphics.fillStyle(color, 0.15);
      this.panelPreviewGraphics.beginPath();
      this.panelPreviewGraphics.moveTo(centerX, centerY);
      this.panelPreviewGraphics.arc(centerX, centerY, range, sensorAngle - halfArc, sensorAngle + halfArc, false);
      this.panelPreviewGraphics.closePath();
      this.panelPreviewGraphics.fillPath();

      // Arc outline
      this.panelPreviewGraphics.lineStyle(1, color, 0.5);
      this.panelPreviewGraphics.beginPath();
      this.panelPreviewGraphics.arc(centerX, centerY, range, sensorAngle - halfArc, sensorAngle + halfArc, false);
      this.panelPreviewGraphics.strokePath();
    });

    // Draw tank body (small rectangle)
    const tankSize = 12;
    this.panelPreviewGraphics.fillStyle(tank ? tank.getColor() : 0x4a90d9, 1);
    this.panelPreviewGraphics.save();

    // Draw rotated tank rectangle
    const cos = Math.cos(tankRotation);
    const sin = Math.sin(tankRotation);
    const hw = tankSize;
    const hh = tankSize * 0.7;

    const points = [
      { x: centerX + cos * hw - sin * (-hh), y: centerY + sin * hw + cos * (-hh) },
      { x: centerX + cos * hw - sin * hh, y: centerY + sin * hw + cos * hh },
      { x: centerX + cos * (-hw) - sin * hh, y: centerY + sin * (-hw) + cos * hh },
      { x: centerX + cos * (-hw) - sin * (-hh), y: centerY + sin * (-hw) + cos * (-hh) },
    ];

    this.panelPreviewGraphics.fillPoints(points, true);
    this.panelPreviewGraphics.lineStyle(1, 0xffffff, 0.5);
    this.panelPreviewGraphics.strokePoints(points, true);

    // Draw turret line
    const turretRotation = tank ? Phaser.Math.DegToRad(tank.getTurretHeading()) : tankRotation;
    const turretLength = 15;
    this.panelPreviewGraphics.lineStyle(3, 0xffffff, 0.8);
    this.panelPreviewGraphics.lineBetween(
      centerX,
      centerY,
      centerX + Math.cos(turretRotation) * turretLength,
      centerY + Math.sin(turretRotation) * turretLength
    );
  }

  /**
   * Format trace entries for display
   */
  private formatTrace(trace: TraceEntry[]): string[] {
    if (trace.length === 0) {
      return ['  (no activity)'];
    }

    const lines: string[] = [];
    const typeIcons: Record<TraceEntry['type'], string> = {
      sensor: '[S]',
      action: '[A]',
      utility: '[U]',
      config: '[C]',
    };

    for (const entry of trace) {
      const icon = typeIcons[entry.type];
      let line = `${icon} ${entry.method}`;

      if (entry.args) {
        line += ` ${entry.args}`;
      }
      if (entry.result !== undefined) {
        line += ` → ${entry.result}`;
      }

      lines.push(line);
    }

    // Limit to last 15 entries to avoid overflow
    if (lines.length > 15) {
      return ['  ...', ...lines.slice(-15)];
    }

    return lines;
  }
}
