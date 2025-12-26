import { GenerationResult, TankBehavior } from './types';
import { WebLLMProvider, webLLMProvider, ProgressCallback, DEFAULT_MODEL, AVAILABLE_MODELS, AvailableModel } from './WebLLMProvider';
import { CodeValidator, codeValidator } from './CodeValidator';
import { TANK_API_SYSTEM_PROMPT, buildUserPrompt, EXAMPLE_PROMPTS } from './PromptBuilder';

export class LLMService {
  private provider: WebLLMProvider;
  private validator: CodeValidator;

  constructor(provider?: WebLLMProvider, validator?: CodeValidator) {
    this.provider = provider || webLLMProvider;
    this.validator = validator || codeValidator;
  }

  /**
   * Set a callback for model loading progress
   */
  setProgressCallback(callback: ProgressCallback | null): void {
    this.provider.setProgressCallback(callback);
  }

  /**
   * Load the LLM model (downloads on first use, ~1GB)
   */
  async loadModel(modelId: AvailableModel = DEFAULT_MODEL): Promise<boolean> {
    return this.provider.loadModel(modelId);
  }

  /**
   * Check if WebGPU is available for in-browser inference
   */
  async isAvailable(): Promise<boolean> {
    return this.provider.isAvailable();
  }

  /**
   * Check if a model is currently loaded and ready
   */
  isModelLoaded(): boolean {
    return this.provider.isModelLoaded();
  }

  /**
   * Check if model is currently loading
   */
  isLoading(): boolean {
    return this.provider.isCurrentlyLoading();
  }

  /**
   * Get the current model ID
   */
  getCurrentModel(): string | null {
    return this.provider.getCurrentModel();
  }

  /**
   * Get list of available models
   */
  getAvailableModels(): readonly string[] {
    return AVAILABLE_MODELS;
  }

  /**
   * Get model info for display
   */
  getModelInfo(modelId: string) {
    return WebLLMProvider.getModelInfo(modelId);
  }

  /**
   * Generate tank behavior code from a user strategy prompt
   */
  async generateBehavior(userStrategy: string): Promise<GenerationResult> {
    try {
      // Check if model is loaded
      if (!this.isModelLoaded()) {
        return {
          success: false,
          error: 'Model not loaded. Please wait for the model to finish loading.',
        };
      }

      // Build prompts
      const systemPrompt = TANK_API_SYSTEM_PROMPT;
      const userPrompt = buildUserPrompt(userStrategy);

      // Generate code
      console.log('Generating behavior for strategy:', userStrategy);
      const response = await this.provider.generate(systemPrompt, userPrompt);

      if (!response.success || !response.content) {
        return {
          success: false,
          error: response.error || 'No response from model',
        };
      }

      const rawResponse = response.content;
      console.log('Raw LLM response:', rawResponse);

      // Clean and validate the code
      const cleanedCode = this.validator.getCleanedCode(rawResponse);
      console.log('Cleaned code:', cleanedCode);

      const validation = this.validator.validate(rawResponse);
      console.log('Validation result:', validation);

      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join('\n'),
          rawResponse,
          behavior: {
            code: cleanedCode,
            strategy: userStrategy,
            isValid: false,
            error: validation.errors.join('\n'),
          },
        };
      }

      // Success!
      const behavior: TankBehavior = {
        code: cleanedCode,
        strategy: userStrategy,
        isValid: true,
      };

