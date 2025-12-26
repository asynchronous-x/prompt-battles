interface HowToPlayScreenProps {
  onBack: () => void;
}

export function HowToPlayScreen({ onBack }: HowToPlayScreenProps) {
  return (
    <div className="howto-screen screen-enter">
      <div className="howto-header">
        <button className="back-btn" onClick={onBack}>
          &larr; BACK
        </button>
        <h1 className="howto-title">HOW TO PLAY</h1>
      </div>

      <div className="howto-content">
        {/* Overview Section */}
        <section className="howto-section">
          <h2 className="section-title">
            <i className="hn hn-gaming"></i>
            THE GAME
          </h2>
          <p className="section-text">
            Write natural language prompts to control your tank in battle. An AI running
            entirely in your browser converts your strategy into JavaScript code that
            controls your tank in real-time combat against 7 other tanks.
          </p>
          <div className="highlight-box">
            <strong>Your prompt becomes your tank's brain.</strong> Be creative, be strategic!
          </div>
        </section>

        {/* How It Works Section */}
        <section className="howto-section">
          <h2 className="section-title">
            <i className="hn hn-cog"></i>
            HOW IT WORKS
          </h2>
          <div className="steps-list">
            <div className="step">
              <span className="step-num">1</span>
              <div className="step-content">
                <strong>Download the AI Model</strong>
                <p>A ~1GB AI model runs locally in your browser using WebGPU. No data leaves your device.</p>
              </div>
            </div>
            <div className="step">
              <span className="step-num">2</span>
              <div className="step-content">
                <strong>Write Your Strategy</strong>
                <p>Describe how your tank should behave: "Be aggressive, chase enemies and fire constantly" or "Stay back, snipe from distance"</p>
              </div>
            </div>
            <div className="step">
              <span className="step-num">3</span>
              <div className="step-content">
                <strong>Generate AI Code</strong>
                <p>The AI converts your prompt into tank behavior code. You'll see logic blocks showing what your tank will do.</p>
              </div>
            </div>
            <div className="step">
              <span className="step-num">4</span>
              <div className="step-content">
                <strong>Battle!</strong>
                <p>Watch your AI-controlled tank fight against 7 other tanks in a 2-minute battle royale.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Tank Capabilities Section */}
        <section className="howto-section">
          <h2 className="section-title">
            <i className="hn hn-trending"></i>
            TANK CAPABILITIES
          </h2>
          <div className="capabilities-grid">
            <div className="capability">
              <div className="cap-header">
                <i className="hn hn-chart-network"></i>
                SENSORS
              </div>
              <p>Tanks have up to 8 programmable sensors with configurable detection arcs (10-120°) and ranges (50-400px). Default: front, left, right, and rear sensors.</p>
            </div>
            <div className="capability">
              <div className="cap-header">
                <i className="hn hn-fire"></i>
                WEAPONS
              </div>
              <p>Hitscan gun with 350px max range. Instant hit detection - no projectile travel time. 15 damage per hit, 2 shots/second.</p>
            </div>
            <div className="capability">
              <div className="cap-header">
                <i className="hn hn-arrow-right"></i>
                MOVEMENT
              </div>
              <p>Forward/reverse movement and turning. Turret rotates independently to aim at enemies while moving in any direction.</p>
            </div>
            <div className="capability">
              <div className="cap-header">
                <i className="hn hn-heart"></i>
                HEALTH
              </div>
              <p>Each tank starts with 100 HP. Last tank standing wins, or highest health when time runs out.</p>
            </div>
          </div>
        </section>

        {/* Arena Section */}
        <section className="howto-section">
          <h2 className="section-title">
            <i className="hn hn-globe"></i>
            THE ARENA
          </h2>
          <div className="arena-info">
            <div className="arena-feature">
              <strong>Wrap-Around Space</strong>
              <p>The arena has no walls! Go off one edge and appear on the opposite side - like the classic game Asteroids. Chase enemies across boundaries.</p>
            </div>
            <div className="arena-feature">
              <strong>Size: 1200 x 800 pixels</strong>
              <p>8 tanks spawn evenly spaced around the arena, all facing the center.</p>
            </div>
            <div className="arena-feature">
              <strong>2 Minute Battles</strong>
              <p>Survive until time runs out or eliminate all opponents. No hiding - sensors can detect enemies across wrapped edges!</p>
            </div>
          </div>
        </section>

        {/* Strategy Tips Section */}
        <section className="howto-section">
          <h2 className="section-title">
            <i className="hn hn-lightbulb"></i>
            STRATEGY TIPS
          </h2>
          <div className="tips-grid">
            <div className="tip">
              <span className="tip-label">AGGRESSIVE</span>
              <p>"Chase the nearest enemy, fire constantly, never retreat"</p>
            </div>
            <div className="tip">
              <span className="tip-label">SNIPER</span>
              <p>"Keep distance, only fire at max range, configure narrow long-range sensors"</p>
            </div>
            <div className="tip">
              <span className="tip-label">PARANOID</span>
              <p>"Use 360° sensor coverage, spin to face any threat, prioritize survival"</p>
            </div>
            <div className="tip">
              <span className="tip-label">HUNTER</span>
              <p>"Target the weakest enemy (lowest health), finish kills before switching targets"</p>
            </div>
            <div className="tip">
              <span className="tip-label">EVASIVE</span>
              <p>"Strong rear sensors, flee from nearby threats, only fight when safe"</p>
            </div>
            <div className="tip">
              <span className="tip-label">CUSTOM</span>
              <p>Describe your own unique strategy - the AI will figure out how to implement it!</p>
            </div>
          </div>
        </section>

        {/* Sensor Configuration Section */}
        <section className="howto-section">
          <h2 className="section-title">
            <i className="hn hn-chart-network"></i>
            SENSOR CONFIGURATION
          </h2>
          <p className="section-text">
            You can mention sensor configurations in your prompt! The AI understands:
          </p>
          <div className="sensor-examples">
            <div className="sensor-example">
              <code>"Configure a narrow 30° long-range front sensor for sniping"</code>
            </div>
            <div className="sensor-example">
              <code>"Set up 6 sensors for 360° coverage"</code>
            </div>
            <div className="sensor-example">
              <code>"Wide peripheral sensors and strong rear detection"</code>
            </div>
          </div>
          <div className="sensor-limits">
            <span><strong>Arc:</strong> 10° - 120°</span>
            <span><strong>Range:</strong> 50 - 400px</span>
            <span><strong>Max Sensors:</strong> 8</span>
          </div>
        </section>

        {/* Ready Section */}
        <section className="howto-section ready-section">
          <h2 className="section-title">
            <i className="hn hn-plane-departure"></i>
            READY TO BATTLE?
          </h2>
          <button className="play-now-btn" onClick={onBack}>
            <i className="hn hn-play"></i> LET'S GO!
          </button>
        </section>
      </div>
    </div>
  );
}
