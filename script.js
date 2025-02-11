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
let canvasWidth = canvas.width;
let canvasHeight = canvas.height;
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
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        for (let x = 0; x < spectrogramData.length; x++) {
            for (let y = 0; y < bufferLength; y++) {
                const value = spectrogramData[x][y];
                const color = getColor(value);
                ctx.fillStyle = color;
                ctx.fillRect(x, canvasHeight - (y * (canvasHeight / bufferLength)), 1, (canvasHeight / bufferLength));
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
    const link = document.createElement('a');
    link.download = 'spectrogram.png';
    link.href = canvas.toDataURL();
    link.click();
}

startMicButton.addEventListener('click', startMicrophone);
uploadAudio.addEventListener('change', handleFileUpload);
saveImageButton.addEventListener('click', saveSpectrogramImage);
