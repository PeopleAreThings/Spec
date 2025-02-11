class SpectrogramAnalyzer {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyserLeft = this.audioContext.createAnalyser();
        this.analyserRight = this.audioContext.createAnalyser();
        this.setupAnalysers();
        this.setupCanvases();
        this.setupControls();
        this.isRecording = false;
        this.animationFrame = null;
    }

    setupAnalysers() {
        this.analyserLeft.fftSize = 2048;
        this.analyserRight.fftSize = 2048;
        this.bufferLength = this.analyserLeft.frequencyBinCount;
        this.dataArrayLeft = new Uint8Array(this.bufferLength);
        this.dataArrayRight = new Uint8Array(this.bufferLength);
    }

    setupCanvases() {
        this.canvasLeft = document.getElementById('spectrogramLeft');
        this.canvasRight = document.getElementById('spectrogramRight');
        this.ctxLeft = this.canvasLeft.getContext('2d');
        this.ctxRight = this.canvasRight.getContext('2d');
        
        this.resizeCanvases();
        window.addEventListener('resize', () => this.resizeCanvases());
    }

    resizeCanvases() {
        const width = this.canvasLeft.parentElement.clientWidth;
        this.canvasLeft.width = width;
        this.canvasLeft.height = 300;
        this.canvasRight.width = width;
        this.canvasRight.height = 300;
    }

    setupControls() {
        document.getElementById('recordButton').addEventListener('click', () => this.startRecording());
        document.getElementById('stopButton').addEventListener('click', () => this.stopRecording());
        document.getElementById('audioFileInput').addEventListener('change', (e) => this.handleAudioFile(e));
        document.getElementById('downloadButton').addEventListener('click', () => this.downloadImage());
        document.getElementById('clearButton').addEventListener('click', () => this.clearSpectrograms());
        
        // Setup sliders
        this.sensitivity = document.getElementById('sensitivity');
        this.contrast = document.getElementById('contrast');
        this.zoom = document.getElementById('zoom');
        this.minFreq = document.getElementById('minFreq');
        this.maxFreq = document.getElementById('maxFreq');
        this.colorScheme = document.getElementById('colorScheme');
        
        // Update values display
        const sliders = [this.sensitivity, this.contrast, this.zoom, this.minFreq, this.maxFreq];
        sliders.forEach(slider => {
            slider.addEventListener('input', (e) => {
                const value = e.target.value;
                e.target.nextElementSibling.textContent = this.formatValue(slider.id, value);
                this.updateSpectrogram();
            });
        });
    }

    formatValue(id, value) {
        switch(id) {
            case 'sensitivity':
            case 'contrast':
                return `${value}.0%`;
            case 'zoom':
                return `${value}%`;
            case 'minFreq':
                return `${value}.0 Hz`;
            case 'maxFreq':
                return `${(value/1000).toFixed(1)} kHz`;
            default:
                return value;
        }
    }

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const source = this.audioContext.createMediaStreamSource(stream);
            const splitter = this.audioContext.createChannelSplitter(2);
            
            source.connect(splitter);
            splitter.connect(this.analyserLeft, 0);
            splitter.connect(this.analyserRight, 1);
            
            this.isRecording = true;
            document.getElementById('recordButton').disabled = true;
            document.getElementById('stopButton').disabled = false;
            
            this.draw();
        } catch (err) {
            console.error('Error accessing microphone:', err);
            alert('Error accessing microphone. Please ensure you have granted microphone permissions.');
        }
    }

    stopRecording() {
        this.isRecording = false;
        document.getElementById('recordButton').disabled = false;
        document.getElementById('stopButton').disabled = true;
        cancelAnimationFrame(this.animationFrame);
    }

    async handleAudioFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            const source = this.audioContext.createBufferSource();
            const splitter = this.audioContext.createChannelSplitter(2);
            
            source.buffer = audioBuffer;
            source.connect(splitter);
            splitter.connect(this.analyserLeft, 0);
            splitter.connect(this.analyserRight, 1);
            
            source.start(0);
            this.isRecording = true;
            this.draw();
        } catch (err) {
            console.error('Error loading audio file:', err);
            alert('Error loading audio file. Please ensure it\'s a valid audio format.');
        }
    }

    draw() {
        if (!this.isRecording) return;

        this.analyserLeft.getByteFrequencyData(this.dataArrayLeft);
        this.analyserRight.getByteFrequencyData(this.dataArrayRight);

        // Apply frequency range filtering
        const minFreq = this.minFreq.value;
        const maxFreq = this.maxFreq.value;
        const nyquist = this.audioContext.sampleRate / 2;
        const minBin = Math.floor((minFreq / nyquist) * this.bufferLength);
        const maxBin = Math.floor((maxFreq / nyquist) * this.bufferLength);

        // Shift existing data
        const zoom = this.zoom.value / 100;
        const shiftAmount = Math.max(1, Math.floor(zoom));
        
        this.ctxLeft.drawImage(this.canvasLeft, shiftAmount, 0, this.canvasLeft.width - shiftAmount, this.canvasLeft.height);
        this.ctxRight.drawImage(this.canvasRight, shiftAmount, 0, this.canvasRight.width - shiftAmount, this.canvasRight.height);

        // Draw new data
        const sensitivity = this.sensitivity.value / 100;
        const contrast = this.contrast.value / 100;
        
        this.drawColumn(this.ctxLeft, this.dataArrayLeft, sensitivity, contrast, minBin, maxBin);
        this.drawColumn(this.ctxRight, this.dataArrayRight, sensitivity, contrast, minBin, maxBin);

        this.animationFrame = requestAnimationFrame(() => this.draw());
    }

    drawColumn(ctx, data, sensitivity, contrast, minBin, maxBin) {
        const width = Math.max(1, Math.floor(this.zoom.value / 100));
        const height = ctx.canvas.height;
        const columnData = new Uint8ClampedArray(height * 4 * width);

        for (let y = 0; y < height; y++) {
            const binIndex = Math.floor(minBin + (y / height) * (maxBin - minBin));
            const value = Math.pow(data[binIndex] / 255 * sensitivity, contrast) * 255;
            const color = this.getColor(value);

            for (let x = 0; x < width; x++) {
                const pixelIndex = ((height - y - 1) * width + x) * 4;
                columnData[pixelIndex] = color[0];
                columnData[pixelIndex + 1] = color[1];
                columnData[pixelIndex + 2] = color[2];
                columnData[pixelIndex + 3] = 255;
            }
        }

        const imageData = new ImageData(columnData, width, height);
        ctx.putImageData(imageData, ctx.canvas.width - width, 0);
    }

    getColor(value) {
        const scheme = this.colorScheme.value;
        switch(scheme) {
            case 'heated':
                return [
                    Math.min(255, value * 2),
                    Math.max(0, value - 128) * 2,
                    Math.max(0, value - 192) * 4
                ];
            case 'viridis':
                return [
                    value,
                    Math.min(255, value * 1.5),
                    Math.max(0, 255 - value)
                ];
            case 'magma':
                return [
                    Math.min(255, value * 2),
                    Math.max(0, value - 64),
                    Math.min(255, value * 1.5)
                ];
            default:
                return [value, value, value];
        }
    }

    clearSpectrograms() {
        this.ctxLeft.clearRect(0, 0, this.canvasLeft.width, this.canvasLeft.height);
        this.ctxRight.clearRect(0, 0, this.canvasRight.width, this.canvasRight.height);
    }

    downloadImage() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set canvas size to fit both spectrograms and labels
        canvas.width = this.canvasLeft.width;
        canvas.height = this.canvasLeft.height * 2 + 60;
        
        // Fill background
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw spectrograms
        ctx.drawImage(this.canvasLeft, 0, 20);
        ctx.drawImage(this.canvasRight, 0, this.canvasLeft.height + 40);
        
        // Add labels
        ctx.fillStyle = '#aaa';
        ctx.font = '12px Arial';
        ctx.fillText('LEFT CHANNEL', 10, 15);
        ctx.fillText('RIGHT CHANNEL', 10, this.canvasLeft.height + 35);
        
        // Add frequency scale
        this.drawFrequencyScale(ctx);
        
        // Create download link
        const link = document.createElement('a');
        link.download = 'spectrogram.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    drawFrequencyScale(ctx) {
        const scaleWidth = 40;
        const minFreq = this.minFreq.value;
        const maxFreq = this.maxFreq.value;
        
        ctx.fillStyle = '#aaa';
        ctx.font = '10px Arial';
        
        for (let i = 0; i <= 5; i++) {
            const freq = minFreq + (maxFreq - minFreq) * (i / 5);
            const y = this.canvasLeft.height - (i / 5) * this.canvasLeft.height;
            
            ctx.fillText(
                freq >= 1000 ? `${(freq/1000).toFixed(1)}kHz` : `${freq}Hz`,
                this.canvasLeft.width - scaleWidth,
                y + 15
            );
        }
    }
}

// Initialize the analyzer when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.spectrogramAnalyzer = new SpectrogramAnalyzer();
});