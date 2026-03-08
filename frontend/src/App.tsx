import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { LiveChat, type Step } from './components/LiveChat';
import { StoryboardView } from './components/StoryboardView';
import { API_BASE_URL } from './config';
import './App.css';

const Home: React.FC = () => {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [theme, setTheme] = useState<string>('Black and White Cartoon');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedId, setGeneratedId] = useState<string | null>(null);

  const handleStepsReceived = (newSteps: Step[]) => {
    // Defensive parsing: ensure each step is a proper object, not a JSON string
    const parsed = newSteps.map(step =>
      (typeof step === 'string') ? JSON.parse(step) : step
    );
    setSteps(parsed);
  };

  const handleGenerate = async () => {
    if (!steps || steps.length === 0) return;

    setIsGenerating(true);
    setError(null);

    // Sanitize steps data: Ensure each step is an object, not a string.
    const processedSteps = steps.map(step =>
      (typeof step === 'string') ? JSON.parse(step) : step
    );

    try {
      const response = await fetch(`${API_BASE_URL}/api/storyboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          theme: theme,
          steps: processedSteps
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate storyboard');
      }

      const data = await response.json();
      setGeneratedId(data.id);
      // navigate(`/storyboard/${data.id}`);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsGenerating(false);
    }
  };
  return (
    <div className="app-container">
      <div className="app-header">
        <h1 className="app-title">Autism Event Storyboard Creator</h1>
        <p className="app-subtitle">Generate calming visual storyboards interactively</p>
      </div>

      {!generatedId && (
        <LiveChat onStepsReceived={handleStepsReceived} />
      )}

      {steps && !generatedId && (
        <div className="panel-section">
          <div className="panel-header">
            <h2 style={{ margin: 0, color: '#1e293b' }}>Review & Refine Steps</h2>
            <p style={{ color: '#64748b', margin: '8px 0 0' }}>Chat with the assistant to modify these steps, or proceed to generate the final storyboard.</p>
          </div>

          <div className="steps-grid">
            {steps.map((step, idx) => (
              <div key={idx} className="step-card">
                <div className="step-number">{idx + 1}</div>
                <div className="step-title">{step.step_title}</div>
                <p className="step-desc">{step.description}</p>
              </div>
            ))}
          </div>

          <div className="form-group">
            <label htmlFor="theme">Select Theme:</label>
            <select
              id="theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
            >
              <option value="Black and White Cartoon">Black and White Cartoon</option>
              <option value="Superhero">Superhero</option>
              <option value="Pencil Sketch">Pencil Sketch</option>
              <option value="Photorealistic">Photorealistic</option>
            </select>
          </div>

          {error && (
            <div style={{ color: '#ef4444', marginTop: '16px', padding: '12px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fca5a5' }}>
              <strong>Error:</strong> {error}
            </div>
          )}

          <div className="generate-btn-container">
            <button
              className="secondary"
              onClick={() => setSteps(null)}
              disabled={isGenerating}
            >
              Reset Draft
            </button>
            <button
              className="success"
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? 'Generating Storyboard...' : 'Generate Final Storyboard'}
            </button>
          </div>
        </div>
      )}

      {generatedId && (
        <div className="panel-section" style={{ textAlign: 'center', borderColor: '#10b981', background: '#f0fdf4' }}>
          <h2 style={{ color: '#059669', marginBottom: '8px' }}>Storyboard Generated!</h2>
          <p style={{ color: '#065f46', marginBottom: '24px' }}>Your storyboard has been successfully created.</p>
          <Link
            to={`/storyboard/${generatedId}`}
            style={{ display: 'inline-block', padding: '12px 24px', background: '#10b981', color: 'white', textDecoration: 'none', borderRadius: '8px', fontWeight: '500', boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)' }}
          >
            View Storyboard
          </Link>
        </div>
      )}
    </div>
  );
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/storyboard/:id" element={<StoryboardView />} />
      </Routes>
    </Router>
  );
}

export default App;
