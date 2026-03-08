import React, { useState, useRef, useEffect } from 'react';
import { WS_BASE_URL } from '../config';

export interface Step {
    step_title: string;
    description: string;
    image_prompt: string;
}

interface LiveChatProps {
    onStepsReceived?: (steps: Step[]) => void;
}

export const LiveChat: React.FC<LiveChatProps> = ({ onStepsReceived }) => {
    const [isConnected, setIsConnected] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [messages, setMessages] = useState<string[]>([]);
    const wsRef = useRef<WebSocket | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const nextPlayTimeRef = useRef<number>(0);
    const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

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
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            // Let AudioContext use the default hardware sample rate to avoid connection errors
            const audioContext = new window.AudioContext();
            audioContextRef.current = audioContext;
            const inputSampleRate = audioContext.sampleRate;

            const source = audioContext.createMediaStreamSource(stream);
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            source.connect(processor);
            processor.connect(audioContext.destination);

            processor.onaudioprocess = (e) => {
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    const inputData = e.inputBuffer.getChannelData(0);

                    // Downsample to 16000Hz expected by Gemini Live
                    const targetRate = 16000;
                    const ratio = inputSampleRate / targetRate;
                    const resampledLength = Math.round(inputData.length / ratio);
                    const resampled = new Float32Array(resampledLength);

                    for (let i = 0; i < resampledLength; i++) {
                        resampled[i] = inputData[Math.floor(i * ratio)];
                    }

                    // Convert Float32Array to Int16Array (PCM 16-bit)
                    const pcm16 = new Int16Array(resampled.length);
                    for (let i = 0; i < resampled.length; i++) {
                        let s = Math.max(-1, Math.min(1, resampled[i]));
                        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                    }

                    wsRef.current.send(pcm16.buffer);
                }
            };

            setIsRecording(true);
        } catch (error) {
            console.error('Error starting recording:', error);
        }
    };

    const stopRecording = () => {
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
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
            audioContextRef.current = new window.AudioContext();
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
                        <button onClick={connect}>Connect to Assistant</button>
                    ) : (
                        <button className="danger" onClick={disconnect}>Disconnect</button>
                    )}
                </div>
            </div>

            {isConnected && (
                <div className="chat-controls">
                    {!isRecording ? (
                        <button className="success" onClick={startRecording}>🎙️ Start Speaking</button>
                    ) : (
                        <button className="danger pulsate" onClick={stopRecording}>⏹️ Stop Speaking</button>
                    )}
                    <button className="secondary" onClick={() => {
                        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                            wsRef.current.send("Please call the generate_storyboard function now to draft the storyboard steps.");
                            setMessages((prev) => [...prev, 'You: (Requested to draft storyboard steps)']);
                        }
                    }}>
                        Draft Steps Now
                    </button>
                    <button className="secondary" onClick={() => {
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
                    </button>
                </div>
            )}
            <div className="chat-messages">
                {messages.length === 0 ? (
                    <div style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>
                        Connect to the assistant to start ideating...
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
            </div>
        </div>
    );
};
