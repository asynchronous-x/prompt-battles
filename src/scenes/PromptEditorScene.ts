import Phaser from 'phaser';
import { llmService } from '../llm/LLMService';
import { EXAMPLE_PROMPTS } from '../llm/PromptBuilder';
import { TankBehavior } from '../llm/types';
import { DEFAULT_MODEL } from '../llm/WebLLMProvider';

const SCENE_WIDTH = 1200;
const SCENE_HEIGHT = 800;

type SceneState = 'checking' | 'loading_model' | 'ready' | 'generating';

export class PromptEditorScene extends Phaser.Scene {
  private promptText: string = '';
  private statusText!: Phaser.GameObjects.Text;
  private codePreviewText!: Phaser.GameObjects.Text;
  private behaviors: Map<number, TankBehavior> = new Map();
  private currentTankIndex: number = 0;
  private inputElement: HTMLTextAreaElement | null = null;

  // Model loading UI elements
  private loadingContainer!: Phaser.GameObjects.Container;
  private progressBar!: Phaser.GameObjects.Graphics;
  private progressText!: Phaser.GameObjects.Text;
  private loadingStatusText!: Phaser.GameObjects.Text;

  // Editor UI elements (created after model loads)
  private editorContainer!: Phaser.GameObjects.Container;

  private sceneState: SceneState = 'checking';

  constructor() {
    super({ key: 'PromptEditorScene' });
  }

