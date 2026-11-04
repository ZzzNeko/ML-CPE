import Phaser from 'phaser';
import { eventBus, GameEvents } from '../EventBus';

/**
 * The menu is rendered by React so text/buttons stay crisp at any viewport size.
 * Phaser only owns the game world and scene state.
 */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    eventBus.emit(GameEvents.SCENE_CHANGED, 'Menu');
  }
}
