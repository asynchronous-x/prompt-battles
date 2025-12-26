import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Show loading progress
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const progressBar = this.add.graphics();
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(width / 2 - 160, height / 2 - 25, 320, 50);

    const loadingText = this.add.text(width / 2, height / 2 - 50, 'Loading...', {
      font: '20px monospace',
      color: '#ffffff',
    });
    loadingText.setOrigin(0.5, 0.5);

    this.load.on('progress', (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(0x00ff88, 1);
      progressBar.fillRect(width / 2 - 150, height / 2 - 15, 300 * value, 30);
    });

    this.load.on('complete', () => {
      progressBar.destroy();
      progressBox.destroy();
      loadingText.destroy();
    });

    // Generate tank sprites programmatically (we'll create actual assets later)
    this.createPlaceholderAssets();
  }

  create(): void {
    this.scene.start('PromptEditorScene');
  }

  private createPlaceholderAssets(): void {
    // Create tank body texture
    const tankBody = this.make.graphics({ x: 0, y: 0 });
    tankBody.fillStyle(0x4a90d9);
    tankBody.fillRoundedRect(0, 0, 48, 36, 4);
    // Tank treads
    tankBody.fillStyle(0x2d5a87);
    tankBody.fillRect(0, 0, 48, 8);
    tankBody.fillRect(0, 28, 48, 8);
    tankBody.generateTexture('tank-body', 48, 36);
    tankBody.destroy();

    // Create tank turret texture
    const turret = this.make.graphics({ x: 0, y: 0 });
    turret.fillStyle(0x6ab0f3);
    turret.fillCircle(12, 12, 10);
    // Barrel
    turret.fillStyle(0x3d7dc0);
    turret.fillRect(12, 8, 24, 8);
    turret.generateTexture('tank-turret', 36, 24);
    turret.destroy();

    // Create projectile texture
    const projectile = this.make.graphics({ x: 0, y: 0 });
    projectile.fillStyle(0xffaa00);
    projectile.fillCircle(6, 6, 6);
    projectile.generateTexture('projectile', 12, 12);
    projectile.destroy();

    // Create arena wall texture
    const wall = this.make.graphics({ x: 0, y: 0 });
    wall.fillStyle(0x444466);
    wall.fillRect(0, 0, 32, 32);
    wall.generateTexture('wall', 32, 32);
    wall.destroy();
  }
}
