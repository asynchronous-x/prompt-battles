import { useState, useEffect, useCallback } from 'react';
import { HomeScreen } from './HomeScreen';
import { DownloadScreen } from './DownloadScreen';
import { PromptEditorScreen } from './PromptEditorScreen';
import { HowToPlayScreen } from './HowToPlayScreen';
import { llmService } from '../llm/LLMService';
import { TankBehavior } from '../llm/types';
import './styles.css';

export type Screen = 'home' | 'download' | 'editor' | 'howtoplay';

interface AppProps {
  onStartBattle: (behaviors: (TankBehavior | null)[]) => void;
  behaviors: Map<number, TankBehavior>;
  onBehaviorUpdate: (tankIndex: number, behavior: TankBehavior) => void;
  initialScreen: Screen;
}

export function App({ onStartBattle, behaviors, onBehaviorUpdate, initialScreen }: AppProps) {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [webGpuAvailable, setWebGpuAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    // Check WebGPU on mount
    llmService.isAvailable().then(setWebGpuAvailable);

    // Check if model is already loaded
    if (llmService.isModelLoaded()) {
      setModelLoaded(true);
    }
  }, []);

  // Update screen when initialScreen prop changes (e.g., returning from battle)
  useEffect(() => {
    // If returning to editor and model is loaded, go to editor
    if (initialScreen === 'editor' && modelLoaded) {
      setScreen('editor');
    } else if (initialScreen === 'editor' && !modelLoaded) {
      // If model not loaded, go to download first
      setScreen('download');
    }
  }, [initialScreen, modelLoaded]);

  const handlePlay = useCallback(() => {
    if (modelLoaded) {
      setScreen('editor');
    } else {
      setScreen('download');
    }
  }, [modelLoaded]);

  const handleModelLoaded = useCallback(() => {
    setModelLoaded(true);
    setScreen('editor');
  }, []);

  const handleStartBattle = useCallback(() => {
    const behaviorsArray: (TankBehavior | null)[] = [];
    for (let i = 0; i < 4; i++) {
      behaviorsArray.push(behaviors.get(i) || null);
    }
    onStartBattle(behaviorsArray);
  }, [behaviors, onStartBattle]);

  return (
    <div className="screen-container">
      <div className="retro-bg" />
      <div className="grid-overlay" />
      <div className="scanlines" />

      {screen === 'home' && (
        <HomeScreen
          onPlay={handlePlay}
          onHowToPlay={() => setScreen('howtoplay')}
        />
      )}

      {screen === 'howtoplay' && (
        <HowToPlayScreen onBack={() => setScreen('home')} />
      )}

      {screen === 'download' && (
        <DownloadScreen
          webGpuAvailable={webGpuAvailable}
          onModelLoaded={handleModelLoaded}
          onBack={() => setScreen('home')}
        />
      )}

      {screen === 'editor' && (
        <PromptEditorScreen
          behaviors={behaviors}
          onBehaviorUpdate={onBehaviorUpdate}
          onStartBattle={handleStartBattle}
        />
      )}
    </div>
  );
}
