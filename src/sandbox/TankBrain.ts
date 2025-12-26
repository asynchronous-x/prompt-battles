import { Tank } from '../entities/Tank';
import { EnemyInfo, Point, SENSOR_CONSTRAINTS } from '../types/game';
import { codeValidator } from '../llm/CodeValidator';

/**
 * Represents a single API call in the execution trace
 */
export interface TraceEntry {
  method: string;
  args?: string;
  result?: string;
  type: 'sensor' | 'action' | 'utility' | 'config';
}

/**
 * TankBrain wraps LLM-generated code and provides a safe execution environment.
 * It creates a sandboxed API that the code can use to control the tank.
 */
export class TankBrain {
  private tank: Tank;
  private code: string;
  private compiledFunction: ((tank: TankAPI) => void) | null = null;
  private error: string | null = null;
  private getEnemiesFn: () => EnemyInfo[];
  private lastTrace: TraceEntry[] = [];

  constructor(
    tank: Tank,
    code: string,
    getEnemiesFn: () => EnemyInfo[]
  ) {
    this.tank = tank;
    this.code = code;
    this.getEnemiesFn = getEnemiesFn;

    this.compile();
  }

  /**
   * Compile the code into an executable function
   */
  private compile(): void {
    try {
      // Inject loop guards to prevent infinite loops, then compile
      const guardedCode = codeValidator.injectLoopGuards(this.code);
      this.compiledFunction = new Function('tank', guardedCode) as (tank: TankAPI) => void;
      this.error = null;
    } catch (e) {
      this.error = `Compilation error: ${(e as Error).message}`;
      this.compiledFunction = null;
      console.error('TankBrain compilation error:', e);
    }
  }

  /**
   * Helper to add trace entry
   */
  private trace(method: string, type: TraceEntry['type'], args?: string, result?: string): void {
    this.lastTrace.push({ method, type, args, result });
  }

  /**
   * Format a value for trace display
   */
  private formatValue(val: unknown): string {
    if (val === null) return 'null';
    if (val === undefined) return 'undefined';
    if (typeof val === 'number') return val.toFixed(0);
    if (typeof val === 'boolean') return val.toString();
    if (Array.isArray(val)) return `[${val.length} items]`;
    if (typeof val === 'object') {
      const obj = val as Record<string, unknown>;
      if ('x' in obj && 'y' in obj) return `{x:${(obj.x as number).toFixed(0)}, y:${(obj.y as number).toFixed(0)}}`;
      if ('id' in obj) return `Enemy(${obj.id})`;
      return '{...}';
    }
    return String(val);
  }

