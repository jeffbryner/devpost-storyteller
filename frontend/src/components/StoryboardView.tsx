import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { API_BASE_URL } from '../config';

interface StoryboardStep {
    step_title?: string;
    description?: string;
    image_prompt?: string;
}

interface StoryboardData {
    theme: string;
    storyboard_image_url: string | null;
    steps: StoryboardStep[];
    created_at: string;
    grid_cols?: number;
    grid_rows?: number;
}

type CompletionStyle = 'dim' | 'crossout' | 'watermark';

const STORAGE_KEY_PREFIX = 'storyboard-progress-';
const STYLE_KEY_PREFIX = 'storyboard-style-';

export const StoryboardView: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [storyboard, setStoryboard] = useState<StoryboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
    const [completionStyle, setCompletionStyle] = useState<CompletionStyle>('watermark');

    // Load persisted progress and style from localStorage once id is available
    useEffect(() => {
        if (!id) return;
        try {
            const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}${id}`);
            if (saved) {
                setCompletedSteps(new Set(JSON.parse(saved) as number[]));
            }
            const savedStyle = localStorage.getItem(`${STYLE_KEY_PREFIX}${id}`);
            if (savedStyle) {
                setCompletionStyle(savedStyle as CompletionStyle);
            }
        } catch {
            // ignore parse errors
        }
    }, [id]);

    // Persist completedSteps whenever they change
    useEffect(() => {
        if (!id) return;
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${id}`, JSON.stringify([...completedSteps]));
    }, [completedSteps, id]);

    // Persist completionStyle whenever it changes
    useEffect(() => {
        if (!id) return;
        localStorage.setItem(`${STYLE_KEY_PREFIX}${id}`, completionStyle);
    }, [completionStyle, id]);

    useEffect(() => {
        const fetchStoryboard = async () => {
            if (!id) {
                setError('No storyboard ID provided.');
                setLoading(false);
                return;
            }

            try {
                const response = await fetch(`${API_BASE_URL}/api/storyboard/${id}`);
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

    const toggleStep = (idx: number) => {
        setCompletedSteps(prev => {
            const next = new Set(prev);
            if (next.has(idx)) {
                next.delete(idx);
            } else {
                next.add(idx);
            }
            return next;
        });
    };

    const resetAll = () => {
        setCompletedSteps(new Set());
    };

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

    const completedCount = completedSteps.size;
    const totalSteps = storyboard.steps.length;

    // Grid layout: use stored values or fall back to 2-column default
    const gridCols = storyboard.grid_cols ?? 2;
    const gridRows = storyboard.grid_rows ?? Math.ceil(totalSteps / gridCols);

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
                    position: 'relative',
                }}>
                    <img
                        src={storyboard.storyboard_image_url}
                        alt="Storyboard"
                        style={{ width: '100%', display: 'block' }}
                    />
                    {/* Panel overlay grid — sits on top of the image without modifying it */}
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        display: 'grid',
                        gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                        gridTemplateRows: `repeat(${gridRows}, 1fr)`,
                        pointerEvents: 'none',
                    }}>
                        {Array.from({ length: gridCols * gridRows }).map((_, cellIdx) => {
                            const isDone = completedSteps.has(cellIdx);
                            const isValidPanel = cellIdx < totalSteps;
                            return (
                                <PanelOverlayCell
                                    key={cellIdx}
                                    idx={cellIdx}
                                    done={isDone && isValidPanel}
                                    style={completionStyle}
                                    isValidPanel={isValidPanel}
                                />
                            );
                        })}
                    </div>
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

            {/* Steps header row with progress, style selector, and reset */}
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                marginBottom: '12px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h3 style={{ margin: 0 }}>Steps</h3>
                    <span style={{
                        fontSize: '0.85em',
                        color: completedCount === totalSteps && totalSteps > 0 ? '#4CAF50' : '#888',
                        fontWeight: completedCount === totalSteps && totalSteps > 0 ? 'bold' : 'normal',
                    }}>
                        {completedCount}/{totalSteps} done
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    {/* Style selector */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9em' }}>
                        <span style={{ color: '#555', fontWeight: 500 }}>Mark style:</span>
                        {(['dim', 'crossout', 'watermark'] as CompletionStyle[]).map(style => (
                            <label
                                key={style}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    cursor: 'pointer',
                                    color: completionStyle === style ? '#333' : '#777',
                                    fontWeight: completionStyle === style ? 600 : 400,
                                }}
                            >
                                <input
                                    type="radio"
                                    name="completionStyle"
                                    value={style}
                                    checked={completionStyle === style}
                                    onChange={() => setCompletionStyle(style)}
                                    style={{ cursor: 'pointer' }}
                                />
                                {style === 'dim' ? 'Dim' : style === 'crossout' ? 'Cross Out' : 'Watermark'}
                            </label>
                        ))}
                    </div>

                    {/* Reset All button */}
                    {completedCount > 0 && (
                        <button
                            onClick={resetAll}
                            title="Reset all steps to not done"
                            style={{
                                padding: '5px 12px',
                                fontSize: '0.85em',
                                background: '#fff',
                                color: '#c0392b',
                                border: '1px solid #c0392b',
                                borderRadius: '4px',
                                cursor: 'pointer',
                            }}
                        >
                            ↺ Reset All
                        </button>
                    )}
                </div>
            </div>

            <ol style={{ textAlign: 'left', paddingLeft: '20px' }}>
                {storyboard.steps.map((step, idx) => {
                    const done = completedSteps.has(idx);
                    return (
                        <li key={idx} style={{ marginBottom: '15px', listStyle: 'none' }}>
                            <StepCard
                                step={step}
                                idx={idx}
                                done={done}
                                style={completionStyle}
                                onToggle={() => toggleStep(idx)}
                            />
                        </li>
                    );
                })}
            </ol>

            <p style={{ color: '#999', fontSize: '0.85em', marginTop: '20px' }}>
                Created: {new Date(storyboard.created_at).toLocaleString()}
            </p>
        </div>
    );
};