      return {
        success: true,
        behavior,
        rawResponse,
      };
    } catch (error) {
      console.error('LLM generation error:', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Retry generation with feedback about what went wrong
   */
  async regenerateWithFeedback(
    userStrategy: string,
    previousCode: string,
    errorMessage: string
  ): Promise<GenerationResult> {
    // Provide specific guidance based on common errors
    let fixHint = '';
    if (errorMessage.includes('enemy.distanceTo is not a function')) {
      fixHint = '\nFIX: Use tank.distanceTo(enemy.position) instead of enemy.distanceTo(). Enemy objects are plain data with no methods.';
    } else if (errorMessage.includes('enemy.angleTo is not a function')) {
      fixHint = '\nFIX: Use tank.angleTo(enemy.position) instead of enemy.angleTo(). Enemy objects are plain data with no methods.';
    } else if (errorMessage.includes('is not a function')) {
      fixHint = '\nFIX: Only use methods defined in the API. Enemy objects have no methods - only data (position, distance, health).';
    }

    const feedbackPrompt = `${buildUserPrompt(userStrategy)}

CRITICAL ERROR in your previous code:
${errorMessage}${fixHint}

Your broken code:
${previousCode}

Output ONLY the fixed code. Do NOT repeat the same mistake.`;

    try {
      const response = await this.provider.generate(TANK_API_SYSTEM_PROMPT, feedbackPrompt);

      if (!response.success || !response.content) {
        return {
          success: false,
          error: response.error || 'No response from model',
        };
      }

      const rawResponse = response.content;
      const cleanedCode = this.validator.getCleanedCode(rawResponse);
      const validation = this.validator.validate(rawResponse);

      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join('\n'),
          rawResponse,
        };
      }

      return {
        success: true,
        behavior: {
          code: cleanedCode,
          strategy: userStrategy,
          isValid: true,
        },
        rawResponse,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Generate with auto-retry on validation failure
   */
  async generateWithAutoRetry(
    userStrategy: string,
    maxRetries: number = 3
  ): Promise<GenerationResult> {
    let result = await this.generateBehavior(userStrategy);
    let lastCode = result.behavior?.code || result.rawResponse || '';

    for (let i = 0; i < maxRetries && !result.success; i++) {
      // Need some code to provide as feedback
      if (!lastCode) {
        console.log('No code to retry with, using fallback');
        break;
      }

      console.log(`Retry ${i + 1}/${maxRetries} due to error:`, result.error);
      result = await this.regenerateWithFeedback(
        userStrategy,
        lastCode,
        result.error || 'Unknown error'
      );

      // Update lastCode for next retry
      if (result.behavior?.code) {
        lastCode = result.behavior.code;
      } else if (result.rawResponse) {
        lastCode = result.rawResponse;
      }
    }

    // If still not successful after all retries, report failure
    if (!result.success) {
      console.log('All retries failed, reporting error to user');
      return {
        success: false,
        error: `Code generation failed after ${maxRetries} attempts. Last error: ${result.error}`,
        rawResponse: result.rawResponse,
      };
    }

    return result;
  }

  /**
   * Get a fallback behavior if LLM generation fails
   */
  getFallbackBehavior(strategy: string): TankBehavior {
    return {
      code: `
// Fallback AI - using basic combat behavior
const enemy = tank.getNearestEnemy();
if (!enemy) {
  tank.turn(0.5);
  tank.move(0.3);
  return;
}
tank.aimAt(enemy.position);
const dist = tank.distanceTo(enemy.position);
if (dist > 300) {
  tank.move(0.8);
} else if (dist < 150) {
  tank.move(-0.5);
} else {
  tank.move(0.2);
}
if (tank.canFire()) {
  tank.fire();
}
`.trim(),
      strategy: `Fallback for: ${strategy}`,
      isValid: true,
    };
  }

  /**
   * Get available example prompts
   */
  getExamplePrompts(): typeof EXAMPLE_PROMPTS {
    return EXAMPLE_PROMPTS;
  }

  /**
   * Validate code without generating (for user-written code)
   */
  validateCode(code: string): { valid: boolean; errors: string[]; cleanedCode: string } {
    const validation = this.validator.validate(code);
    return {
      valid: validation.valid,
      errors: validation.errors,
      cleanedCode: this.validator.getCleanedCode(code),
    };
  }

  /**
   * Unload the model to free memory
   */
  async unloadModel(): Promise<void> {
    await this.provider.unload();
  }
}

// Singleton instance
export const llmService = new LLMService();
