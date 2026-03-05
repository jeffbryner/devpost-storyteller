import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';

interface StoryboardStep {
    id?: string;
    title?: string;
    description?: string;
    image_prompt?: string;
}

interface StoryboardData {
    theme: string;
    storyboard_image_url: string | null;
    steps: StoryboardStep[];
    created_at: string;
}

export const StoryboardView: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [storyboard, setStoryboard] = useState<StoryboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchStoryboard = async () => {
            if (!id) {
                setError('No storyboard ID provided.');
                setLoading(false);
                return;
            }

            try {
                const response = await fetch(`http://localhost:8000/api/storyboard/${id}`);
                if (!response.ok) {
                    if (response.status === 404) {
                        setError('Storyboard not found.');
                    } else {
                        setError('Failed to load storyboard.');
                    }
                    return;
                }
                const result = await response.json();
                setStoryboard(result.data as StoryboardData);
            } catch (err: any) {
                console.error('Error fetching storyboard:', err);
                setError(err.message || 'Failed to load storyboard.');
            } finally {
                setLoading(false);
            }
        };

        fetchStoryboard();
    }, [id]);

    if (loading) {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <h2>Loading Storyboard...</h2>
                <p>Please wait while we fetch your storyboard.</p>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <h2>Error</h2>
                <p style={{ color: 'red' }}>{error}</p>
                <Link
                    to="/"
                    style={{
                        display: 'inline-block',
                        marginTop: '10px',
                        padding: '10px 20px',
                        background: '#4CAF50',
                        color: 'white',
                        textDecoration: 'none',
                        borderRadius: '4px',
                    }}
                >
                    Back to Home
                </Link>
            </div>
        );
    }

    if (!storyboard) {
        return null;
    }

    return (
        <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2>Your Storyboard</h2>
                <Link
                    to="/"
                    style={{
                        padding: '8px 16px',
                        background: '#4CAF50',
                        color: 'white',
                        textDecoration: 'none',
                        borderRadius: '4px',
                    }}
                >
                    Back to Home
                </Link>
            </div>

            <p style={{ color: '#666', marginBottom: '10px' }}>
                Theme: <strong>{storyboard.theme}</strong>
            </p>

            {storyboard.storyboard_image_url ? (
                <div style={{
                    marginBottom: '30px',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    overflow: 'hidden',
                }}>
                    <img
                        src={storyboard.storyboard_image_url}
                        alt="Storyboard"
                        style={{ width: '100%', display: 'block' }}
                    />
                </div>
            ) : (
                <div style={{
                    padding: '40px',
                    textAlign: 'center',
                    background: '#f5f5f5',
                    borderRadius: '8px',
                    marginBottom: '30px',
                    color: '#999',
                }}>
                    <p>No storyboard image was generated.</p>
                </div>
            )}

            <h3>Steps</h3>
            <ol style={{ textAlign: 'left', paddingLeft: '20px' }}>
                {storyboard.steps.map((step, idx) => (
                    <li key={idx} style={{
                        marginBottom: '15px',
                        padding: '10px',
                        background: '#f9f9f9',
                        borderRadius: '6px',
                        border: '1px solid #eee',
                    }}>
                        <strong>{step.title || `Step ${idx + 1}`}</strong>
                        {step.description && (
                            <p style={{ margin: '5px 0 0 0', color: '#555' }}>{step.description}</p>
                        )}
                    </li>
                ))}
            </ol>

            <p style={{ color: '#999', fontSize: '0.85em', marginTop: '20px' }}>
                Created: {new Date(storyboard.created_at).toLocaleString()}
            </p>
        </div>
    );
};