  /**
   * Create the sandboxed tank API that the code can use
   */
  private createTankAPI(): TankAPI {
    const tank = this.tank;
    const getEnemiesFn = this.getEnemiesFn;

    return {
      // === SENSORS ===
      getPosition: () => {
        try {
          const result = tank.getPosition();
          this.trace('getPosition()', 'sensor', undefined, this.formatValue(result));
          return result;
        } catch {
          return { x: 0, y: 0 };
        }
      },

      getHealth: () => {
        try {
          const result = tank.getHealth();
          this.trace('getHealth()', 'sensor', undefined, String(result));
          return result;
        } catch {
          return 0;
        }
      },

      getHeading: () => {
        try {
          const result = tank.getHeading();
          this.trace('getHeading()', 'sensor', undefined, result.toFixed(0) + '°');
          return result;
        } catch {
          return 0;
        }
      },

      getTurretHeading: () => {
        try {
          const result = tank.getTurretHeading();
          this.trace('getTurretHeading()', 'sensor', undefined, result.toFixed(0) + '°');
          return result;
        } catch {
          return 0;
        }
      },

      canFire: () => {
        try {
          const result = tank.canFire();
          this.trace('canFire()', 'sensor', undefined, result ? 'YES' : 'NO');
          return result;
        } catch {
          return false;
        }
      },

      getNearestEnemy: () => {
        try {
          const allEnemies = this.getEnemiesFn();
          const detectable = allEnemies.filter(e => tank.isPointDetectable(e.position));
          detectable.sort((a, b) => a.distance - b.distance);
          const result = detectable.length > 0 ? detectable[0] : null;
          this.trace('getNearestEnemy()', 'sensor', undefined, result ? `dist:${result.distance.toFixed(0)}` : 'null');
          return result;
        } catch {
          return null;
        }
      },

      getEnemies: () => {
        try {
          const result = getEnemiesFn();
          this.trace('getEnemies()', 'sensor', undefined, `[${result.length}]`);
          return result;
        } catch {
          return [];
        }
      },

      // === SENSOR CONFIGURATION ===
      configureSensors: (configs: Array<{ arc: number; range: number; offset: number }>) => {
        try {
          if (!Array.isArray(configs)) return false;
          const result = tank.configureSensors(configs);
          this.trace('configureSensors()', 'config', `[${configs.length} sensors]`, result ? 'OK' : 'FAIL');
          return result;
        } catch {
          return false;
        }
      },

      getSensorCount: () => {
        try {
          const result = tank.getSensorCount();
          this.trace('getSensorCount()', 'sensor', undefined, String(result));
          return result;
        } catch {
          return 0;
        }
      },

      // === SCANNING ===
      scan: (sensorIndex: number) => {
        try {
          const allEnemies = this.getEnemiesFn();
          const result = allEnemies.filter(e => tank.isPointInSensorIndex(e.position, sensorIndex));
          result.sort((a, b) => a.distance - b.distance);
          this.trace(`scan(${sensorIndex})`, 'sensor', undefined, `[${result.length}]`);
          return result;
        } catch {
          return [];
        }
      },

      scanAll: () => {
        try {
          const allEnemies = this.getEnemiesFn();
          const result = allEnemies.filter(e => tank.isPointDetectable(e.position));
          result.sort((a, b) => a.distance - b.distance);
          this.trace('scanAll()', 'sensor', undefined, `[${result.length}]`);
          return result;
        } catch {
          return [];
        }
      },

      // === SENSOR/RANGE INFO ===
      getGunRange: () => {
        try {
          const result = tank.getGunRange();
          this.trace('getGunRange()', 'sensor', undefined, String(result));
          return result;
        } catch {
          return 350;
        }
      },

      getSensorConstraints: () => {
        return { ...SENSOR_CONSTRAINTS };
      },

      getArenaBounds: () => {
        try {
          return tank.getArenaBounds();
        } catch {
          return { width: 1200, height: 800 };
        }
      },

      // === WALL DETECTION ===
      isCollidingWithWall: () => {
        try {
          const result = tank.isCollidingWithWall();
          this.trace('isCollidingWithWall()', 'sensor', undefined, result ? 'YES' : 'NO');
          return result;
        } catch {
          return false;
        }
      },

      getWallCollisionSides: () => {
        try {
          const result = tank.getWallCollisionSides();
          this.trace('getWallCollisionSides()', 'sensor', undefined, result.length > 0 ? result.join(',') : 'none');
          return result;
        } catch {
          return [];
        }
      },

      getWallDistance: (angleOffset: number = 0) => {
        try {
          const result = tank.getWallDistance(angleOffset);
          this.trace('getWallDistance()', 'sensor', angleOffset.toFixed(0) + '°', result.toFixed(0));
          return result;
        } catch {
          return Infinity;
        }
      },

      scanWall: (sensorIndex: number) => {
        try {
          const result = tank.scanWallInSensor(sensorIndex);
          this.trace(`scanWall(${sensorIndex})`, 'sensor', undefined, result ? `dist:${result.distance.toFixed(0)}` : 'null');
          return result;
        } catch {
          return null;
        }
      },

      // === ACTIONS ===
      move: (speed: number) => {
        try {
          tank.move(speed);
          this.trace('move()', 'action', speed.toFixed(2));
        } catch {
          // Ignore errors
        }
      },

      turn: (rate: number) => {
        try {
          tank.turn(rate);
          this.trace('turn()', 'action', rate.toFixed(2));
        } catch {
          // Ignore errors
        }
      },

      aimAt: (point: Point) => {
        try {
          if (point && typeof point.x === 'number' && typeof point.y === 'number') {
            tank.aimAt(point);
            this.trace('aimAt()', 'action', this.formatValue(point));
          }
        } catch {
          // Ignore errors
        }
      },

      fire: () => {
        try {
          const result = tank.fire();
          this.trace('fire()', 'action', undefined, result ? 'FIRED!' : 'cooling');
          return result;
        } catch {
          return false;
        }
      },

      // === UTILITIES ===
      angleTo: (point: Point) => {
        try {
          if (!point) return 0;
          const pos = tank.getPosition();
          const dx = point.x - pos.x;
          const dy = point.y - pos.y;
          const result = Math.atan2(dy, dx) * (180 / Math.PI);
          this.trace('angleTo()', 'utility', this.formatValue(point), result.toFixed(0) + '°');
          return result;
        } catch {
          return 0;
        }
      },

      distanceTo: (point: Point) => {
        try {
          if (!point) return 0;
          const pos = tank.getPosition();
          const dx = point.x - pos.x;
          const dy = point.y - pos.y;
          const result = Math.sqrt(dx * dx + dy * dy);
          this.trace('distanceTo()', 'utility', this.formatValue(point), result.toFixed(0));
          return result;
        } catch {
          return 0;
        }
      },
    };
  }

