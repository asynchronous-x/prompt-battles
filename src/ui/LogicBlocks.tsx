import { useRef, useEffect } from 'react';
import { SENSOR_CONSTRAINTS, SensorConfig } from '../types/game';

interface LogicBlock {
  type: 'condition' | 'action' | 'trigger' | 'loop' | 'config';
  content: string;
  children?: LogicBlock[];
}

interface LogicBlocksProps {
  code: string;
}

// Default sensor configuration
const DEFAULT_SENSORS: SensorConfig[] = [
  { arc: 90, range: 400, offset: 0 },    // front
  { arc: 120, range: 250, offset: -90 }, // left
  { arc: 120, range: 250, offset: 90 },  // right
  { arc: 90, range: 150, offset: 180 },  // rear
];

// Parse sensor configuration from code
function parseSensorsFromCode(code: string): SensorConfig[] {
  const match = code.match(/configureSensors\s*\(\s*\[([\s\S]*?)\]\s*\)/);
  if (!match) return DEFAULT_SENSORS;

  try {
    // Extract the array content and parse it
    const arrayContent = match[1];
    const sensors: SensorConfig[] = [];

    // Match each sensor object { arc: X, range: Y, offset: Z }
    const sensorMatches = arrayContent.matchAll(/\{\s*arc\s*:\s*([\d.]+)\s*,\s*range\s*:\s*([\d.]+)\s*,\s*offset\s*:\s*([-\d.]+)\s*\}/g);

    for (const sensorMatch of sensorMatches) {
      sensors.push({
        arc: Math.min(SENSOR_CONSTRAINTS.maxArc, Math.max(SENSOR_CONSTRAINTS.minArc, parseFloat(sensorMatch[1]))),
        range: Math.min(SENSOR_CONSTRAINTS.maxRange, Math.max(SENSOR_CONSTRAINTS.minRange, parseFloat(sensorMatch[2]))),
        offset: parseFloat(sensorMatch[3]),
      });
    }

    return sensors.length > 0 ? sensors.slice(0, SENSOR_CONSTRAINTS.maxSensors) : DEFAULT_SENSORS;
  } catch {
    return DEFAULT_SENSORS;
  }
}

