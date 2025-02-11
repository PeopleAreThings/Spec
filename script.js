class SpectrogramGenerator {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.canvas = document.getElementById('spectrogramCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.audioData = null;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // File input handling
        const fileInput = document.getElementById('audioFile');
        const dropZone = document.getElementById('dropZone');
        
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        // Drag and drop handling
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

        // Button handling
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
        if (!this.audioData) return;

        this.showProgress();
        
        // Get settings
        const fftSize = parseInt(document.getElementById('fftSize').value);
        const colorScheme = document.getElementById('colorScheme').value;
        const freqScale = document.getElementById('freqScale').value;

        // Setup analyzer
        const analyzer = this.audioContext.createAnalyser();
        analyzer.fftSize = fftSize;
        
        // Setup canvas
        const width = Math.ceil(this.audioData.length / analyzer.fftSize) * 2;
        const height = analyzer.frequencyBinCount;
        this.canvas.width = width;
        this.canvas.height = height;

        // Process audio data
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
        
        source.start();

        // Process audio in chunks
        const frequencyData = new Uint8Array(analyzerNode.frequencyBinCount);
        let currentX = 0;

        const processChunk = () => {
            analyzerNode.getByteFrequencyData(frequencyData);
            this.drawSpectrogramColumn(currentX, frequencyData, colorScheme, freqScale);
            currentX += 1;
            
            const progress = (currentX / width) * 100;
            this.updateProgress(progress);

            if (currentX < width) {
                requestAnimationFrame(processChunk);
            } else {
                this.finalizeSpectrogram();
            }
        };

        await offlineContext.startRendering();
        processChunk();
    }

    drawSpectrogramColumn(x, frequencyData, colorScheme, freqScale) {
        const height = this.canvas.height;
        
        for (let y = 0; y < height; y++) {
            const index = freqScale === 'log' 
                ? Math.floor(Math.exp(Math.log(height) * (y / height))) 
                : y;
                
            const value = frequencyData[index];
            const color = this.getColor(value, colorScheme);
            
            this.ctx.fillStyle = color;
            this.ctx.fillRect(x, height - y, 1, 1);
        }
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

    finalizeSpectrogram() {
        this.hideProgress();
        this.canvas.classList.add('visible');
        document.getElementById('downloadBtn').disabled = false;
        
        // Add frequency labels
        this.addFrequencyLabels();
    }

    addFrequencyLabels() {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCanvas.width = this.canvas.width + 60;  // Extra space for labels
        tempCanvas.height = this.canvas.height + 40;  // Extra space for time axis
        
        // Draw original spectrogram
        tempCtx.fillStyle = '#fff';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.drawImage(this.canvas, 60, 0);
        
        // Add frequency labels
        tempCtx.fillStyle = '#000';
        tempCtx.font = '12px Arial';
        
        const freqLabels = [0, 1000, 2000, 5000, 10000, 20000];
        freqLabels.forEach(freq => {
            const y = this.canvas.height * (1 - freq / 22050);  // Nyquist frequency
            tempCtx.fillText(`${freq} Hz`, 0, y + 4);
            tempCtx.beginPath();
            tempCtx.moveTo(55, y);
            tempCtx.lineTo(60, y);
            tempCtx.stroke();
        });
        
        // Add time labels
        const duration = this.audioData.duration;
        const timeLabels = [0, duration/4, duration/2, duration*3/4, duration];
        timeLabels.forEach(time => {
            const x = 60 + (this.canvas.width * (time / duration));
            tempCtx.fillText(`${time.toFixed(1)}s`, x, this.canvas.height + 20);
        });
        
        // Update canvas
        this.canvas.width = tempCanvas.width;
        this.canvas.height = tempCanvas.height;
        this.ctx.drawImage(tempCanvas, 0, 0);
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
        progressFill.style.width = `${percent}%`;
    }
}

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.spectrogramGenerator = new SpectrogramGenerator();
});