  /**
   * Execute the brain code for one tick
   */
  execute(): void {
    if (!this.compiledFunction || !this.tank.active || this.tank.isDead()) {
      return;
    }

    // Clear trace for this frame
    this.lastTrace = [];

    try {
      const api = this.createTankAPI();
      this.compiledFunction(api);
    } catch (e) {
      // Log error but don't crash the game
      console.warn(`TankBrain execution error for ${this.tank.tankId}:`, e);
    }
  }

  /**
   * Check if the brain compiled successfully
   */
  isValid(): boolean {
    return this.compiledFunction !== null;
  }

  /**
   * Get any compilation error
   */
  getError(): string | null {
    return this.error;
  }

  /**
   * Get the execution trace from the last frame
   */
  getLastTrace(): TraceEntry[] {
    return this.lastTrace;
  }

  /**
   * Update the code (recompile)
   */
  setCode(code: string): void {
    this.code = code;
    this.compile();
  }
}

/**
 * Sensor constraints exposed to the API
 */
export interface SensorConstraints {
  maxSensors: number;
  maxArc: number;
  maxRange: number;
  minArc: number;
  minRange: number;
}

/**
 * The API interface exposed to tank brain code
 */
export interface TankAPI {
  // Basic Sensors
  getPosition(): Point;
  getHealth(): number;
  getHeading(): number;
  getTurretHeading(): number;
  canFire(): boolean;
  getNearestEnemy(): EnemyInfo | null;
  getEnemies(): EnemyInfo[];

  // Sensor Configuration (call once at start to customize sensors)
  configureSensors(configs: Array<{ arc: number; range: number; offset: number }>): boolean;
  getSensorCount(): number;
  getSensorConstraints(): SensorConstraints;

  // Scanning (use sensor index 0-7)
  scan(sensorIndex: number): EnemyInfo[];
  scanAll(): EnemyInfo[];  // All detectable enemies (union of all sensors)

  // Range Info
  getGunRange(): number;
  getArenaBounds(): { width: number; height: number };

  // Wall Detection
  isCollidingWithWall(): boolean;
  getWallCollisionSides(): Array<'top' | 'bottom' | 'left' | 'right'>;
  getWallDistance(angleOffset?: number): number;
  scanWall(sensorIndex: number): { distance: number; angle: number } | null;

  // Actions
  move(speed: number): void;
  turn(rate: number): void;
  aimAt(point: Point): void;
  fire(): boolean;

  // Utilities
  angleTo(point: Point): number;
  distanceTo(point: Point): number;
}
