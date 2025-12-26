export interface Point {
  x: number;
  y: number;
}

export interface Vector {
  x: number;
  y: number;
}

// Sensor constraints
export const SENSOR_CONSTRAINTS = {
  maxSensors: 8,
  maxArc: 120,      // degrees
  maxRange: 400,    // pixels
  minArc: 10,       // degrees
  minRange: 50,     // pixels
};

export interface SensorConfig {
  arc: number;      // degrees (e.g., 90 = 45 degrees each side of center)
  range: number;    // pixels - max detection distance
  offset: number;   // degrees offset from tank heading (0 = front, 90 = right, -90 = left, 180 = rear)
}

export interface TankStats {
  maxHealth: number;
  moveSpeed: number;
  turnSpeed: number;
  turretTurnSpeed: number;
  fireRate: number; // shots per second
  projectileSpeed: number;
  projectileDamage: number;
  gunRange: number; // max range for weapon damage
  defaultSensors: SensorConfig[]; // default sensor configuration
}

export interface EnemyInfo {
  id: string;
  position: Point;
  heading: number;
  turretHeading: number;
  velocity: Vector;
  health: number;
  distance: number;
  bearing: number;
}

export interface TankCommand {
  type: 'move' | 'turn' | 'aimAt' | 'fire';
  value?: number | Point;
}

export interface BattleConfig {
  arenaWidth: number;
  arenaHeight: number;
  tankCount: number;
  battleDuration: number; // seconds
}

export const DEFAULT_TANK_STATS: TankStats = {
  maxHealth: 100,
  moveSpeed: 150,
  turnSpeed: 2, // radians per second
  turretTurnSpeed: 3,
  fireRate: 2,
  projectileSpeed: 400,
  projectileDamage: 15,
  gunRange: 350,
  defaultSensors: [
    { arc: 90, range: 400, offset: 0 },    // 0: front
    { arc: 120, range: 250, offset: -90 }, // 1: left
    { arc: 120, range: 250, offset: 90 },  // 2: right
    { arc: 90, range: 150, offset: 180 },  // 3: rear
  ],
};

export const DEFAULT_BATTLE_CONFIG: BattleConfig = {
  arenaWidth: 1200,
  arenaHeight: 800,
  tankCount: 8,
  battleDuration: 120,
};
