import React from 'react';
import { useParams } from 'react-router-dom';

export const StoryboardView: React.FC = () => {
    const { id } = useParams<{ id: string }>();

    return (
        <div style={{ padding: '20px' }}>
            <h2>Storyboard View</h2>
            <p>Loading Storyboard {id}...</p>
        </div>
    );
};
