export interface TankBehavior {
  code: string;
  strategy: string;
  isValid: boolean;
  error?: string;
}

export interface GenerationResult {
  success: boolean;
  behavior?: TankBehavior;
  error?: string;
  rawResponse?: string;
}

export interface LLMResponse {
  success: boolean;
  content?: string;
  error?: string;
}

export interface LLMProvider {
  generate(systemPrompt: string, userPrompt: string): Promise<LLMResponse>;
  isAvailable(): Promise<boolean>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
