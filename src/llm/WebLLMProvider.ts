import { CreateMLCEngine, MLCEngine, prebuiltAppConfig } from '@mlc-ai/web-llm';
import { LLMProvider, LLMResponse } from './types';

// Progress callback type for model loading
export type ModelLoadProgress = {
  progress: number; // 0-100
  text: string;
  timeElapsed?: number;
};

export type ProgressCallback = (progress: ModelLoadProgress) => void;

// Available models for code generation (smaller models for faster loading)
export const AVAILABLE_MODELS = [
  'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
  'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC',
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
  'gemma-2-2b-it-q4f16_1-MLC',
] as const;

export type AvailableModel = typeof AVAILABLE_MODELS[number];

// Default model - good balance of size and code quality
export const DEFAULT_MODEL: AvailableModel = 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC';

export class WebLLMProvider implements LLMProvider {
  private engine: MLCEngine | null = null;
  private currentModel: string | null = null;
  private isLoading: boolean = false;
  private progressCallback: ProgressCallback | null = null;

  constructor() {
    // Log available models on init
    console.log('WebLLM available prebuilt models:',
      prebuiltAppConfig.model_list.map(m => m.model_id).filter(id =>
        id.toLowerCase().includes('qwen') ||
        id.toLowerCase().includes('smol') ||
        id.toLowerCase().includes('gemma')
      )
    );
  }

  setProgressCallback(callback: ProgressCallback | null): void {
    this.progressCallback = callback;
  }

  async loadModel(modelId: string = DEFAULT_MODEL): Promise<boolean> {
    if (this.isLoading) {
      console.warn('Model is already loading');
      return false;
    }

    if (this.engine && this.currentModel === modelId) {
      console.log('Model already loaded:', modelId);
      return true;
    }

    this.isLoading = true;
    const startTime = Date.now();

    try {
      // Unload previous model if exists
      if (this.engine) {
        await this.engine.unload();
        this.engine = null;
        this.currentModel = null;
      }

      console.log('Loading WebLLM model:', modelId);

      this.engine = await CreateMLCEngine(modelId, {
        initProgressCallback: (report) => {
          const elapsed = (Date.now() - startTime) / 1000;

          if (this.progressCallback) {
            this.progressCallback({
              progress: report.progress * 100,
              text: report.text,
              timeElapsed: elapsed,
            });
          }

          console.log(`[${elapsed.toFixed(1)}s] ${report.text} (${(report.progress * 100).toFixed(1)}%)`);
        },
      });

      this.currentModel = modelId;
      console.log('Model loaded successfully:', modelId);

      return true;
    } catch (error) {
      console.error('Failed to load model:', error);
      this.engine = null;
      this.currentModel = null;
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  async isAvailable(): Promise<boolean> {
    // Check if WebGPU is available
    if (!navigator.gpu) {
      console.warn('WebGPU is not available in this browser');
      return false;
    }

    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        console.warn('No WebGPU adapter found');
        return false;
      }
      return true;
    } catch (error) {
      console.error('WebGPU check failed:', error);
      return false;
    }
  }

  isModelLoaded(): boolean {
    return this.engine !== null && this.currentModel !== null;
  }

  getCurrentModel(): string | null {
    return this.currentModel;
  }

  isCurrentlyLoading(): boolean {
    return this.isLoading;
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
    if (!this.engine) {
      return {
        success: false,
        error: 'Model not loaded. Please wait for the model to finish loading.',
      };
    }

    try {
      const response = await this.engine.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      });

      const content = response.choices[0]?.message?.content;

      if (!content) {
        return {
          success: false,
          error: 'Empty response from model',
        };
      }

      return {
        success: true,
        content,
      };
    } catch (error) {
      console.error('WebLLM generation error:', error);
      return {
        success: false,
        error: `Generation failed: ${(error as Error).message}`,
      };
    }
  }

  async unload(): Promise<void> {
    if (this.engine) {
      await this.engine.unload();
      this.engine = null;
      this.currentModel = null;
    }
  }

  // Get estimated model size for UI
  static getModelInfo(modelId: string): { name: string; sizeGB: number; description: string } | null {
    const modelInfo: Record<string, { name: string; sizeGB: number; description: string }> = {
      'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC': {
        name: 'Qwen2.5 Coder 1.5B',
        sizeGB: 1.0,
        description: 'Fast, good code generation',
      },
      'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC': {
        name: 'Qwen2.5 Coder 3B',
        sizeGB: 1.8,
        description: 'Better quality, slower',
      },
      'Qwen2.5-1.5B-Instruct-q4f16_1-MLC': {
        name: 'Qwen2.5 1.5B',
        sizeGB: 1.0,
        description: 'General purpose',
      },
      'SmolLM2-1.7B-Instruct-q4f16_1-MLC': {
        name: 'SmolLM2 1.7B',
        sizeGB: 1.1,
        description: 'Very fast, compact',
      },
      'gemma-2-2b-it-q4f16_1-MLC': {
        name: 'Gemma 2 2B',
        sizeGB: 1.4,
        description: 'Google model, balanced',
      },
    };

    return modelInfo[modelId] || null;
  }
}

// Singleton instance
export const webLLMProvider = new WebLLMProvider();
