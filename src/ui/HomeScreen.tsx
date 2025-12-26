interface HomeScreenProps {
  onPlay: () => void;
  onHowToPlay: () => void;
}

export function HomeScreen({ onPlay, onHowToPlay }: HomeScreenProps) {
  return (
    <div className="home-screen screen-enter">
      <div className="game-logo">
        <h1 className="game-title">PROMPT BATTLES</h1>
        <p className="game-subtitle">AI-Powered Tank Warfare</p>
      </div>

      <div className="tanks-parade">
        <div className="parade-tank" />
        <div className="parade-tank" />
        <div className="parade-tank" />
        <div className="parade-tank" />
      </div>

      <button className="play-button" onClick={onPlay}>
        &#x25B6; PLAY
      </button>

      <div className="home-footer">
        <span className="footer-link" onClick={() => window.open('https://github.com', '_blank')}>
          Credits
        </span>
        <span className="footer-link" onClick={onHowToPlay}>
          How to Play
        </span>
      </div>
    </div>
  );
}