// ─── Panel overlay cell rendered on top of the image ────────────────────────

interface PanelOverlayCellProps {
    idx: number;
    done: boolean;
    style: CompletionStyle;
    isValidPanel: boolean;
}

const PanelOverlayCell: React.FC<PanelOverlayCellProps> = ({ done, style, isValidPanel }) => {
    if (!done || !isValidPanel) {
        return <div style={{ position: 'relative' }} />;
    }

    return (
        <div style={{ position: 'relative', overflow: 'hidden' }}>
            {style === 'dim' && (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(0,0,0,0.55)',
                }} />
            )}

            {style === 'crossout' && (
                <>
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'rgba(0,0,0,0.18)',
                    }} />
                    <svg
                        width="100%"
                        height="100%"
                        style={{ position: 'absolute', inset: 0 }}
                        preserveAspectRatio="none"
                    >
                        <line x1="0" y1="0" x2="100%" y2="100%" stroke="rgba(200,0,0,0.6)" strokeWidth="3" />
                        <line x1="100%" y1="0" x2="0" y2="100%" stroke="rgba(200,0,0,0.6)" strokeWidth="3" />
                    </svg>
                </>
            )}

            {style === 'watermark' && (
                <>
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'rgba(0,0,0,0.15)',
                    }} />
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        <span style={{
                            fontSize: 'clamp(0.8rem, 3vw, 1.6rem)',
                            fontWeight: 800,
                            color: 'rgba(255,255,255,0.85)',
                            border: '3px solid rgba(255,255,255,0.75)',
                            borderRadius: '6px',
                            padding: '2px 10px',
                            letterSpacing: '0.12em',
                            transform: 'rotate(-10deg)',
                            userSelect: 'none',
                            textTransform: 'uppercase',
                            textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                        }}>
                            ✓ Done
                        </span>
                    </div>
                </>
            )}
        </div>
    );
};

// ─── Step card in the list below the image ──────────────────────────────────

interface StepCardProps {
    step: StoryboardStep;
    idx: number;
    done: boolean;
    style: CompletionStyle;
    onToggle: () => void;
}

const StepCard: React.FC<StepCardProps> = ({ step, idx, done, style, onToggle }) => {
    const cardStyle: React.CSSProperties = {
        position: 'relative',
        padding: '10px 10px 10px 14px',
        background: done && style === 'dim' ? '#e0e0e0' : '#f9f9f9',
        borderRadius: '6px',
        border: `1px solid ${done && style === 'dim' ? '#ccc' : '#eee'}`,
        opacity: done && style === 'dim' ? 0.45 : 1,
        overflow: 'hidden',
        transition: 'opacity 0.2s ease, background 0.2s ease',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '10px',
    };

    const titleStyle: React.CSSProperties = {
        textDecoration: done && style === 'crossout' ? 'line-through' : 'none',
        color: done && style === 'crossout' ? '#aaa' : 'inherit',
    };

    const descStyle: React.CSSProperties = {
        margin: '5px 0 0 0',
        color: done && style === 'crossout' ? '#bbb' : '#555',
        textDecoration: done && style === 'crossout' ? 'line-through' : 'none',
    };

    return (
        <div style={cardStyle}>
            <div style={{ flex: 1 }}>
                <strong style={titleStyle}>{idx + 1}. {step.step_title || `Step ${idx + 1}`}</strong>
                {step.description && (
                    <p style={descStyle}>{step.description}</p>
                )}
            </div>

            <button
                onClick={onToggle}
                title={done ? 'Mark as not done' : 'Mark as done'}
                style={{
                    flexShrink: 0,
                    alignSelf: 'center',
                    padding: '4px 10px',
                    fontSize: '0.82em',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    border: done ? '1px solid #aaa' : '1px solid #4CAF50',
                    background: done ? '#f0f0f0' : '#4CAF50',
                    color: done ? '#666' : '#fff',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                }}
            >
                {done ? '↩ Undo' : '✓ Done'}
            </button>

            {/* Watermark overlay on step card */}
            {done && style === 'watermark' && (
                <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                    zIndex: 1,
                }}>
                    <span style={{
                        fontSize: '1.4em',
                        fontWeight: 700,
                        color: 'rgba(76, 175, 80, 0.35)',
                        border: '2px solid rgba(76, 175, 80, 0.35)',
                        borderRadius: '4px',
                        padding: '2px 10px',
                        letterSpacing: '0.1em',
                        transform: 'rotate(-8deg)',
                        userSelect: 'none',
                        textTransform: 'uppercase',
                    }}>
                        ✓ Done
                    </span>
                </div>
            )}

            {/* Cross-out diagonal overlay on step card */}
            {done && style === 'crossout' && (
                <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    pointerEvents: 'none',
                    zIndex: 1,
                }}>
                    <svg
                        width="100%"
                        height="100%"
                        style={{ position: 'absolute', top: 0, left: 0 }}
                        preserveAspectRatio="none"
                    >
                        <line x1="0" y1="0" x2="100%" y2="100%" stroke="rgba(180,0,0,0.25)" strokeWidth="2" />
                        <line x1="100%" y1="0" x2="0" y2="100%" stroke="rgba(180,0,0,0.25)" strokeWidth="2" />
                    </svg>
                </div>
            )}
        </div>
    );
};
