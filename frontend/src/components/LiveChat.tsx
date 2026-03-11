import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { WS_BASE_URL } from '../config';

export interface Step {
    step_title: string;
    description: string;
    image_prompt: string;
}

interface LiveChatProps {
    onStepsReceived?: (steps: Step[]) => void;
    isGenerating?: boolean;
    streamingText?: string;
}

export const LiveChat: React.FC<LiveChatProps> = ({ onStepsReceived, isGenerating, streamingText }) => {
    const [isConnected, setIsConnected] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [messages, setMessages] = useState<string[]>([]);
    const wsRef = useRef<WebSocket | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const workletNodeRef = useRef<AudioWorkletNode | null>(null);
    const nextPlayTimeRef = useRef<number>(0);
    const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isGenerating, streamingText]);

    const connect = async () => {
        try {
            nextPlayTimeRef.current = 0; // Reset play time on new connection
            // Connect to WebSocket
            const ws = new WebSocket(`${WS_BASE_URL}/ws/ideate`);
            ws.binaryType = 'arraybuffer'; // Process binary data directly
            wsRef.current = ws;

            ws.onopen = () => {
                setIsConnected(true);
                setMessages((prev) => [...prev, 'Connected to Gemini Live.']);
            };

            ws.onmessage = async (event) => {
                if (typeof event.data === 'string') {
                    try {
                        const parsed = JSON.parse(event.data);
                        if (parsed.type === "storyboard_steps" && parsed.payload && onStepsReceived) {
                            onStepsReceived(parsed.payload);
                            setMessages((prev) => [...prev, `Gemini: Storyboard steps received.`]); // Add a message for UX
                        } else {
                            // If it's valid JSON but not a storyboard message, or just plain text
                            setMessages((prev) => [...prev, `Gemini: ${event.data}`]);
                        }
                    } catch (e) {
                        // Not valid JSON, treat as plain text message
                        setMessages((prev) => [...prev, `Gemini: ${event.data}`]);
                    }
                } else if (event.data instanceof ArrayBuffer) {
                    // Directly play the raw binary ArrayBuffer
                    try {
                        playAudio(event.data);
                    } catch (e) {
                        console.error("Error playing audio chunk", e);
                    }
                }
            };

            ws.onclose = () => {
                setIsConnected(false);
                stopRecording();
                setMessages((prev) => [...prev, 'Disconnected.']);
            };
        } catch (error) {
            console.error('Connection error:', error);
        }
    };

    const disconnect = () => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        stopRecording();
        setIsConnected(false);
    };

    const startRecording = async () => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        try {
            const audioConstraints = {
                sampleRate: 16000, // Gemini expects 16kHz audio
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            };
            const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
            streamRef.current = stream;

            // Use Gemini's expected sample rate of 16kHz for better compatibility and performance
            const audioContext = new window.AudioContext({
                latencyHint: "interactive",
                sampleRate: 16000
            });
            audioContextRef.current = audioContext;

            await audioContext.audioWorklet.addModule('/capture-worklet.js');

            const source = audioContext.createMediaStreamSource(stream);
            const workletNode = new AudioWorkletNode(audioContext, 'capture-worklet', {
                processorOptions: {
                    sampleRate: audioContext.sampleRate
                }
            });
            workletNodeRef.current = workletNode;

            source.connect(workletNode);
            // We don't need to connect workletNode to destination since it's only processing and sending data

            workletNode.port.onmessage = (e) => {
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    // e.data is the Int16Array buffer sent from the worklet
                    wsRef.current.send(e.data);
                }
            };

            setIsRecording(true);
        } catch (error) {
            console.error('Error starting recording:', error);
        }
    };

    const stopRecording = () => {
        if (workletNodeRef.current) {
            workletNodeRef.current.disconnect();
            workletNodeRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        // DO NOT close the AudioContext here! 
        // If we close it, any currently playing or scheduled audio from the assistant will be instantly destroyed.
        setIsRecording(false);
    };

    const playAudio = async (arrayBuffer: ArrayBuffer) => {
        if (!audioContextRef.current) {
            audioContextRef.current = new window.AudioContext({
                latencyHint: "interactive",
                sampleRate: 24000
            });
        }

        const pcm16 = new Int16Array(arrayBuffer);
        if (pcm16.length === 0) return; // Guard against empty chunks

        const audioBuffer = audioContextRef.current.createBuffer(1, pcm16.length, 24000);
        const channelData = audioBuffer.getChannelData(0);

        for (let i = 0; i < pcm16.length; i++) {
            channelData[i] = pcm16[i] / 0x8000;
        }

        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);

        // Prevent GC of scheduled nodes
        activeSourcesRef.current.push(source);
        source.onended = () => {
            activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
        };

        // Schedule playback sequentially to avoid overlapping "gibberish"
        const currentTime = audioContextRef.current.currentTime;
        if (nextPlayTimeRef.current < currentTime) {
            nextPlayTimeRef.current = currentTime;
        }
        source.start(nextPlayTimeRef.current);
        nextPlayTimeRef.current += audioBuffer.duration;
    };
    useEffect(() => {
        return () => {
            disconnect();
        };
    }, []);

    return (
        <div className="chat-container">
            <div className="chat-header">
                <h3>Real-Time Conversational Ideation</h3>
                <div>
                    {!isConnected ? (
                        <button onClick={connect}>Connect to Gemini</button>
                    ) : (
                        <button className="danger" onClick={disconnect}>Disconnect</button>
                    )}
                </div>
            </div>

            {isConnected && (
                <div className="chat-controls">
                    {!isRecording ? (
                        <button className="success" onClick={startRecording}>🎙️ Enable Microphone</button>
                    ) : (
                        <button className="danger pulsate" onClick={stopRecording}>⏹️ Disable Microphone</button>
                    )}
                    <button className="secondary" onClick={() => {
                        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                            wsRef.current.send("Please call the generate_storyboard function now to draft the storyboard steps.");
                            setMessages((prev) => [...prev, 'You: (Requested to draft storyboard steps)']);
                        }
                    }}>
                        Draft Steps Now
                    </button>
                    {/* <button className="secondary" onClick={() => {
                        const debugSteps: Step[] = [
                            { step_title: "Arriving at the Restaurant", description: "We will get to Olive Garden and find our table. It might be loud, but we know where we are going.", image_prompt: "Child arriving at a busy Olive Garden restaurant with a parent, looking for a table." },
                            { step_title: "Getting Ready to Order", description: "We will look at the menu we chose earlier. We can use noise-reducing headphones if needed to help focus.", image_prompt: "Child sitting at a restaurant table with a menu, possibly wearing noise-reducing headphones." },
                            { step_title: "Ordering Calmly", description: "When the server comes, we will tell them our order clearly. It is okay to point at the menu or take a moment.", image_prompt: "Child interacting with a friendly server, pointing at their choice on the menu." },
                            { step_title: "Waiting for Food", description: "While we wait, we can do something calm like draw or play a quiet game on a phone.", image_prompt: "Child patiently waiting at the table with a drawing pad or a small toy." },
                            { step_title: "Enjoying the Meal", description: "Our food arrives! We will eat and enjoy the meal at the restaurant.", image_prompt: "Child happily eating pasta at the Olive Garden table." },
                            { step_title: "Going Home", description: "We will pack up and leave the restaurant.", image_prompt: "Child and parent leaving the Olive Garden restaurant together." },
                        ];
                        if (onStepsReceived) {
                            onStepsReceived(debugSteps);
                        }
                        setMessages((prev) => [...prev, 'Debug: Storyboard steps injected locally.']);
                    }}>
                        Debug Storyboard
                    </button> */}
                </div>
            )}
            <div className="chat-messages-header">
                Event History
            </div>
            <div className="chat-messages">
                {messages.length === 0 && !isGenerating ? (
                    <div style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>
                        Connect to the assistant to start collaborating...
                    </div>
                ) : (
                    messages.map((msg, idx) => {
                        const isYou = msg.startsWith('You:');
                        const isGemini = msg.startsWith('Gemini:');
                        const isDebug = msg.startsWith('Debug:');

                        let messageClass = 'chat-message system';
                        let displayMsg = msg;

                        if (isYou) {
                            messageClass = 'chat-message user';
                            displayMsg = msg.replace('You: ', '');
                        } else if (isGemini) {
                            messageClass = 'chat-message gemini';
                            displayMsg = msg.replace('Gemini: ', '');
                        } else if (isDebug) {
                            messageClass = 'chat-message system';
                        }

                        return (
                            <div key={idx} className={messageClass}>
                                {displayMsg}
                            </div>
                        );
                    })
                )}
                {isGenerating && (
                    <div className="chat-message gemini" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                        <div style={{ fontWeight: '600', marginBottom: '8px', color: '#1e3a8a', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Generating Storyboard
                        </div>
                        {streamingText ? (
                            <ReactMarkdown>{streamingText}</ReactMarkdown>
                        ) : (
                            <div className="pulse-text" style={{ fontStyle: 'italic', color: '#94a3b8' }}>
                                Analyzing steps and preparing to generate...this could take a few moments.
                            </div>
                        )}
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
        </div>
    );
};
