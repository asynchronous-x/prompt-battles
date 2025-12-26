import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { PromptEditorScene } from '../scenes/PromptEditorScene';
import { BattleScene } from '../scenes/BattleScene';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 1200,
  height: 800,
  backgroundColor: '#1a1a2e',
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 0 }, // Top-down view, no gravity
      debug: false, // Disable debug in all modes for cleaner visuals
    },
  },
  scene: [BootScene, PromptEditorScene, BattleScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // Disable right-click context menu
  disableContextMenu: true,
};