  create(): void {
    // Background
    this.add.rectangle(SCENE_WIDTH / 2, SCENE_HEIGHT / 2, SCENE_WIDTH, SCENE_HEIGHT, 0x1a1a2e);

    // Title
    this.add.text(SCENE_WIDTH / 2, 30, 'PROMPT BATTLES', {
      font: 'bold 36px monospace',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Create loading UI
    this.createLoadingUI();

    // Create editor UI (hidden initially)
    this.createEditorUI();
    this.editorContainer.setVisible(false);

    // Start loading the model
    this.initializeModel();

    // Clean up on scene shutdown
    this.events.on('shutdown', () => {
      this.cleanupInputElement();
    });
  }

  private createLoadingUI(): void {
    this.loadingContainer = this.add.container(SCENE_WIDTH / 2, SCENE_HEIGHT / 2);

    // Loading title
    const title = this.add.text(0, -120, 'Loading AI Model', {
      font: 'bold 28px monospace',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Subtitle
    const subtitle = this.add.text(0, -80, 'This runs entirely in your browser using WebGPU', {
      font: '16px monospace',
      color: '#888888',
    }).setOrigin(0.5);

    // Progress bar background
    const progressBg = this.add.rectangle(0, 0, 500, 40, 0x2a2a4e)
      .setStrokeStyle(2, 0x4a4a6e);

    // Progress bar fill
    this.progressBar = this.add.graphics();

    // Progress percentage text
    this.progressText = this.add.text(0, 0, '0%', {
      font: 'bold 18px monospace',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Status text (shows what's happening)
    this.loadingStatusText = this.add.text(0, 50, 'Checking WebGPU availability...', {
      font: '14px monospace',
      color: '#aaaaaa',
      wordWrap: { width: 500 },
      align: 'center',
    }).setOrigin(0.5);

    // Model info
    const modelInfo = this.add.text(0, 120, `Model: Qwen2.5-Coder-1.5B (~1GB download on first use)`, {
      font: '12px monospace',
      color: '#666666',
    }).setOrigin(0.5);

    // First time notice
    const notice = this.add.text(0, 150, 'First load may take 1-2 minutes. Model is cached for future visits.', {
      font: '12px monospace',
      color: '#666666',
    }).setOrigin(0.5);

    this.loadingContainer.add([title, subtitle, progressBg, this.progressBar, this.progressText, this.loadingStatusText, modelInfo, notice]);
  }

  private updateProgress(progress: number, text: string): void {
    // Update progress bar
    this.progressBar.clear();
    this.progressBar.fillStyle(0x4a90d9, 1);
    this.progressBar.fillRect(-248, -18, 496 * (progress / 100), 36);

    // Update text
    this.progressText.setText(`${Math.round(progress)}%`);
    this.loadingStatusText.setText(text);
  }

  private async initializeModel(): Promise<void> {
    this.sceneState = 'checking';

    // Check WebGPU availability
    const available = await llmService.isAvailable();

    if (!available) {
      this.loadingStatusText.setText(
        'WebGPU is not available in this browser.\n\n' +
        'Please use Chrome, Edge, or another WebGPU-enabled browser.\n' +
        'Make sure hardware acceleration is enabled in settings.'
      );
      this.loadingStatusText.setColor('#ff6666');
      return;
    }

    // Set up progress callback
    llmService.setProgressCallback((progress) => {
      this.updateProgress(progress.progress, progress.text);
    });

    // Start loading model
    this.sceneState = 'loading_model';
    this.loadingStatusText.setText('Initializing model...');

    const success = await llmService.loadModel(DEFAULT_MODEL);

    if (success) {
      this.sceneState = 'ready';
      this.showEditor();
    } else {
      this.loadingStatusText.setText('Failed to load model. Please refresh and try again.');
      this.loadingStatusText.setColor('#ff6666');
    }
  }

  private showEditor(): void {
    // Hide loading UI
    this.loadingContainer.setVisible(false);

    // Show editor UI
    this.editorContainer.setVisible(true);

    // Create the HTML input element now
    this.createInputElement();

    // Update status
    this.statusText.setText('Model loaded! Ready to generate code.');
    this.statusText.setColor('#66ff66');
  }

  private createEditorUI(): void {
    this.editorContainer = this.add.container(0, 0);

    // Subtitle
    const subtitle = this.add.text(SCENE_WIDTH / 2, 70, 'Write your tank AI strategy', {
      font: '18px monospace',
      color: '#888888',
    }).setOrigin(0.5);
    this.editorContainer.add(subtitle);

    // Tank selector
    this.createTankSelector();

    // Prompt input label
    const inputLabel = this.add.text(60, 190, 'Your Strategy Prompt:', {
      font: 'bold 16px monospace',
      color: '#ffffff',
    });
    this.editorContainer.add(inputLabel);

    // Example prompts
    this.createExampleButtons();

    // Generate button
    this.createGenerateButton();

    // Code preview area
    this.createCodePreview();

    // Status text
    this.statusText = this.add.text(SCENE_WIDTH / 2, SCENE_HEIGHT - 100, '', {
      font: '16px monospace',
      color: '#ffff00',
    }).setOrigin(0.5);
    this.editorContainer.add(this.statusText);

    // Start battle button
    this.createStartButton();
  }

  private createTankSelector(): void {
    const colors = [0x4a90d9, 0xd94a4a, 0x4ad94a, 0xd9d94a];
    const labels = ['Tank 1 (You)', 'Tank 2 (AI)', 'Tank 3 (AI)', 'Tank 4 (AI)'];

    const label = this.add.text(60, 110, 'Configure Tank:', {
      font: 'bold 16px monospace',
      color: '#ffffff',
    });
    this.editorContainer.add(label);

    for (let i = 0; i < 4; i++) {
      const x = 60 + i * 140;
      const y = 145;

      const btn = this.add.rectangle(x + 50, y, 120, 35, colors[i], 0.8)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => btn.setFillStyle(colors[i], 1))
        .on('pointerout', () => btn.setFillStyle(colors[i], i === this.currentTankIndex ? 1 : 0.5))
        .on('pointerdown', () => this.selectTank(i));

      if (i === this.currentTankIndex) {
        btn.setFillStyle(colors[i], 1);
        btn.setStrokeStyle(2, 0xffffff);
      }

      const btnLabel = this.add.text(x + 50, y, labels[i], {
        font: '12px monospace',
        color: '#ffffff',
      }).setOrigin(0.5);

      this.editorContainer.add([btn, btnLabel]);
    }
  }

  private selectTank(index: number): void {
    this.currentTankIndex = index;
    // Clean up input before restart
    this.cleanupInputElement();
    this.scene.restart();
  }

  private createInputElement(): void {
    const gameCanvas = this.game.canvas;
    const canvasRect = gameCanvas.getBoundingClientRect();

    this.inputElement = document.createElement('textarea');
    this.inputElement.style.position = 'absolute';
    this.inputElement.style.left = `${canvasRect.left + 60}px`;
    this.inputElement.style.top = `${canvasRect.top + 215}px`;
    this.inputElement.style.width = '500px';
    this.inputElement.style.height = '120px';
    this.inputElement.style.backgroundColor = '#2a2a4e';
    this.inputElement.style.color = '#ffffff';
    this.inputElement.style.border = '2px solid #4a4a6e';
    this.inputElement.style.borderRadius = '5px';
    this.inputElement.style.padding = '10px';
    this.inputElement.style.fontFamily = 'monospace';
    this.inputElement.style.fontSize = '14px';
    this.inputElement.style.resize = 'none';
    this.inputElement.placeholder = 'Describe your tank strategy here...\n\nExample: "Be aggressive. Chase the nearest enemy. Fire constantly."';

    this.inputElement.addEventListener('input', () => {
      this.promptText = this.inputElement?.value || '';
    });

    document.body.appendChild(this.inputElement);
  }

  private cleanupInputElement(): void {
    if (this.inputElement) {
      this.inputElement.remove();
      this.inputElement = null;
    }
  }

  private createExampleButtons(): void {
    const label = this.add.text(60, 360, 'Example Strategies:', {
      font: 'bold 14px monospace',
      color: '#888888',
    });
    this.editorContainer.add(label);

    const examples = Object.entries(EXAMPLE_PROMPTS);
    const buttonsPerRow = 3;

    examples.forEach(([name, prompt], index) => {
      const row = Math.floor(index / buttonsPerRow);
      const col = index % buttonsPerRow;
      const x = 60 + col * 180;
      const y = 390 + row * 40;

      const btn = this.add.rectangle(x + 75, y + 12, 160, 30, 0x3a3a5e)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => btn.setFillStyle(0x4a4a7e))
        .on('pointerout', () => btn.setFillStyle(0x3a3a5e))
        .on('pointerdown', () => {
          if (this.inputElement) {
            this.inputElement.value = prompt;
            this.promptText = prompt;
          }
        });

      const btnLabel = this.add.text(x + 75, y + 12, name.charAt(0).toUpperCase() + name.slice(1), {
        font: '12px monospace',
        color: '#ffffff',
      }).setOrigin(0.5);

      this.editorContainer.add([btn, btnLabel]);
    });
  }

  private createGenerateButton(): void {
    const btn = this.add.rectangle(300, 500, 200, 50, 0x4a90d9)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => btn.setFillStyle(0x5aa0e9))
      .on('pointerout', () => btn.setFillStyle(0x4a90d9))
      .on('pointerdown', () => this.generateCode());

    const btnLabel = this.add.text(300, 500, 'Generate AI Code', {
      font: 'bold 16px monospace',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.editorContainer.add([btn, btnLabel]);
  }

  private createCodePreview(): void {
    // Code preview panel
    const panel = this.add.rectangle(870, 350, 560, 400, 0x2a2a4e).setStrokeStyle(2, 0x4a4a6e);

    const label = this.add.text(610, 160, 'Generated Code Preview:', {
      font: 'bold 16px monospace',
      color: '#ffffff',
    });

    this.codePreviewText = this.add.text(610, 190, '// Code will appear here after generation...', {
      font: '11px monospace',
      color: '#88ff88',
      wordWrap: { width: 520 },
    });

    this.editorContainer.add([panel, label, this.codePreviewText]);
  }

  private createStartButton(): void {
    const btn = this.add.rectangle(SCENE_WIDTH / 2, SCENE_HEIGHT - 50, 250, 50, 0x4ad94a)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => btn.setFillStyle(0x5ae95a))
      .on('pointerout', () => btn.setFillStyle(0x4ad94a))
      .on('pointerdown', () => this.startBattle());

    const btnLabel = this.add.text(SCENE_WIDTH / 2, SCENE_HEIGHT - 50, 'START BATTLE', {
      font: 'bold 20px monospace',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.editorContainer.add([btn, btnLabel]);
  }

  private async generateCode(): Promise<void> {
    if (this.sceneState === 'generating') return;

    if (!this.promptText.trim()) {
      this.statusText.setText('Please enter a strategy prompt first!');
      this.statusText.setColor('#ff6666');
      return;
    }

    this.sceneState = 'generating';
    this.statusText.setText('Generating AI code...');
    this.statusText.setColor('#ffff66');
    this.codePreviewText.setText('// Generating...');

    try {
      const result = await llmService.generateWithAutoRetry(this.promptText);

      if (result.success && result.behavior) {
        this.codePreviewText.setText(result.behavior.code);

        // Store the behavior for this tank
        this.behaviors.set(this.currentTankIndex, result.behavior);

        this.statusText.setText(`Code generated successfully for Tank ${this.currentTankIndex + 1}!`);
        this.statusText.setColor('#66ff66');
      } else {
        this.statusText.setText(`Generation failed: ${result.error}`);
        this.statusText.setColor('#ff6666');
        this.codePreviewText.setText(`// Error: ${result.error}\n\n// Raw response:\n${result.rawResponse || 'None'}`);
      }
    } catch (error) {
      this.statusText.setText(`Error: ${(error as Error).message}`);
      this.statusText.setColor('#ff6666');
    }

    this.sceneState = 'ready';
  }

  private startBattle(): void {
    // Clean up HTML elements
    this.cleanupInputElement();

    // Pass behaviors to battle scene
    const behaviorsArray: (TankBehavior | null)[] = [];
    for (let i = 0; i < 4; i++) {
      behaviorsArray.push(this.behaviors.get(i) || null);
    }

    this.scene.start('BattleScene', { behaviors: behaviorsArray });
  }
}
