import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // Phase 1: no real art yet, generate simple placeholder textures at runtime
    // so the game is visually testable before assets exist (section 15: public/assets).
    this.load.on('progress', (value: number) => {
      this.game.events.emit('boot-progress', value);
    });
  }

  create() {
    this.generatePlaceholderTextures();
    this.scene.start('Menu');
  }

  private generatePlaceholderTextures() {
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    // player
    g.fillStyle(0xf2efe9, 1);
    g.fillRoundedRect(0, 0, 48, 64, 8);
    g.generateTexture('player', 48, 64);
    g.clear();

    // star (collectible)
    g.fillStyle(0xcdb892, 1);
    g.fillCircle(16, 16, 16);
    g.generateTexture('collectible', 32, 32);
    g.clear();

    // obstacle
    g.fillStyle(0xc4837c, 1);
    g.fillRoundedRect(0, 0, 40, 40, 6);
    g.generateTexture('obstacle', 40, 40);
    g.destroy();
  }
}
