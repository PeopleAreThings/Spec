class SpectrogramGenerator {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.canvas = document.getElementById('spectrogramCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.audioData = null;
        this.currentTime = 0;
        this.isProcessing = false;
        this.setupEventListeners();
    }

    setupEventListeners() {
        const fileInput = document.getElementById('audioFile');
        const dropZone = document.getElementById('dropZone');
        
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('audio/')) {
                fileInput.files = e.dataTransfer.files;
                this.handleFileSelect(e);
            }
        });

        document.getElementById('generateBtn').addEventListener('click', () => this.generateSpectrogram());
        document.getElementById('downloadBtn').addEventListener('click', () => this.downloadSpectrogram());
    }

    async handleFileSelect(event) {
        const file = event.target.files[0] || event.dataTransfer.files[0];
        if (!file) return;

        document.getElementById('generateBtn').disabled = false;
        this.showProgress();

        try {
            const arrayBuffer = await file.arrayBuffer();
            this.audioData = await this.audioContext.decodeAudioData(arrayBuffer);
            this.updateProgress(100);
            this.hideProgress();
        } catch (error) {
            console.error('Error loading audio file:', error);
            alert('Error loading audio file. Please ensure it\'s a valid audio format.');
            this.hideProgress();
        }
    }

    async generateSpectrogram() {
        if (!this.audioData || this.isProcessing) return;

        this.isProcessing = true;
        this.showProgress();
        
        // Get settings
        const fftSize = parseInt(document.getElementById('fftSize').value);
        const colorScheme = document.getElementById('colorScheme').value;
        const freqScale = document.getElementById('freqScale').value;

        // Setup canvas
        const timeWidth = Math.ceil(this.audioData.duration * 100); // 100 pixels per second
        const height = fftSize / 2; // Half of FFT size for frequency bins
        this.canvas.width = timeWidth + 100; // Extra space for labels
        this.canvas.height = height + 60; // Extra space for time axis

        // Clear canvas
        this.ctx.fillStyle = '#fff';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Setup audio processing
        const offlineContext = new OfflineAudioContext(
            1,
            this.audioData.length,
            this.audioData.sampleRate
        );

        const source = offlineContext.createBufferSource();
        source.buffer = this.audioData;
        
        const analyzerNode = offlineContext.createAnalyser();
        analyzerNode.fftSize = fftSize;
        
        source.connect(analyzerNode);
        analyzerNode.connect(offlineContext.destination);
        
        const frequencyData = new Uint8Array(analyzerNode.frequencyBinCount);
        let currentX = 100; // Start after frequency labels

        // Start audio processing
        source.start();
        await offlineContext.startRendering();

        // Process audio frames
        const processFrame = () => {
            if (!this.isProcessing) return;

            analyzerNode.getByteFrequencyData(frequencyData);
            this.drawSpectrogramColumn(currentX, frequencyData, colorScheme, freqScale);
            
            currentX++;
            this.currentTime = (currentX - 100) / 100; // Convert pixels to seconds
            
            const progress = ((currentX - 100) / timeWidth) * 100;
            this.updateProgress(progress);

            if (currentX < timeWidth + 100) {
                requestAnimationFrame(processFrame);
            } else {
                this.finalizeSpectrogram();
            }
        };

        // Draw frequency labels before starting
        this.drawFrequencyLabels();
        processFrame();
    }

    drawSpectrogramColumn(x, frequencyData, colorScheme, freqScale) {
        const height = this.canvas.height - 60; // Adjust for time axis space
        
        for (let y = 0; y < height; y++) {
            let index;
            if (freqScale === 'log') {
                // Logarithmic frequency scaling
                const minFreq = 20;
                const maxFreq = this.audioContext.sampleRate / 2;
                const logMin = Math.log10(minFreq);
                const logMax = Math.log10(maxFreq);
                const logY = logMin + (logMax - logMin) * (y / height);
                index = Math.floor((Math.pow(10, logY) / maxFreq) * frequencyData.length);
            } else if (freqScale === 'mel') {
                // Mel scale frequency scaling
                const melMax = this.freqToMel(this.audioContext.sampleRate / 2);
                const melY = (y / height) * melMax;
                const freq = this.melToFreq(melY);
                index = Math.floor((freq / (this.audioContext.sampleRate / 2)) * frequencyData.length);
            } else {
                // Linear frequency scaling
                index = Math.floor((y / height) * frequencyData.length);
            }

            if (index >= 0 && index < frequencyData.length) {
                const value = frequencyData[index];
                const color = this.getColor(value, colorScheme);
                this.ctx.fillStyle = color;
                this.ctx.fillRect(x, height - y, 1, 1);
            }
        }
    }

    // Mel scale conversion functions
    freqToMel(freq) {
        return 2595 * Math.log10(1 + freq / 700);
    }

    melToFreq(mel) {
        return 700 * (Math.pow(10, mel / 2595) - 1);
    }

    getColor(value, scheme) {
        const normalized = value / 255;
        
        switch (scheme) {
            case 'heated':
                return `rgb(
                    ${Math.min(255, value * 2)},
                    ${Math.max(0, value - 128) * 2},
                    ${Math.max(0, value - 192) * 4}
                )`;
            case 'viridis':
                return `rgb(
                    ${value},
                    ${Math.min(255, value * 1.5)},
                    ${Math.max(0, 255 - value)}
                )`;
            case 'magma':
                return `rgb(
                    ${Math.min(255, value * 2)},
                    ${Math.max(0, value - 64)},
                    ${Math.min(255, value * 1.5)}
                )`;
            default:
                return `rgb(${value}, ${value}, ${value})`;
        }
    }

    drawFrequencyLabels() {
        this.ctx.fillStyle = '#000';
        this.ctx.font = '12px Arial';
        
        // Draw frequency axis title
        this.ctx.save();
        this.ctx.translate(20, this.canvas.height / 2);
        this.ctx.rotate(-Math.PI / 2);
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Frequency (Hz)', 0, 0);
        this.ctx.restore();

        // Draw frequency labels
        const freqLabels = [
            20, 50, 100, 200, 500, 
            1000, 2000, 5000, 10000, 
            15000, 20000
        ];

        freqLabels.forEach(freq => {
            const y = this.freqToY(freq);
            if (y >= 0 && y <= this.canvas.height - 60) {
                this.ctx.textAlign = 'right';
                this.ctx.fillText(this.formatFreq(freq), 95, y + 4);
                
                // Draw grid line
                this.ctx.strokeStyle = '#eee';
                this.ctx.beginPath();
                this.ctx.moveTo(100, y);
                this.ctx.lineTo(this.canvas.width, y);
                this.ctx.stroke();
            }
        });
    }

    freqToY(freq) {
        const height = this.canvas.height - 60;
        const freqScale = document.getElementById('freqScale').value;
        
        if (freqScale === 'log') {
            const minFreq = 20;
            const maxFreq = this.audioContext.sampleRate / 2;
            const logMin = Math.log10(minFreq);
            const logMax = Math.log10(maxFreq);
            const logFreq = Math.log10(freq);
            return height - ((logFreq - logMin) / (logMax - logMin)) * height;
        } else if (freqScale === 'mel') {
            const melMax = this.freqToMel(this.audioContext.sampleRate / 2);
            const melFreq = this.freqToMel(freq);
            return height - (melFreq / melMax) * height;
        } else {
            return height - (freq / (this.audioContext.sampleRate / 2)) * height;
        }
    }

    formatFreq(freq) {
        return freq >= 1000 ? `${freq/1000}k` : freq;
    }

    drawTimeLabels() {
        this.ctx.fillStyle = '#000';
        this.ctx.font = '12px Arial';
        
        // Draw time axis title
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Time (seconds)', this.canvas.width / 2, this.canvas.height - 10);

        // Draw time labels
        const timeStep = 1; // 1 second intervals
        for (let t = 0; t <= this.audioData.duration; t += timeStep) {
            const x = 100 + t * 100; // 100 pixels per second
            this.ctx.fillText(t.toFixed(1), x, this.canvas.height - 30);
            
            // Draw grid line
            this.ctx.strokeStyle = '#eee';
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height - 60);
            this.ctx.stroke();
        }
    }

    finalizeSpectrogram() {
        this.isProcessing = false;
        this.hideProgress();
        this.drawTimeLabels();
        this.canvas.classList.add('visible');
        document.getElementById('downloadBtn').disabled = false;
    }

    downloadSpectrogram() {
        const format = document.getElementById('outputFormat').value;
        const link = document.createElement('a');
        link.download = `spectrogram.${format}`;
        link.href = this.canvas.toDataURL(`image/${format}`);
        link.click();
    }

    showProgress() {
        const progress = document.querySelector('.progress');
        progress.classList.add('active');
    }

    hideProgress() {
        const progress = document.querySelector('.progress');
        progress.classList.remove('active');
    }

    updateProgress(percent) {
        const progressFill = document.querySelector('.progress-fill');
        progressFill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    }
}

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.spectrogramGenerator = new SpectrogramGenerator();
});
