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
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Autism Event Storyboard Creator</h1>

      {!steps && !generatedId && (
        <LiveChat onStepsReceived={handleStepsReceived} />
      )}

      {steps && !generatedId && (
        <div style={{ marginTop: '20px', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
          <h2>Review Steps</h2>
          <ul style={{ textAlign: 'left' }}>
            {steps.map((step, idx) => (
              <li key={idx} style={{ marginBottom: '10px' }}>
                <strong>{step.step_title}</strong>
                <p style={{ margin: '5px 0' }}>{step.description}</p>
              </li>
            ))}
          </ul>

          <div style={{ marginTop: '20px' }}>
            <label htmlFor="theme" style={{ marginRight: '10px' }}>Select Theme: </label>
            <select
              id="theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              style={{ padding: '5px' }}
            >
              <option value="Black and White Cartoon">Black and White Cartoon</option>
              <option value="Superhero">Superhero</option>
              <option value="Pencil Sketch">Pencil Sketch</option>
            </select>
          </div>

          {error && (
            <div style={{ color: 'red', marginTop: '10px' }}>
              Error: {error}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            style={{ marginTop: '20px', padding: '10px 20px', cursor: isGenerating ? 'not-allowed' : 'pointer' }}
          >
            {isGenerating ? 'Generating...' : 'Generate Storyboard'}
          </button>

          <button
            onClick={() => setSteps(null)}
            style={{ marginTop: '20px', marginLeft: '10px', padding: '10px 20px', background: '#f0f0f0', color: '#333' }}
          >
            Reset
          </button>
        </div>
      )}

      {generatedId && (
        <div style={{ marginTop: '20px', padding: '20px', border: '1px solid #4CAF50', borderRadius: '8px', backgroundColor: '#e8f5e9' }}>
          <h2>Storyboard Generated!</h2>
          <p>Your storyboard has been successfully created.</p>
          <Link
            to={`/storyboard/${generatedId}`}
            style={{ display: 'inline-block', marginTop: '10px', padding: '10px 20px', background: '#4CAF50', color: 'white', textDecoration: 'none', borderRadius: '4px' }}
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
