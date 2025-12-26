import { ValidationResult } from './types';

// List of allowed global functions/objects (for future AST validation)
export const ALLOWED_GLOBALS = new Set([
  'Math',
  'Number',
  'String',
  'Boolean',
  'Array',
  'Object',
  'JSON',
  'console',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'undefined',
  'null',
  'true',
  'false',
  'NaN',
  'Infinity',
]);

// Forbidden patterns that indicate unsafe code
const FORBIDDEN_PATTERNS = [
  /\beval\s*\(/,
  /\bFunction\s*\(/,
  /\bnew\s+Function\b/,
  /\bimport\s*\(/,
  /\bimport\s+/,
  /\brequire\s*\(/,
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bwindow\b/,
  /\bdocument\b/,
  /\bglobal\b/,
  /\bprocess\b/,
  /\b__dirname\b/,
  /\b__filename\b/,
  /\bsetTimeout\b/,
  /\bsetInterval\b/,
  /\bsetImmediate\b/,
  /\brequestAnimationFrame\b/,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bindexedDB\b/,
  /\bnavigator\b/,
  /\blocation\b/,
  /\bhistory\b/,
  /\balert\b/,
  /\bconfirm\b/,
  /\bprompt\b/,
  /\.constructor\b/,
  /\.__proto__\b/,
  /\bprototype\b/,
  /\bthis\b/, // Disallow 'this' to prevent context escaping
];

// Allowed tank API methods
const ALLOWED_TANK_METHODS = new Set([
  // Basic sensors
  'getPosition',
  'getHealth',
  'getHeading',
  'getTurretHeading',
  'canFire',
  'getNearestEnemy',
  'getEnemies',
  // Sensor configuration
  'configureSensors',
  'getSensorCount',
  'getSensorConstraints',
  // Scanning
  'scan',
  'scanAll',
  // Range info
  'getGunRange',
  'getArenaBounds',
  // Wall detection
  'isCollidingWithWall',
  'getWallCollisionSides',
  'getWallDistance',
  'scanWall',
  // Actions
  'move',
  'turn',
  'aimAt',
  'fire',
  // Utilities
  'angleTo',
  'distanceTo',
]);

export class CodeValidator {
  /**
   * Validate that the code is syntactically correct JavaScript
   */
  validateSyntax(code: string): { valid: boolean; error?: string } {
    try {
      // Try to parse as a function body
      new Function('tank', code);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Syntax error: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Check for forbidden patterns that could be unsafe
   */
  checkForbiddenPatterns(code: string): string[] {
    const errors: string[] = [];

    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(code)) {
        errors.push(`Forbidden pattern detected: ${pattern.source}`);
      }
    }

    return errors;
  }

  /**
   * Validate that only allowed tank methods are used
   */
  validateTankMethods(code: string): string[] {
    const warnings: string[] = [];

    // Find all tank.xxx( calls
    const tankMethodCalls = code.matchAll(/tank\.(\w+)\s*\(/g);

    for (const match of tankMethodCalls) {
      const methodName = match[1];
      if (!ALLOWED_TANK_METHODS.has(methodName)) {
        warnings.push(`Unknown tank method: tank.${methodName}()`);
      }
    }

    return warnings;
  }

  /**
   * Inject loop guards to prevent infinite loops
   * Transforms: while (cond) { body } -> { let __i=0; while (cond) { if(++__i>100)break; body } }
   * Limit is 100 since tank code runs every frame - no legitimate need for more iterations
   */
  injectLoopGuards(code: string): string {
    let guardCounter = 0;
    const LOOP_LIMIT = 100;

    // Guard while loops
    code = code.replace(
      /\bwhile\s*\(([^)]+)\)\s*\{/g,
      (_match, condition) => {
        const varName = `__loopGuard${guardCounter++}`;
        return `{ let ${varName}=0; while (${condition}) { if(++${varName}>${LOOP_LIMIT})break;`;
      }
    );

    // Guard for loops
    code = code.replace(
      /\bfor\s*\(([^)]+)\)\s*\{/g,
      (_match, condition) => {
        const varName = `__loopGuard${guardCounter++}`;
        return `{ let ${varName}=0; for (${condition}) { if(++${varName}>${LOOP_LIMIT})break;`;
      }
    );

    // Add closing braces for the wrapper blocks we added
    // Count how many guards we added and add that many closing braces at the end
    for (let i = 0; i < guardCounter; i++) {
      code += ' }';
    }

    return code;
  }

  /**
   * Strip all comments from code (single-line and multi-line)
   * Preserves strings that might contain comment-like patterns
   */
  private stripComments(code: string): string {
    let result = '';
    let i = 0;
    let inString: string | null = null;
    let escaped = false;

    while (i < code.length) {
      const char = code[i];
      const nextChar = code[i + 1];

      // Handle escape sequences in strings
      if (escaped) {
        result += char;
        escaped = false;
        i++;
        continue;
      }

      // Check for escape character
      if (inString && char === '\\') {
        result += char;
        escaped = true;
        i++;
        continue;
      }

      // Handle string boundaries
      if (!inString && (char === '"' || char === "'" || char === '`')) {
        inString = char;
        result += char;
        i++;
        continue;
      }

      if (inString && char === inString) {
        inString = null;
        result += char;
        i++;
        continue;
      }

      // If we're in a string, just add the character
      if (inString) {
        result += char;
        i++;
        continue;
      }

      // Check for multi-line comment start
      if (char === '/' && nextChar === '*') {
        // Skip until we find */
        i += 2;
        while (i < code.length - 1) {
          if (code[i] === '*' && code[i + 1] === '/') {
            i += 2;
            break;
          }
          i++;
        }
        continue;
      }

      // Check for single-line comment
      if (char === '/' && nextChar === '/') {
        // Skip until end of line
        while (i < code.length && code[i] !== '\n') {
          i++;
        }
        continue;
      }

      // Regular character
      result += char;
      i++;
    }

    // Clean up: remove empty lines left by comment removal
    const lines = result.split('\n');
    const cleanedLines = lines.filter(line => line.trim().length > 0);

    return cleanedLines.join('\n').trim();
  }

  /**
   * Clean up code - remove markdown, function wrappers, comments about the code, etc.
   */
  cleanCode(rawCode: string): string {
    let code = rawCode.trim();

    // Remove markdown code blocks
    code = code.replace(/^```(?:javascript|js|typescript|ts)?\n?/gi, '');
    code = code.replace(/\n?```\s*$/gi, '');
    code = code.trim();

    // Remove "Here's the code:" type prefixes
    code = code.replace(/^(?:here'?s?\s+(?:the\s+)?(?:code|solution|implementation)[:\s]*\n?)/i, '');
    code = code.trim();

    // Remove all comments
    code = this.stripComments(code);

    // Extract function body if wrapped in a function definition
    // Matches: function name(tank) { ... }
    const funcMatch = code.match(/^(?:async\s+)?function\s+\w*\s*\(\s*tank\s*\)\s*\{([\s\S]*)\}\s*$/);
    if (funcMatch) {
      code = funcMatch[1].trim();
    }

    // Matches: const name = (tank) => { ... }
    const arrowMatch = code.match(/^(?:const|let|var)\s+\w+\s*=\s*\(?\s*tank\s*\)?\s*=>\s*\{([\s\S]*)\}\s*;?\s*$/);
    if (arrowMatch) {
      code = arrowMatch[1].trim();
    }

    // Matches: (tank) => { ... }
    const pureArrowMatch = code.match(/^\(?\s*tank\s*\)?\s*=>\s*\{([\s\S]*)\}\s*;?\s*$/);
    if (pureArrowMatch) {
      code = pureArrowMatch[1].trim();
    }

    // Remove trailing explanations (text after the code block)
    const lines = code.split('\n');
    const codeLines: string[] = [];
    let inCode = false;
    let braceDepth = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines at the start
      if (!inCode && trimmedLine === '') continue;

      // Start of code (has actual code patterns)
      if (!inCode && (
        trimmedLine.includes('tank.') ||
        trimmedLine.startsWith('const ') ||
        trimmedLine.startsWith('let ') ||
        trimmedLine.startsWith('var ') ||
        trimmedLine.startsWith('if ') ||
        trimmedLine.startsWith('if(') ||
        trimmedLine.startsWith('for ') ||
        trimmedLine.startsWith('while ') ||
        trimmedLine.startsWith('return ') ||
        trimmedLine.startsWith('switch ') ||
        trimmedLine.startsWith('try ')
      )) {
        inCode = true;
      }

      if (inCode) {
        // Track brace depth
        braceDepth += (line.match(/\{/g) || []).length;
        braceDepth -= (line.match(/\}/g) || []).length;

        // End of code (line that looks like prose, not code)
        if (trimmedLine.match(/^[A-Z][a-z].*[.!?]$/) && !trimmedLine.includes('//') && braceDepth === 0) {
          break;
        }

        codeLines.push(line);

        // If we closed all braces and the line ends with }, we might be at the end
        if (braceDepth < 0) {
          // Remove the extra closing brace(s) and stop
          const lastLine = codeLines[codeLines.length - 1];
          codeLines[codeLines.length - 1] = lastLine.replace(/\}\s*$/, '').trimEnd();
          if (codeLines[codeLines.length - 1].trim() === '') {
            codeLines.pop();
          }
          break;
        }
      }
    }

    // If we didn't detect code start, use original
    if (codeLines.length === 0) {
      return code.trim();
    }

    let result = codeLines.join('\n').trim();

    // Final cleanup: remove any trailing orphan closing braces
    while (result.endsWith('}')) {
      const openCount = (result.match(/\{/g) || []).length;
      const closeCount = (result.match(/\}/g) || []).length;
      if (closeCount > openCount) {
        result = result.slice(0, -1).trim();
      } else {
        break;
      }
    }

    // Remove common leading indentation
    const resultLines = result.split('\n');
    const minIndent = resultLines
      .filter(l => l.trim().length > 0)
      .reduce((min, line) => {
        const indent = line.match(/^(\s*)/)?.[1].length || 0;
        return Math.min(min, indent);
      }, Infinity);

    if (minIndent > 0 && minIndent < Infinity) {
      result = resultLines.map(l => l.slice(minIndent)).join('\n');
    }

    return result.trim();
  }

  /**
   * Run a test execution of the code with a mock tank
   */
  testExecution(code: string): { valid: boolean; error?: string } {
    try {
      const mockTank = this.createMockTank();

      // Apply loop guards for safety
      const guardedCode = this.injectLoopGuards(code);
      const fn = new Function('tank', guardedCode);

      // Run the code
      fn(mockTank);

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Runtime error: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Create a mock tank for testing code execution
   */
  private createMockTank() {
    // Track state to prevent infinite loops
    let fireCount = 0;
    const MAX_FIRES_PER_TICK = 1;
    let sensorCount = 4; // Default sensor count

    // Mock enemy data
    const mockEnemy = {
      id: 'enemy-1',
      position: { x: 200, y: 200 },
      distance: 141,
      bearing: 45,
      health: 100,
      heading: 0,
      turretHeading: 0,
      velocity: { x: 0, y: 0 },
    };

    return {
      // Basic sensors
      getPosition: () => ({ x: 100, y: 100 }),
      getHealth: () => 100,
      getHeading: () => 0,
      getTurretHeading: () => 0,
      canFire: () => fireCount < MAX_FIRES_PER_TICK,
      getNearestEnemy: () => mockEnemy,
      getEnemies: () => [mockEnemy],

      // Sensor configuration
      configureSensors: (configs: Array<{ arc: number; range: number; offset: number }>) => {
        if (Array.isArray(configs) && configs.length > 0 && configs.length <= 8) {
          sensorCount = configs.length;
          return true;
        }
        return false;
      },
      getSensorCount: () => sensorCount,
      getSensorConstraints: () => ({
        maxSensors: 8,
        maxArc: 120,
        maxRange: 400,
        minArc: 10,
        minRange: 50,
      }),

      // Scanning
      scan: (index: number) => {
        // Return enemy in sensor 0 (front), empty for others
        if (index === 0) return [mockEnemy];
        return [];
      },
      scanAll: () => [mockEnemy],

      // Range info
      getGunRange: () => 350,
      getArenaBounds: () => ({ width: 1200, height: 800 }),

      // Wall detection
      isCollidingWithWall: () => false,
      getWallCollisionSides: () => [],
      getWallDistance: (_angleOffset: number = 0) => 300, // Mock distance to wall
      scanWall: (_sensorIndex: number) => ({ distance: 300, angle: 0 }), // Mock wall in sensor

      // Actions
      move: (_speed: number) => {},
      turn: (_rate: number) => {},
      aimAt: (_point: { x: number; y: number }) => {},
      fire: () => {
        fireCount++;
        return fireCount <= MAX_FIRES_PER_TICK;
      },

      // Utilities
      angleTo: (_point: { x: number; y: number }) => 45,
      distanceTo: (_point: { x: number; y: number }) => 141,
    };
  }

  /**
   * Full validation pipeline
   */
  validate(rawCode: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Clean the code first
    const code = this.cleanCode(rawCode);

    // Check syntax
    const syntaxResult = this.validateSyntax(code);
    if (!syntaxResult.valid) {
      errors.push(syntaxResult.error!);
      return { valid: false, errors, warnings };
    }

    // Check for forbidden patterns
    const forbiddenErrors = this.checkForbiddenPatterns(code);
    errors.push(...forbiddenErrors);

    // Check tank methods (warnings only)
    const methodWarnings = this.validateTankMethods(code);
    warnings.push(...methodWarnings);

    // Test execution if no errors so far
    if (errors.length === 0) {
      const execResult = this.testExecution(code);
      if (!execResult.valid) {
        errors.push(execResult.error!);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get the cleaned code (for use after validation)
   */
  getCleanedCode(rawCode: string): string {
    return this.cleanCode(rawCode);
  }
}

// Singleton instance
export const codeValidator = new CodeValidator();
