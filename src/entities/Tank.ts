import Phaser from 'phaser';
import { TankStats, DEFAULT_TANK_STATS, Point, SensorConfig, SENSOR_CONSTRAINTS, DEFAULT_BATTLE_CONFIG } from '../types/game';

export interface WallInfo {
  distance: number;
  direction: 'front' | 'left' | 'right' | 'rear';
  point: Point;
}

export class Tank extends Phaser.Physics.Matter.Sprite {
  public readonly tankId: string;
  public readonly stats: TankStats;

  private turret: Phaser.GameObjects.Image;
  private currentHealth: number;
  private lastFireTime: number = 0;
  private targetTurretAngle: number = 0;
  private moveInput: number = 0;
  private turnInput: number = 0;
  private wantsFire: boolean = false;

  // Color for this tank
  private tankColor: number;

  // Dynamic sensor configuration
  private sensors: SensorConfig[];

  // Arena bounds for edge detection and wrap-around calculations
  private arenaWidth: number;
  private arenaHeight: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    tankId: string,
    color: number = 0x4a90d9,
    stats: TankStats = DEFAULT_TANK_STATS
  ) {
    super(scene.matter.world, x, y, 'tank-body', undefined, {
      shape: { type: 'rectangle', width: 48, height: 36 },
      friction: 0.3,
      frictionAir: 0.15, // Higher air friction for more controlled movement
      mass: 2,
      label: `tank-${tankId}`,
      restitution: 0.2, // Some bounce on collision
    });

    this.tankId = tankId;
    this.stats = stats;
    this.tankColor = color;
    this.currentHealth = stats.maxHealth;
    this.sensors = [...stats.defaultSensors]; // Copy default sensors
    this.arenaWidth = DEFAULT_BATTLE_CONFIG.arenaWidth;
    this.arenaHeight = DEFAULT_BATTLE_CONFIG.arenaHeight;

    // Add to scene
    scene.add.existing(this);

    // Tint the tank body
    this.setTint(color);

    // Create turret as separate image
    this.turret = scene.add.image(x, y, 'tank-turret');
    this.turret.setOrigin(0.33, 0.5);
    this.turret.setTint(color);
    this.turret.setDepth(1);

    // Set depth
    this.setDepth(0);
  }

  // Called every frame
  update(delta: number): void {
    // Safety check - don't update if destroyed
    if (!this.body || !this.active) return;

    const deltaSeconds = delta / 1000;

    // Handle turning first
    if (this.turnInput !== 0) {
      const rotationAmount = this.stats.turnSpeed * deltaSeconds * this.turnInput;
      this.setRotation(this.rotation + rotationAmount);
    }

    // Handle movement - simple position-based movement
    if (this.moveInput !== 0) {
      const moveDistance = this.stats.moveSpeed * deltaSeconds * this.moveInput;
      const dx = Math.cos(this.rotation) * moveDistance;
      const dy = Math.sin(this.rotation) * moveDistance;
      this.setPosition(this.x + dx, this.y + dy);
    }

    // Smoothly rotate turret toward target
    if (this.turret && this.turret.active) {
      const turretAngleDiff = Phaser.Math.Angle.Wrap(
        this.targetTurretAngle - this.turret.rotation
      );
      const maxTurretRotation = this.stats.turretTurnSpeed * deltaSeconds;
      if (Math.abs(turretAngleDiff) > maxTurretRotation) {
        this.turret.rotation += Math.sign(turretAngleDiff) * maxTurretRotation;
      } else {
        this.turret.rotation = this.targetTurretAngle;
      }

      // Sync turret position with body
      this.turret.setPosition(this.x, this.y);
    }

    // Reset inputs
    this.moveInput = 0;
    this.turnInput = 0;
  }

  // Tank API - Movement
  move(speed: number): void {
    this.moveInput = Phaser.Math.Clamp(speed, -1, 1);
  }

  turn(rate: number): void {
    this.turnInput = Phaser.Math.Clamp(rate, -1, 1);
  }

  // Tank API - Combat
  aimAt(point: Point): void {
    this.targetTurretAngle = Phaser.Math.Angle.Between(
      this.x,
      this.y,
      point.x,
      point.y
    );
  }

  aimAtAngle(angle: number): void {
    this.targetTurretAngle = angle;
  }

  fire(): boolean {
    const now = this.scene.time.now;
    const fireInterval = 1000 / this.stats.fireRate;

    if (now - this.lastFireTime >= fireInterval) {
      this.lastFireTime = now;
      this.wantsFire = true;
      return true;
    }
    return false;
  }

  canFire(): boolean {
    const now = this.scene.time.now;
    const fireInterval = 1000 / this.stats.fireRate;
    return now - this.lastFireTime >= fireInterval;
  }

  consumeFire(): { fired: boolean; angle: number; position: Point } {
    if (this.wantsFire) {
      this.wantsFire = false;

      // Calculate barrel tip position
      const barrelLength = 24;
      const tipX = this.x + Math.cos(this.turret.rotation) * barrelLength;
      const tipY = this.y + Math.sin(this.turret.rotation) * barrelLength;

      return {
        fired: true,
        angle: this.turret.rotation,
        position: { x: tipX, y: tipY },
      };
    }
    return { fired: false, angle: 0, position: { x: 0, y: 0 } };
  }

  // Tank API - Sensors
  getPosition(): Point {
    return { x: this.x, y: this.y };
  }

  getHealth(): number {
    return this.currentHealth;
  }

  getHeading(): number {
    return Phaser.Math.RadToDeg(this.rotation);
  }

  getTurretHeading(): number {
    return Phaser.Math.RadToDeg(this.turret.rotation);
  }

  // Gun range
  getGunRange(): number {
    return this.stats.gunRange;
  }

  /**
   * Configure sensors dynamically (up to 8 sensors)
   * Each sensor has: arc (10-120°), range (50-400px), offset (angle from front)
   */
  configureSensors(configs: SensorConfig[]): boolean {
    if (configs.length === 0 || configs.length > SENSOR_CONSTRAINTS.maxSensors) {
      return false;
    }

    // Validate and clamp each sensor config
    this.sensors = configs.map(config => ({
      arc: Phaser.Math.Clamp(config.arc, SENSOR_CONSTRAINTS.minArc, SENSOR_CONSTRAINTS.maxArc),
      range: Phaser.Math.Clamp(config.range, SENSOR_CONSTRAINTS.minRange, SENSOR_CONSTRAINTS.maxRange),
      offset: config.offset, // No clamping on offset, any angle is valid
    }));

    return true;
  }

  /**
   * Get current sensor configurations
   */
  getSensors(): SensorConfig[] {
    return [...this.sensors];
  }

  /**
   * Get number of configured sensors
   */
  getSensorCount(): number {
    return this.sensors.length;
  }

  /**
   * Get sensor config by index
   */
  getSensorConfig(index: number): SensorConfig | null {
    if (index < 0 || index >= this.sensors.length) {
      return null;
    }
    return { ...this.sensors[index] };
  }

  /**
   * Check if a point is within a specific sensor's detection cone (by index)
   */
  isPointInSensorIndex(point: Point, sensorIndex: number): boolean {
    if (sensorIndex < 0 || sensorIndex >= this.sensors.length) {
      return false;
    }

    const sensorConfig = this.sensors[sensorIndex];

    // Calculate distance to point
    const dx = point.x - this.x;
    const dy = point.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Check range first (quick reject)
    if (distance > sensorConfig.range) {
      return false;
    }

    // Calculate angle to point (in degrees)
    const angleToPoint = Phaser.Math.RadToDeg(Math.atan2(dy, dx));

    // Calculate sensor center angle (tank heading + sensor offset)
    const tankHeadingDeg = Phaser.Math.RadToDeg(this.rotation);
    const sensorCenterAngle = tankHeadingDeg + sensorConfig.offset;

    // Calculate angle difference (normalized to -180 to 180)
    let angleDiff = angleToPoint - sensorCenterAngle;
    while (angleDiff > 180) angleDiff -= 360;
    while (angleDiff < -180) angleDiff += 360;

    // Check if within arc (arc is total width, so half on each side)
    const halfArc = sensorConfig.arc / 2;
    return Math.abs(angleDiff) <= halfArc;
  }

  /**
   * Check if a point is within any sensor's detection range
   */
  isPointDetectable(point: Point): boolean {
    for (let i = 0; i < this.sensors.length; i++) {
      if (this.isPointInSensorIndex(point, i)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get which sensor indices can detect a point
   */
  getDetectingSensorIndices(point: Point): number[] {
    const indices: number[] = [];
    for (let i = 0; i < this.sensors.length; i++) {
      if (this.isPointInSensorIndex(point, i)) {
        indices.push(i);
      }
    }
    return indices;
  }

  // Damage handling
  takeDamage(amount: number): void {
    this.currentHealth = Math.max(0, this.currentHealth - amount);

    // Flash effect
    this.scene.tweens.add({
      targets: [this, this.turret],
      alpha: 0.5,
      duration: 50,
      yoyo: true,
      repeat: 2,
    });

    if (this.currentHealth <= 0) {
      this.onDeath();
    }
  }

  private onDeath(): void {
    // Explosion effect
    const particles = this.scene.add.particles(this.x, this.y, 'projectile', {
      speed: { min: 50, max: 150 },
      scale: { start: 1, end: 0 },
      lifespan: 500,
      quantity: 20,
      tint: this.tankColor,
    });

    this.scene.time.delayedCall(500, () => particles.destroy());

    // Emit death event
    this.scene.events.emit('tankDeath', this);

    // Destroy tank
    this.turret.destroy();
    this.destroy();
  }

  isDead(): boolean {
    return this.currentHealth <= 0;
  }

  getColor(): number {
    return this.tankColor;
  }

  // === Edge Detection (Wrap-Around Arena) ===
  // Note: Arena wraps around - no solid walls, but tanks can detect edges

  /**
   * Check if tank is near an edge (will wrap soon)
   * Not applicable for physical collision since arena wraps
   */
  isCollidingWithWall(): boolean {
    return false; // No walls in wrap-around arena
  }

  /**
   * Get which edges the tank is near (within threshold)
   */
  getWallCollisionSides(): Array<'top' | 'bottom' | 'left' | 'right'> {
    return []; // No walls in wrap-around arena
  }

  /**
   * Get distance to the nearest edge in a specific direction
   * (degrees, 0 = tank's forward direction)
   * Note: In wrap-around mode, this shows distance to where you'd wrap
   */
  getWallDistance(angleOffset: number = 0): number {
    const tankHeadingRad = this.rotation;
    const rayAngle = tankHeadingRad + Phaser.Math.DegToRad(angleOffset);
    const cosA = Math.cos(rayAngle);
    const sinA = Math.sin(rayAngle);

    // Calculate distance to each edge based on direction
    let minDist = Infinity;

    // Distance to right edge (x = arenaWidth) or left edge (x = 0)
    if (Math.abs(cosA) > 0.001) {
      if (cosA > 0) {
        minDist = Math.min(minDist, (this.arenaWidth - this.x) / cosA);
      } else {
        minDist = Math.min(minDist, -this.x / cosA);
      }
    }

    // Distance to bottom edge (y = arenaHeight) or top edge (y = 0)
    if (Math.abs(sinA) > 0.001) {
      if (sinA > 0) {
        minDist = Math.min(minDist, (this.arenaHeight - this.y) / sinA);
      } else {
        minDist = Math.min(minDist, -this.y / sinA);
      }
    }

    return minDist > 0 ? minDist : Infinity;
  }

  /**
   * Scan for edge within a specific sensor cone
   * Returns the closest edge distance within the sensor
   */
  scanWallInSensor(sensorIndex: number): { distance: number; angle: number } | null {
    if (sensorIndex < 0 || sensorIndex >= this.sensors.length) {
      return null;
    }

    const sensor = this.sensors[sensorIndex];
    const tankHeadingDeg = Phaser.Math.RadToDeg(this.rotation);
    const sensorCenterAngle = sensor.offset;

    // Check center of sensor for edge distance
    const distance = this.getWallDistance(sensorCenterAngle);

    if (distance <= sensor.range) {
      return { distance, angle: tankHeadingDeg + sensorCenterAngle };
    }
    return null;
  }

  /**
   * Get arena bounds
   */
  getArenaBounds(): { width: number; height: number } {
    return { width: this.arenaWidth, height: this.arenaHeight };
  }

  /**
   * Stub for compatibility - no wall collision in wrap-around arena
   */
  setWallCollision(_colliding: boolean, _sides: Array<'top' | 'bottom' | 'left' | 'right'>): void {
    // No-op in wrap-around arena
  }
}
