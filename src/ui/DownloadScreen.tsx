import { useState, useCallback, useEffect } from 'react';
import { llmService } from '../llm/LLMService';
import { DEFAULT_MODEL, WebLLMProvider } from '../llm/WebLLMProvider';

interface DownloadScreenProps {
  webGpuAvailable: boolean | null;
  onModelLoaded: () => void;
  onBack: () => void;
}

const LOADING_MESSAGES = [
  "Warming up the AI neurons...",
  "Teaching tanks to think...",
  "Loading battle algorithms...",
  "Compiling destruction protocols...",
  "Initializing strategic subroutines...",
  "Downloading tactical genius...",
  "Preparing for tank domination...",
  "Loading explosive calculations...",
  "Assembling neural networks...",
  "Buffering destruction matrix...",
  "Quantizing war strategies...",
  "Optimizing chaos generators...",
  "Deploying silicon soldiers...",
  "Activating battle mode...",
];

export function DownloadScreen({ webGpuAvailable, onModelLoaded, onBack }: DownloadScreenProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Rotate loading messages
  useEffect(() => {
    if (!isDownloading) return;

    const updateMessage = () => {
      const msg = LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
      setLoadingMessage(msg);
    };

    updateMessage();
    const interval = setInterval(updateMessage, 3000);
    return () => clearInterval(interval);
  }, [isDownloading]);

  const handleStartDownload = useCallback(async () => {
    if (isDownloading) return;

    setIsDownloading(true);
    setError(null);
    setProgress(0);

    // Set up progress callback
    llmService.setProgressCallback((progressInfo) => {
      setProgress(progressInfo.progress);
      setStatusText(progressInfo.text);
    });

    try {
      const success = await llmService.loadModel(DEFAULT_MODEL);

      if (success) {
        setProgress(100);
        setStatusText('Ready to battle!');
        // Small delay before transitioning
        setTimeout(() => {
          onModelLoaded();
        }, 500);
      } else {
        setError('Failed to load model. Please refresh and try again.');
        setIsDownloading(false);
      }
    } catch (err) {
      setError((err as Error).message);
      setIsDownloading(false);
    }
  }, [isDownloading, onModelLoaded]);

  const modelInfo = WebLLMProvider.getModelInfo(DEFAULT_MODEL);

  // WebGPU not available
  if (webGpuAvailable === false) {
    return (
      <div className="download-screen screen-enter">
        <h2 className="download-title"><i className="hn hn-exclamation-triangle"></i> WebGPU Required</h2>
        <div className="download-box">
          <div className="download-info">
            <p className="model-name" style={{ color: '#FF4444' }}>
              WebGPU is not available
            </p>
            <p className="model-size" style={{ marginTop: '15px', lineHeight: 1.6 }}>
              This game requires WebGPU to run AI models in your browser.
              <br /><br />
              Please use <strong>Chrome 113+</strong>, <strong>Edge 113+</strong>, or another WebGPU-enabled browser.
              <br /><br />
              Make sure hardware acceleration is enabled in your browser settings.
            </p>
          </div>
          <button className="download-start-btn" onClick={onBack}>
            <i className="hn hn-arrow-left"></i> Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="download-screen screen-enter">
      <h2 className="download-title"><i className="hn hn-robot"></i> LOADING AI BRAIN</h2>

      <div className="download-box">
        <div className="download-info">
          <p className="model-name">{modelInfo?.name || 'AI Model'}</p>
          <p className="model-size">
            {modelInfo?.sizeGB ? `~${modelInfo.sizeGB}GB` : '~1GB'} • {modelInfo?.description || 'Code generation'}
          </p>
        </div>

        {!isDownloading && !error && (
          <>
            <button className="download-start-btn" onClick={handleStartDownload}>
              <i className="hn hn-download"></i> START DOWNLOAD
            </button>
            <p className="cache-note">
              Download once, play forever! Model is cached locally.
            </p>
          </>
        )}

        {isDownloading && (
          <div className="progress-container">
            <div className="progress-bar-outer">
              <div
                className="progress-bar-inner"
                style={{ width: `${progress}%` }}
              >
                <div className="progress-bar-stripes" />
              </div>
              <div className="progress-text">{Math.round(progress)}%</div>
            </div>
            <p className="loading-message">{loadingMessage}</p>
            <p className="cache-note" style={{ fontSize: '14px', marginTop: '10px' }}>
              {statusText}
            </p>
          </div>
        )}

        {error && (
          <>
            <p className="loading-message" style={{ color: '#FF4444' }}>
              {error}
            </p>
            <button
              className="download-start-btn"
              onClick={handleStartDownload}
              style={{ marginTop: '15px' }}
            >
              <i className="hn hn-refresh"></i> Retry
            </button>
          </>
        )}
      </div>

      {!isDownloading && (
        <button
          className="footer-link"
          onClick={onBack}
          style={{ marginTop: '20px', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <i className="hn hn-arrow-left"></i> Back to Menu
        </button>
      )}
    </div>
  );
}
