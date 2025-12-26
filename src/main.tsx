import { useState, useCallback, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import Phaser from 'phaser';
import { App } from './ui/App';
import { TankBehavior } from './llm/types';
import { BattleScene } from './scenes/BattleScene';
import { BootScene } from './scenes/BootScene';

// Prevent context menu on right-click
document.addEventListener('contextmenu', (e) => e.preventDefault());

function GameApp() {
  const [showGame, setShowGame] = useState(false);
  const [behaviors, setBehaviors] = useState<Map<number, TankBehavior>>(new Map());
  const [returnToEditor, setReturnToEditor] = useState(false);
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleStartBattle = useCallback((newBehaviors: (TankBehavior | null)[]) => {
    // Convert array to map for consistency
    const behaviorMap = new Map<number, TankBehavior>();
    newBehaviors.forEach((b, i) => {
      if (b) behaviorMap.set(i, b);
    });
    setBehaviors(behaviorMap);
    setShowGame(true);
    setReturnToEditor(false);
  }, []);

  const handleBehaviorUpdate = useCallback((tankIndex: number, behavior: TankBehavior) => {
    setBehaviors(prev => {
      const next = new Map(prev);
      next.set(tankIndex, behavior);
      return next;
    });
  }, []);

  // Initialize Phaser game when showGame becomes true
  useEffect(() => {
    if (showGame && containerRef.current && !gameRef.current) {
      // Convert map back to array for Phaser
      const behaviorsArray: (TankBehavior | null)[] = [];
      for (let i = 0; i < 4; i++) {
        behaviorsArray.push(behaviors.get(i) || null);
      }

      // Create modified game config
      const gameConfig: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        parent: containerRef.current,
        width: 1200,
        height: 800,
        backgroundColor: '#1a1a2e',
        physics: {
          default: 'matter',
          matter: {
            gravity: { x: 0, y: 0 },
            debug: false,
          },
        },
        scene: [BootScene, BattleScene],
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        disableContextMenu: true,
      };

      gameRef.current = new Phaser.Game(gameConfig);

      // Wait for boot scene to complete, then start battle
      gameRef.current.events.once('ready', () => {
        // Skip boot and go directly to battle with behaviors
        setTimeout(() => {
          if (gameRef.current) {
            gameRef.current.scene.start('BattleScene', { behaviors: behaviorsArray });
          }
        }, 100);
      });

      // Handle window resize
      const handleResize = () => {
        if (gameRef.current) {
          gameRef.current.scale.refresh();
        }
      };
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [showGame, behaviors]);

  // Handle returning from battle to editor
  const handleBackToEditor = useCallback(() => {
    if (gameRef.current) {
      gameRef.current.destroy(true);
      gameRef.current = null;
    }
    setShowGame(false);
    setReturnToEditor(true); // Signal to App to go to editor
  }, []);

  // Listen for back-to-menu events from Phaser
  useEffect(() => {
    const handlePhaserEvent = (event: CustomEvent) => {
      if (event.detail === 'backToMenu') {
        handleBackToEditor();
      }
    };

    window.addEventListener('phaserEvent' as any, handlePhaserEvent);
    return () => {
      window.removeEventListener('phaserEvent' as any, handlePhaserEvent);
    };
  }, [handleBackToEditor]);

  if (showGame) {
    return (
      <div
        ref={containerRef}
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0a',
        }}
      />
    );
  }

  return (
    <App
      onStartBattle={handleStartBattle}
      behaviors={behaviors}
      onBehaviorUpdate={handleBehaviorUpdate}
      initialScreen={returnToEditor ? 'editor' : 'home'}
    />
  );
}

// Mount the React app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<GameApp />);
}
