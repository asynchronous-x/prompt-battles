import { useState, useCallback } from 'react';
import { llmService } from '../llm/LLMService';
import { EXAMPLE_PROMPTS } from '../llm/PromptBuilder';
import { TankBehavior } from '../llm/types';
import { LogicBlocks } from './LogicBlocks';

interface PromptEditorScreenProps {
  behaviors: Map<number, TankBehavior>;
  onBehaviorUpdate: (tankIndex: number, behavior: TankBehavior) => void;
  onStartBattle: () => void;
}

export function PromptEditorScreen({
  behaviors,
  onBehaviorUpdate,
  onStartBattle
}: PromptEditorScreenProps) {
  const [promptText, setPromptText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'loading'; message: string } | null>(null);

  // Player's tank is always Tank 0
  const playerBehavior = behaviors.get(0);
  const hasValidBehavior = playerBehavior?.isValid === true;

  const handleExampleClick = useCallback((prompt: string) => {
    setPromptText(prompt);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (isGenerating || !promptText.trim()) {
      if (!promptText.trim()) {
        setStatus({ type: 'error', message: 'Enter a strategy prompt first!' });
      }
      return;
    }

    setIsGenerating(true);
    setStatus({ type: 'loading', message: 'Generating AI code...' });

    try {
      const result = await llmService.generateWithAutoRetry(promptText);

      if (result.success && result.behavior) {
        onBehaviorUpdate(0, result.behavior); // Always update player's tank (index 0)
        setStatus({ type: 'success', message: 'Your tank AI is ready!' });
      } else {
        setStatus({ type: 'error', message: result.error || 'Generation failed' });
      }
    } catch (err) {
      setStatus({ type: 'error', message: (err as Error).message });
    }

    setIsGenerating(false);
  }, [isGenerating, promptText, onBehaviorUpdate]);

  const canStartBattle = hasValidBehavior && !isGenerating;

  return (
    <div className="editor-screen screen-enter">
      <div className="editor-header">
        <h1 className="editor-title"><i className="hn hn-fire"></i> BATTLE SETUP</h1>
        <p className="editor-subtitle">Program your tank to fight 7 enemy AIs</p>
      </div>

      <div className="editor-main">
        {/* Left Panel - Input */}
        <div className="editor-panel">
          <div className="panel-header">
            <i className="hn hn-gaming"></i>
            YOUR TANK STRATEGY
          </div>

          {/* Player Tank Indicator */}
          <div className="player-tank-indicator">
            <div className="tank-icon player-tank" />
            <span className="player-label">You control the <strong>Blue Tank</strong></span>
          </div>

          {/* Prompt Input */}
          <textarea
            className="prompt-input"
            placeholder="Describe your tank strategy...

Example: 'Be aggressive, chase enemies, fire constantly'"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            disabled={isGenerating}
          />

          {/* Example Buttons */}
          <div className="examples-grid">
            {Object.entries(EXAMPLE_PROMPTS).map(([name, prompt]) => (
              <button
                key={name}
                className="example-btn"
                onClick={() => handleExampleClick(prompt)}
                disabled={isGenerating}
              >
                {name}
              </button>
            ))}
          </div>

          {/* Generate Button */}
          <button
            className={`generate-btn ${isGenerating ? 'generating' : ''}`}
            onClick={handleGenerate}
            disabled={isGenerating || !promptText.trim()}
          >
            {isGenerating ? <><i className="hn hn-spinner"></i> GENERATING...</> : <><i className="hn hn-robot"></i> GENERATE AI</>}
          </button>

          {status && (
            <p className={`status-message ${status.type}`}>
              {status.message}
            </p>
          )}
        </div>

        {/* Right Panel - Logic Visualization */}
        <div className="editor-panel">
          <div className="panel-header">
            <i className="hn hn-machine-learning"></i>
            YOUR AI BEHAVIOR
          </div>

          <LogicBlocks code={playerBehavior?.code || ''} />
        </div>
      </div>

      {/* Battle Section */}
      <div className="battle-section">
        <button
          className={`battle-btn ${!canStartBattle ? 'disabled' : ''}`}
          onClick={onStartBattle}
          disabled={!canStartBattle}
        >
          <i className="hn hn-play"></i> START BATTLE
        </button>
        {!hasValidBehavior && (
          <p className="status-message" style={{ color: '#888' }}>
            Generate your tank's AI to start the battle
          </p>
        )}
      </div>
    </div>
  );
}
