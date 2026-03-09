class CaptureWorklet extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.bufferSize = 4096;
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
        this.inputSampleRate = options.processorOptions?.sampleRate || 48000;
    }

    process(inputs) {
        const input = inputs[0];
        if (!input || !input[0]) return true;

        const channelData = input[0];

        for (let i = 0; i < channelData.length; i++) {
            this.buffer[this.bufferIndex++] = channelData[i];

            if (this.bufferIndex >= this.bufferSize) {
                this.flushBuffer();
            }
        }

        return true;
    }

    flushBuffer() {
        const targetRate = 16000;
        const ratio = this.inputSampleRate / targetRate;
        const resampledLength = Math.round(this.bufferSize / ratio);
        const resampled = new Float32Array(resampledLength);

        for (let i = 0; i < resampledLength; i++) {
            resampled[i] = this.buffer[Math.floor(i * ratio)];
        }

        const pcm16 = new Int16Array(resampledLength);
        for (let i = 0; i < resampledLength; i++) {
            let s = Math.max(-1, Math.min(1, resampled[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
        this.bufferIndex = 0;
    }
}

registerProcessor('capture-worklet', CaptureWorklet);
