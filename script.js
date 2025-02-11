const canvas = document.getElementById('spectrogram');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 400;

const startMicButton = document.getElementById('start-mic');
const uploadAudio = document.getElementById('upload-audio');
const saveImageButton = document.getElementById('save-image');

let audioContext;
let analyser;
let bufferLength;
let dataArray;
let spectrogramData = [];

async function startMicrophone() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
    
    source.connect(analyser);
    drawSpectrogram();
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        playAudio(e.target.result);
    };
    reader.readAsArrayBuffer(file);
}

async function playAudio(arrayBuffer) {
    audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    source.connect(analyser);
    analyser.connect(audioContext.destination);
    source.start();
    
    drawSpectrogram();
}

function drawSpectrogram() {
    const draw = () => {
        analyser.getByteFrequencyData(dataArray);
        spectrogramData.push([...dataArray]);

        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (let x = 0; x < spectrogramData.length; x++) {
            for (let y = 0; y < bufferLength; y++) {
                const value = spectrogramData[x][y];
                const color = getColor(value);
                ctx.fillStyle = color;
                ctx.fillRect(x, canvas.height - (y * (canvas.height / bufferLength)), 1, (canvas.height / bufferLength));
            }
        }

        requestAnimationFrame(draw);
    };
    draw();
}

function getColor(value) {
    const scale = ["#000", "#330066", "#660099", "#9933FF", "#FF6600", "#FFFF00"];
    const index = Math.floor((value / 255) * (scale.length - 1));
    return scale[index];
}

function saveSpectrogramImage() {
    const imgCanvas = document.createElement('canvas');
    const imgCtx = imgCanvas.getContext('2d');

    imgCanvas.width = canvas.width + 100;
    imgCanvas.height = canvas.height + 50;
    
    // Draw spectrogram
    imgCtx.fillStyle = "black";
    imgCtx.fillRect(0, 0, imgCanvas.width, imgCanvas.height);
    imgCtx.drawImage(canvas, 50, 0);

    // Labels
    imgCtx.fillStyle = "white";
    imgCtx.font = "16px Arial";
    imgCtx.fillText("Frequency (Hz)", 10, 20);
    imgCtx.fillText("Time (s)", imgCanvas.width / 2, imgCanvas.height - 10);
    
    // Y-axis labels
    for (let i = 0; i <= 5; i++) {
        imgCtx.fillText(`${i}`, 10, imgCanvas.height - (i * (canvas.height / 5)) - 20);
    }
    
    // X-axis labels
    for (let i = 0; i <= 5; i++) {
        imgCtx.fillText(`${i}`, (i * (canvas.width / 5)) + 50, imgCanvas.height - 30);
    }
    
    // Color scale (right side)
    const colorScale = ["#FFFF00", "#FF6600", "#9933FF", "#660099", "#330066", "#000"];
    for (let i = 0; i < colorScale.length; i++) {
        imgCtx.fillStyle = colorScale[i];
        imgCtx.fillRect(imgCanvas.width - 40, i * 30 + 50, 20, 30);
        imgCtx.fillStyle = "white";
        imgCtx.fillText(`${-10 - (i * 20)}`, imgCanvas.width - 60, i * 30 + 70);
    }
    imgCtx.fillText("dBFS", imgCanvas.width - 60, 40);
    
    // Download
    const link = document.createElement('a');
    link.download = 'spectrogram.png';
    link.href = imgCanvas.toDataURL();
    link.click();
}

startMicButton.addEventListener('click', startMicrophone);
uploadAudio.addEventListener('change', handleFileUpload);
saveImageButton.addEventListener('click', saveSpectrogramImage);
