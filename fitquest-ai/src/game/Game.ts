import Phaser from 'phaser';
import { GAME_CONFIG } from '../data/gameConfig';
import { RENDER_SCALE } from './render';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { ResultScene } from './scenes/ResultScene';
import { RhythmScene } from './scenes/RhythmScene';
import { PoseRhythmScene } from './scenes/PoseRhythmScene';

export function createGame(parent: HTMLElement): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    // Logical size is 960×540; the backing canvas is RENDER_SCALE× larger so it stays sharp (see render.ts).
    width: GAME_CONFIG.width * RENDER_SCALE,
    height: GAME_CONFIG.height * RENDER_SCALE,
    render: { antialias: true, roundPixels: false },
    backgroundColor: 'rgba(0,0,0,0)',
    transparent: true,
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 900 },
        debug: false,
      },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, MenuScene, RhythmScene, PoseRhythmScene, ResultScene],
  };

  return new Phaser.Game(config);
}