// Mini tank preview component using canvas
function MiniTankPreview({ sensors }: { sensors: SensorConfig[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = 0.22;
    const tankRotation = -Math.PI / 2; // Facing up

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#0a0a1e';
    ctx.fillRect(0, 0, width, height);

    // Gun range circle
    const gunRange = 350 * scale;
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(centerX, centerY, gunRange, 0, Math.PI * 2);
    ctx.stroke();

    // Sensor colors
    const sensorColors = [
      '#4a90d9', '#90d94a', '#d9904a', '#d94a4a',
      '#d94ad9', '#4ad9d9', '#d9d94a', '#944ad9',
    ];

    // Draw each sensor
    sensors.forEach((config, index) => {
      const color = sensorColors[index % sensorColors.length];
      const sensorAngle = tankRotation + (config.offset * Math.PI / 180);
      const halfArc = (config.arc / 2) * Math.PI / 180;
      const range = config.range * scale;

      // Filled arc
      ctx.fillStyle = color + '30'; // 30 = ~20% opacity in hex
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, range, sensorAngle - halfArc, sensorAngle + halfArc);
      ctx.closePath();
      ctx.fill();

      // Arc outline
      ctx.strokeStyle = color + '80';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centerX, centerY, range, sensorAngle - halfArc, sensorAngle + halfArc);
      ctx.stroke();

      // Edge lines
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(
        centerX + Math.cos(sensorAngle - halfArc) * range,
        centerY + Math.sin(sensorAngle - halfArc) * range
      );
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(
        centerX + Math.cos(sensorAngle + halfArc) * range,
        centerY + Math.sin(sensorAngle + halfArc) * range
      );
      ctx.stroke();
    });

    // Draw tank body
    const tankSize = 10;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(tankRotation);

    ctx.fillStyle = '#4a90d9';
    ctx.fillRect(-tankSize, -tankSize * 0.7, tankSize * 2, tankSize * 1.4);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-tankSize, -tankSize * 0.7, tankSize * 2, tankSize * 1.4);

    // Turret
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(tankSize * 1.3, 0);
    ctx.stroke();

    ctx.restore();

    // Label
    ctx.fillStyle = '#666';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${sensors.length} sensor${sensors.length !== 1 ? 's' : ''} configured`, centerX, height - 8);

  }, [sensors]);

  return (
    <div className="mini-tank-preview">
      <canvas ref={canvasRef} width={240} height={140} />
    </div>
  );
}

// Parse generated code into visual logic blocks
function parseCodeToBlocks(code: string): LogicBlock[] {
  const blocks: LogicBlock[] = [];
  const lines = code.split('\n').filter(l => l.trim());

  // Check for sensor configuration
  if (code.includes('configureSensors')) {
    const sensors = parseSensorsFromCode(code);
    blocks.push({
      type: 'config',
      content: `CONFIGURE ${sensors.length} custom sensors`
    });
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip comments and configureSensors
    if (line.startsWith('//') || line.includes('configureSensors')) {
      i++;
      continue;
    }

    // Detect patterns and create blocks
    if (line.includes('scan(') || line.includes('scanAll')) {
      blocks.push({
        type: 'trigger',
        content: 'SCAN for enemies in sensors'
      });
    } else if (line.includes('getNearestEnemy') || line.includes('getEnemies')) {
      blocks.push({
        type: 'trigger',
        content: 'DETECT enemies in range'
      });
    }

    if (line.includes('if') && line.includes('enemy')) {
      const block: LogicBlock = {
        type: 'condition',
        content: 'IF enemy is nearby',
        children: []
      };

      // Look for actions inside the if block
      let depth = 1;
      i++;
      while (i < lines.length && depth > 0) {
        const innerLine = lines[i].trim();
        if (innerLine.includes('{')) depth++;
        if (innerLine.includes('}')) depth--;

        if (innerLine.includes('aimAt')) {
          block.children!.push({
            type: 'action',
            content: 'AIM at enemy position'
          });
        }
        if (innerLine.includes('fire')) {
          block.children!.push({
            type: 'action',
            content: 'FIRE weapon'
          });
        }
        if (innerLine.includes('move') && innerLine.includes('>')) {
          block.children!.push({
            type: 'action',
            content: 'CHASE enemy (move forward)'
          });
        }
        if (innerLine.includes('move') && innerLine.includes('<')) {
          block.children!.push({
            type: 'action',
            content: 'RETREAT (move backward)'
          });
        }
        i++;
      }

      if (block.children!.length === 0) {
        block.children!.push({
          type: 'action',
          content: 'ENGAGE target'
        });
      }

      blocks.push(block);
      continue;
    }

    if (line.includes('if') && (line.includes('health') || line.includes('Health'))) {
      blocks.push({
        type: 'condition',
        content: 'IF health is low → EVADE'
      });
    }

    if (line.includes('if') && line.includes('canFire')) {
      blocks.push({
        type: 'condition',
        content: 'WHEN weapon ready → FIRE'
      });
    }

    if (line.includes('if') && line.includes('distance')) {
      if (line.includes('>')) {
        blocks.push({
          type: 'condition',
          content: 'IF enemy is FAR → approach'
        });
      } else if (line.includes('<')) {
        blocks.push({
          type: 'condition',
          content: 'IF enemy is CLOSE → engage'
        });
      }
    }

    if (line.includes('if') && line.includes('length') && line.includes('> 0')) {
      blocks.push({
        type: 'condition',
        content: 'IF sensor detects enemy'
      });
    }

    if (line.includes('turn') && !line.includes('if')) {
      const match = line.match(/turn\(([-\d.]+)\)/);
      if (match) {
        const val = parseFloat(match[1]);
        if (val > 0) {
          blocks.push({
            type: 'loop',
            content: 'PATROL (turn right)'
          });
        } else if (val < 0) {
          blocks.push({
            type: 'loop',
            content: 'PATROL (turn left)'
          });
        }
      }
    }

    if (line.includes('move') && !line.includes('if') && !line.includes('else')) {
      const match = line.match(/move\(([-\d.]+)\)/);
      if (match) {
        const val = parseFloat(match[1]);
        if (val > 0.5) {
          blocks.push({
            type: 'action',
            content: 'CHARGE forward fast'
          });
        } else if (val > 0) {
          blocks.push({
            type: 'action',
            content: 'ADVANCE forward'
          });
        } else if (val < 0) {
          blocks.push({
            type: 'action',
            content: 'REVERSE'
          });
        }
      }
    }

    i++;
  }

  // If we couldn't parse anything, add a generic block
  if (blocks.length === 0) {
    blocks.push({
      type: 'loop',
      content: 'EXECUTE AI behavior'
    });
  }

  return blocks;
}

// Map block types to icons
const blockTypeIcons: Record<LogicBlock['type'], string> = {
  condition: 'hn-eye',
  action: 'hn-bolt',
  trigger: 'hn-chart-network',
  loop: 'hn-refresh',
  config: 'hn-cog',
};

function LogicBlockComponent({ block, index }: { block: LogicBlock; index: number }) {
  return (
    <div
      className={`logic-block ${block.type}`}
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <div className="block-header">
        <i className={`hn ${blockTypeIcons[block.type]}`}></i>
        <span className="block-type">{block.type}</span>
      </div>
      <div className="block-content">
        {block.content}
      </div>
      {block.children?.map((child, i) => (
        <LogicBlockComponent key={i} block={child} index={i} />
      ))}
    </div>
  );
}

export function LogicBlocks({ code }: LogicBlocksProps) {
  if (!code) {
    return (
      <div className="logic-blocks-empty">
        <div className="empty-icon"><i className="hn hn-machine-learning"></i></div>
        <p className="empty-text">
          Generated AI logic will appear here<br />
          as visual behavior blocks
        </p>
        <MiniTankPreview sensors={DEFAULT_SENSORS} />
      </div>
    );
  }

  const blocks = parseCodeToBlocks(code);
  const sensors = parseSensorsFromCode(code);

  return (
    <div className="logic-blocks-wrapper">
      <MiniTankPreview sensors={sensors} />
      <div className="logic-blocks-container">
        {blocks.map((block, i) => (
          <LogicBlockComponent key={i} block={block} index={i} />
        ))}
      </div>
    </div>
  );
}
