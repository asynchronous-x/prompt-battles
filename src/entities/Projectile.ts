import Phaser from 'phaser';

export class Projectile extends Phaser.Physics.Matter.Image {
  public readonly ownerId: string;
  public readonly damage: number;
  private lifespan: number = 3000; // 3 seconds max
  private createdAt: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    angle: number,
    speed: number,
    ownerId: string,
    damage: number
  ) {
    super(scene.matter.world, x, y, 'projectile', undefined, {
      shape: { type: 'circle', radius: 6 },
      friction: 0,
      frictionAir: 0,
      mass: 0.1,
      label: 'projectile',
      isSensor: false,
    });

    this.ownerId = ownerId;
    this.damage = damage;
    this.createdAt = scene.time.now;

    // Add to scene
    scene.add.existing(this);

    // Set velocity
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    this.setVelocity(vx, vy);

    // Rotate to face direction
    this.setRotation(angle);

    // Set depth
    this.setDepth(-1);

    // Enable continuous collision detection for fast objects
    this.setBounce(0);
    this.setFriction(0);
  }

  update(): boolean {
    const now = this.scene.time.now;
    if (now - this.createdAt > this.lifespan) {
      this.destroy();
      return false;
    }
    return true;
  }

  onHit(): void {
    // Small particle effect on impact
    const particles = this.scene.add.particles(this.x, this.y, 'projectile', {
      speed: { min: 20, max: 50 },
      scale: { start: 0.5, end: 0 },
      lifespan: 200,
      quantity: 5,
      tint: 0xffaa00,
    });

    this.scene.time.delayedCall(200, () => particles.destroy());
    this.destroy();
  }
}
