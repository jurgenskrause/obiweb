// ObiWeb MOD Player
// A lightweight MOD player using Web Audio API

class ModPlayer {
    constructor() {
        // Audio context and nodes
        this.audioContext = null;
        this.gainNode = null;
        this.analyser = null;
        
        // Playback state
        this.isPlaying = false;
        this.isPaused = false;
        this.startTime = 0;
        this.pausedAt = 0;
        this.currentPattern = 0;
        this.currentRow = 0;
        this.ticksPerRow = 6;
        this.currentTick = 0;
        this.bpm = 125;
        this.samplesPerTick = 0;
        this.patternDelay = 0;
        this.mainVolume = 0.7; // Default volume level
        this.nextTickTimer = null; // Timer for next tick
        
        // MOD file data
        this.modData = null;
        this.samples = [];
        this.patterns = [];
        this.patternTable = [];
        this.title = '';
        this.channelCount = 4;
        this.currentPosition = 0;
        this.songLength = 0;
        this.audioSources = [];
        this.channels = [];
        this.audioNodes = [];
        this.lastNotesByChannel = [];
        
        // DOM elements
        this.visualizerCanvas = document.getElementById('visualizer');
        this.visualizerCtx = this.visualizerCanvas.getContext('2d');
        this.playBtn = document.getElementById('playBtn');
        this.pauseBtn = document.getElementById('pauseBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.seekBar = document.getElementById('seekBar');
        this.currentTimeDisplay = document.getElementById('currentTime');
        this.totalTimeDisplay = document.getElementById('totalTime');
        this.songTitleElement = document.getElementById('songTitle');
        this.songDetailsElement = document.getElementById('songDetails');
        this.dropZone = document.getElementById('dropZone');
        this.fileInput = document.getElementById('fileInput');
        this.sampleFilesContainer = document.getElementById('sampleFiles');
        this.volumeControl = document.getElementById('volumeControl');
        this.patternViewer = document.getElementById('patternViewer');
        this.channelHeaders = document.getElementById('channelHeaders');
        this.patternRows = document.getElementById('patternRows');
        this.sampleViewer = document.getElementById('sampleViewer');
        
        // Initialize
        this.setupEventListeners();
        this.setupCanvas();
        this.loadSampleFiles();
    }
    
    initAudioContext() {
        if (!this.audioContext) {
            // Create the audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create main gain node for volume control
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = this.mainVolume;
            
            // Create analyzer node for visualizations
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.85;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            
            // Add a compressor to prevent clipping and improve sound quality
            const compressor = this.audioContext.createDynamicsCompressor();
            compressor.threshold.value = -24;
            compressor.knee.value = 30;
            compressor.ratio.value = 12;
            compressor.attack.value = 0.003;
            compressor.release.value = 0.25;
            
            // Connect the nodes
            this.gainNode.connect(compressor);
            compressor.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);
            
            // Calculate samples per tick based on audio context sample rate
            const tickDuration = 2.5 / this.bpm; // seconds per tick
            this.samplesPerTick = Math.floor(this.audioContext.sampleRate * tickDuration);
        }
    }
    
    setupCanvas() {
        this.visualizerCanvas.width = this.visualizerCanvas.offsetWidth;
        this.visualizerCanvas.height = this.visualizerCanvas.offsetHeight;
        this.visualizerCtx.fillStyle = '#121212';
        this.visualizerCtx.fillRect(0, 0, this.visualizerCanvas.width, this.visualizerCanvas.height);
    }
    
    setupEventListeners() {
        this.playBtn.addEventListener('click', () => this.play());
        this.pauseBtn.addEventListener('click', () => this.pause());
        this.stopBtn.addEventListener('click', () => this.stop());
        
        this.seekBar.addEventListener('input', () => {
            if (this.modData) {
                const position = Math.floor(this.patternTable.length * (parseInt(this.seekBar.value) / 100));
                this.seek(position);
            }
        });
        
        // Volume control
        this.volumeControl.addEventListener('input', () => {
            this.mainVolume = parseInt(this.volumeControl.value) / 100;
            if (this.gainNode) {
                this.gainNode.gain.value = this.mainVolume;
            }
        });
        
        this.fileInput.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                this.loadModFile(e.target.files[0]);
            }
        });
        
        this.dropZone.addEventListener('click', () => this.fileInput.click());
        
        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.classList.add('drag-over');
        });
        
        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.classList.remove('drag-over');
        });
        
        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('drag-over');
            
            if (e.dataTransfer.files.length) {
                this.loadModFile(e.dataTransfer.files[0]);
            }
        });
        
        window.addEventListener('resize', () => {
            this.visualizerCanvas.width = this.visualizerCanvas.offsetWidth;
            this.visualizerCanvas.height = this.visualizerCanvas.offsetHeight;
        });
    }
    
    loadSampleFiles() {
        const modFiles = [
            'BLADERUN.MOD',
            'PETERGUN.MOD',
            'ATAK.MOD',
            'IMF.MOD',
            'JAMES_B.MOD',
            '007.MOD',
            'LEVEL.MOD',
            'FEAR.MOD',
            'HEAT.MOD'
        ];
        
        modFiles.forEach(file => {
            const fileButton = document.createElement('div');
            fileButton.className = 'sample-file';
            fileButton.textContent = file;
            fileButton.addEventListener('click', () => this.loadSampleModFile(file));
            this.sampleFilesContainer.appendChild(fileButton);
        });
    }
    
    loadSampleModFile(filename) {
        fetch(`samples/${filename}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.arrayBuffer();
            })
            .then(data => {
                this.parseModFile(new Uint8Array(data), filename);
            })
            .catch(error => {
                console.error('Error loading sample MOD file:', error);
                alert('Error loading the sample MOD file. See console for details.');
            });
    }
    
    loadModFile(file) {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            this.parseModFile(new Uint8Array(e.target.result), file.name);
        };
        
        reader.onerror = () => {
            console.error('Error reading file');
            alert('Error reading the file. Please try again.');
        };
        
        reader.readAsArrayBuffer(file);
    }
    
    cleanupAudio() {
        // Clear any active timers
        if (this.nextTickTimer) {
            clearTimeout(this.nextTickTimer);
            this.nextTickTimer = null;
        }
        
        // Stop all currently playing sounds
        if (this.audioSources) {
            this.audioSources.forEach(source => {
                if (source) {
                    try {
                        source.stop();
                    } catch (e) {
                        // Source might have already stopped
                    }
                }
            });
        }
        
        // Clear audio nodes
        this.audioSources = [];
        this.audioNodes = [];
        
        // Close and clear the audio context
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
            this.gainNode = null;
            this.analyser = null;
        }
    }
    
    parseModFile(data, filename) {
        try {
            // Clean up existing audio context and nodes
            this.cleanupAudio();
            
            // Reset playback state
            this.isPlaying = false;
            this.isPaused = false;
            this.currentPosition = 0;
            this.currentRow = 0;
            this.currentTick = 0;
            this.ticksPerRow = 6;
            this.bpm = 125;
            this.nextTickTimer = null;
            
            // Initialize new audio context
            this.initAudioContext();
            this.stop();
            
            this.modData = data;
            
            // Extract title (bytes 0-19)
            this.title = '';
            for (let i = 0; i < 20; i++) {
                if (data[i] >= 32 && data[i] <= 126) { // ASCII printable characters
                    this.title += String.fromCharCode(data[i]);
                }
            }
            this.title = this.title.trim() || filename;
            
            // Parse MOD format (bytes 1080-1083)
            const formatBytes = data.slice(1080, 1084);
            const formatString = String.fromCharCode(...formatBytes);
            
            // Determine channel count based on format
            if (formatString === 'M.K.' || formatString === 'FLT4' || formatString === '4CHN') {
                this.channelCount = 4;
                this.format = 'ProTracker';
            } else if (formatString === '6CHN') {
                this.channelCount = 6;
                this.format = 'FastTracker';
            } else if (formatString === '8CHN') {
                this.channelCount = 8;
                this.format = 'FastTracker';
            } else {
                this.channelCount = 4;
                this.format = 'MOD';
            }
            
            // Parse sample information (31 samples, each with 30 bytes of info)
            this.samples = [];
            for (let i = 0; i < 31; i++) {
                const sampleOffset = 20 + (i * 30);
                
                // Sample name
                let sampleName = '';
                for (let j = 0; j < 22; j++) {
                    if (data[sampleOffset + j] >= 32 && data[sampleOffset + j] <= 126) {
                        sampleName += String.fromCharCode(data[sampleOffset + j]);
                    }
                }
                
                // Sample length (in words, multiply by 2 for bytes)
                const sampleLength = (data[sampleOffset + 22] << 8 | data[sampleOffset + 23]) * 2;
                
                // Finetune (0-15)
                const finetune = data[sampleOffset + 24] & 0x0F;
                
                // Volume (0-64)
                const volume = data[sampleOffset + 25];
                
                // Repeat start and length (in words, multiply by 2 for bytes)
                const repeatStart = (data[sampleOffset + 26] << 8 | data[sampleOffset + 27]) * 2;
                const repeatLength = (data[sampleOffset + 28] << 8 | data[sampleOffset + 29]) * 2;
                
                this.samples.push({
                    name: sampleName.trim(),
                    length: sampleLength,
                    finetune,
                    volume,
                    repeatStart,
                    repeatLength,
                    data: null // Will populate later with actual sample data
                });
            }
            
            // Song length (number of patterns)
            this.songLength = data[950];
            
            // Pattern table (0-127)
            this.patternTable = Array.from(data.slice(952, 952 + this.songLength));
            
            // Find highest pattern number
            const highestPattern = Math.max(...this.patternTable);
            
            // Parse pattern data
            const patternDataOffset = 1084; // After the header
            this.patterns = [];
            
            for (let i = 0; i <= highestPattern; i++) {
                const patternOffset = patternDataOffset + (i * 1024);
                const pattern = [];
                
                // 64 rows per pattern
                for (let row = 0; row < 64; row++) {
                    const rowData = [];
                    
                    // Parse data for each channel
                    for (let channel = 0; channel < this.channelCount; channel++) {
                        const noteOffset = patternOffset + (row * this.channelCount * 4) + (channel * 4);
                        
                        // Read the 4 bytes that make up a note
                        const byte1 = data[noteOffset];
                        const byte2 = data[noteOffset + 1];
                        const byte3 = data[noteOffset + 2];
                        const byte4 = data[noteOffset + 3];
                        
                        // Extract sample number (upper 4 bits of byte1 and upper 4 bits of byte3)
                        const sampleNumber = ((byte1 & 0xF0) | ((byte3 & 0xF0) >> 4));
                        
                        // Extract period value (12 bits: lower 4 bits of byte1 and byte2)
                        const period = ((byte1 & 0x0F) << 8) | byte2;
                        
                        // Extract effect command (lower 4 bits of byte3)
                        const effectCommand = byte3 & 0x0F;
                        
                        // Extract effect parameter
                        const effectParameter = byte4;
                        
                        rowData.push({
                            sampleNumber,
                            period,
                            effectCommand,
                            effectParameter
                        });
                    }
                    pattern.push(rowData);
                }
                this.patterns.push(pattern);
            }
            
            // Extract sample data - follows pattern data
            const sampleDataOffset = patternDataOffset + ((highestPattern + 1) * 1024);
            let currentOffset = sampleDataOffset;
            
            for (let i = 0; i < this.samples.length; i++) {
                if (this.samples[i].length > 0) {
                    const sampleData = data.slice(currentOffset, currentOffset + this.samples[i].length);
                    
                    // Convert to audio buffer
                    const audioBuffer = this.convertSampleToAudioBuffer(sampleData, this.samples[i]);
                    this.samples[i].buffer = audioBuffer;
                    
                    currentOffset += this.samples[i].length;
                }
            }
            
            // Initialize channel state
            this.channels = [];
            for (let i = 0; i < this.channelCount; i++) {
                this.channels.push({
                    sample: 0,
                    period: 0,
                    volume: 0,
                    panning: i % 2 ? 0.7 : 0.3, // Simple stereo panning
                    effectCommand: 0,
                    effectParameter: 0
                });
            }
            
            // Update UI
            this.songTitleElement.textContent = this.title;
            this.songDetailsElement.textContent = `Format: ${this.format} | Channels: ${this.channelCount}`;
            this.seekBar.disabled = false;
            this.playBtn.disabled = false;
            this.pauseBtn.disabled = true;
            this.stopBtn.disabled = true;
            this.totalTimeDisplay.textContent = this.formatPatternPosition(this.songLength - 1, 63);
            
            // Initialize the pattern viewer and sample viewer
            this.initializePatternViewer();
            this.initializeSampleViewer();
            
            console.log('MOD file parsed successfully:', {
                title: this.title,
                format: this.format,
                channelCount: this.channelCount,
                songLength: this.songLength,
                samples: this.samples.length,
                patterns: this.patterns.length
            });
            
            // Start playback
            this.play();
            
        } catch (error) {
            console.error('Error parsing MOD file:', error);
            alert('Error parsing the MOD file. This file format might not be supported.');
        }
    }
    
    convertSampleToAudioBuffer(sampleData, sampleInfo) {
        // Create an AudioBuffer with the sample data
        const buffer = this.audioContext.createBuffer(1, sampleData.length, this.audioContext.sampleRate);
        const channel = buffer.getChannelData(0);
        
        // Convert 8-bit signed samples to float
        for (let i = 0; i < sampleData.length; i++) {
            // Convert 8-bit unsigned to signed
            const sample = sampleData[i];
            channel[i] = (sample < 128 ? sample : sample - 256) / 128.0;
        }
        
        return buffer;
    }
    
    playSample(channel, sampleNumber, period) {
        if (sampleNumber === 0 || sampleNumber > this.samples.length) {
            return;
        }
        
        const sample = this.samples[sampleNumber - 1];
        if (!sample.buffer || sample.length === 0) {
            return;
        }
        
        // Stop any currently playing sound on this channel
        if (this.audioSources[channel]) {
            try {
                this.audioSources[channel].stop();
            } catch (e) {
                // Source might have already stopped
            }
        }
        
        // Calculate the playback rate based on the period value
        // Use the Amiga PAL clock rate formula for more accurate pitch
        const amigaPALClockRate = 7093789.2;
        
        // Apply finetune correction
        // Finetune values are in the range 0-15, where 8 is no finetune
        // Each step is 1/8th of a semitone (±4 semitones total range)
        let tuningFactor = 1.0;
        if (sample.finetune !== 8) {
            // Convert finetune to a range of -8 to +7
            const fineTuneOffset = sample.finetune <= 7 ? sample.finetune : sample.finetune - 16;
            // Each semitone is a factor of 2^(1/12), so one finetune step is 2^(1/96)
            tuningFactor = Math.pow(2, fineTuneOffset / 96);
        }
        
        const frequency = period > 0 ? (amigaPALClockRate / (period * 2)) * tuningFactor : 0;
        const playbackRate = frequency / this.audioContext.sampleRate;
        
        // Create source node
        const source = this.audioContext.createBufferSource();
        source.buffer = sample.buffer;
        
        // Create gain node for volume control
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = sample.volume / 64;
        
        // Create panner for stereo placement
        const pannerNode = this.audioContext.createStereoPanner();
        pannerNode.pan.value = this.channels[channel].panning;
        
        // Connect nodes
        source.connect(gainNode);
        gainNode.connect(pannerNode);
        pannerNode.connect(this.gainNode);
        
        // Set playback rate
        source.playbackRate.value = playbackRate;
        
        // Store nodes for later control
        this.audioSources[channel] = source;
        this.audioNodes[channel] = { gain: gainNode, panner: pannerNode };
        
        // Set up looping if the sample has a repeat section
        if (sample.repeatLength > 2) {
            const loopStartTime = sample.repeatStart / this.audioContext.sampleRate;
            const loopEndTime = (sample.repeatStart + sample.repeatLength) / this.audioContext.sampleRate;
            
            if (loopEndTime > loopStartTime) {
                source.loop = true;
                source.loopStart = loopStartTime;
                source.loopEnd = loopEndTime;
            }
        }
        
        // Start playing
        source.start();
        
        // Record this note for visualization
        this.lastNotesByChannel[channel] = { sampleNumber, period };
    }
    
    processRow() {
        // Get the current pattern and row
        const patternIndex = this.patternTable[this.currentPosition];
        const pattern = this.patterns[patternIndex];
        const row = pattern[this.currentRow];
        
        // Process each channel
        for (let c = 0; c < this.channelCount; c++) {
            const note = row[c];
            
            // Update channel state
            this.channels[c].effectCommand = note.effectCommand;
            this.channels[c].effectParameter = note.effectParameter;
            
            // If there's a note (period != 0), play it
            if (note.period !== 0) {
                this.channels[c].period = note.period;
                if (note.sampleNumber !== 0) {
                    this.channels[c].sample = note.sampleNumber;
                    this.channels[c].volume = this.samples[note.sampleNumber - 1].volume;
                }
                this.playSample(c, this.channels[c].sample, note.period);
            }
            
            // Process effects (simplified)
            this.processEffects(c, note.effectCommand, note.effectParameter);
        }
        
        // Move to next row or pattern
        this.currentRow++;
        if (this.currentRow >= 64) {
            this.currentRow = 0;
            this.currentPosition++;
            if (this.currentPosition >= this.songLength) {
                this.currentPosition = 0; // Loop back to start
            }
        }
        
        // Update UI
        this.updateUI();
    }
    
    processEffects(channel, effectCommand, effectParameter) {
        // This is a simplified effect processor - real MOD players implement many more effects
        switch (effectCommand) {
            case 0xA: // Volume slide
                // Not implemented in this simple player
                break;
                
            case 0xB: // Pattern jump
                this.currentPosition = effectParameter;
                this.currentRow = 0;
                break;
                
            case 0xC: // Set volume
                if (effectParameter <= 64) {
                    this.channels[channel].volume = effectParameter;
                    if (this.audioNodes[channel] && this.audioNodes[channel].gain) {
                        this.audioNodes[channel].gain.gain.value = effectParameter / 64;
                    }
                }
                break;
                
            case 0xD: // Pattern break
                this.currentRow = 0;
                this.currentPosition++;
                if (this.currentPosition >= this.songLength) {
                    this.currentPosition = 0;
                }
                break;
                
            case 0xF: // Set speed/tempo
                if (effectParameter <= 0x1F) {
                    this.ticksPerRow = effectParameter;
                } else {
                    this.bpm = effectParameter;
                    const tickDuration = 2.5 / this.bpm; // seconds per tick
                    this.samplesPerTick = Math.floor(this.audioContext.sampleRate * tickDuration);
                }
                break;
        }
    }
    
    playNextTick() {
        if (!this.isPlaying) return;
        
        // Process a new row every ticksPerRow ticks
        if (this.currentTick === 0) {
            this.processRow();
        }
        
        // Update tick counter
        this.currentTick = (this.currentTick + 1) % this.ticksPerRow;
        
        // Schedule next tick
        const tickDuration = 2.5 / this.bpm; // seconds per tick
        
        // Clear any existing timer
        if (this.nextTickTimer) {
            clearTimeout(this.nextTickTimer);
        }
        
        this.nextTickTimer = setTimeout(() => this.playNextTick(), tickDuration * 1000);
        
        // Update visualization
        this.updateVisualization();
    }
    
    play() {
        if (this.modData === null) return;
        
        this.initAudioContext();
        
        if (this.isPaused) {
            // Resume from paused position
            this.isPaused = false;
        } else {
            // Start from beginning or current position
            this.currentTick = 0;
        }
        
        this.isPlaying = true;
        
        // Update UI
        this.playBtn.disabled = true;
        this.pauseBtn.disabled = false;
        this.stopBtn.disabled = false;
        
        // Start playback
        this.playNextTick();
    }
    
    pause() {
        if (!this.isPlaying) return;
        
        // Clear any active timers
        if (this.nextTickTimer) {
            clearTimeout(this.nextTickTimer);
            this.nextTickTimer = null;
        }
        
        // Stop all currently playing sounds
        for (let i = 0; i < this.audioSources.length; i++) {
            if (this.audioSources[i]) {
                try {
                    this.audioSources[i].stop();
                } catch (e) {
                    // Source might have already stopped
                }
                this.audioSources[i] = null;
            }
        }
        
        this.isPlaying = false;
        this.isPaused = true;
        
        // Update UI
        this.playBtn.disabled = false;
        this.pauseBtn.disabled = true;
    }
    
    stop() {
        if (!this.isPlaying && !this.isPaused) return;
        
        // Clear any active timers
        if (this.nextTickTimer) {
            clearTimeout(this.nextTickTimer);
            this.nextTickTimer = null;
        }
        
        // Stop all currently playing sounds
        for (let i = 0; i < this.audioSources.length; i++) {
            if (this.audioSources[i]) {
                try {
                    this.audioSources[i].stop();
                } catch (e) {
                    // Source might have already stopped
                }
                this.audioSources[i] = null;
            }
        }
        
        // Reset playback position
        this.isPlaying = false;
        this.isPaused = false;
        this.currentPosition = 0;
        this.currentRow = 0;
        this.currentTick = 0;
        
        // Update UI
        this.playBtn.disabled = false;
        this.pauseBtn.disabled = true;
        this.stopBtn.disabled = true;
        this.updateUI();
    }
    
    seek(position) {
        const wasPlaying = this.isPlaying;
        
        // Clear any active timers
        if (this.nextTickTimer) {
            clearTimeout(this.nextTickTimer);
            this.nextTickTimer = null;
        }
        
        // Stop all currently playing sounds
        for (let i = 0; i < this.audioSources.length; i++) {
            if (this.audioSources[i]) {
                try {
                    this.audioSources[i].stop();
                } catch (e) {
                    // Source might have already stopped
                }
                this.audioSources[i] = null;
            }
        }
        
        // Set new position
        this.currentPosition = Math.min(position, this.songLength - 1);
        this.currentRow = 0;
        this.currentTick = 0;
        
        // Update UI
        this.updateUI();
        
        // Resume playback if it was playing
        if (wasPlaying) {
            this.play();
        }
    }
    
    updateUI() {
        // Update position display
        this.currentTimeDisplay.textContent = this.formatPatternPosition(this.currentPosition, this.currentRow);
        
        // Update seek bar
        const progressPercent = (this.currentPosition / this.songLength) * 100;
        this.seekBar.value = progressPercent;
        
        // Update pattern viewer
        this.updatePatternViewer();
    }
    
    formatPatternPosition(pattern, row) {
        return `${pattern}:${row.toString().padStart(2, '0')}`;
    }
    
    updateVisualization() {
        // Clear canvas
        this.visualizerCtx.fillStyle = '#121212';
        this.visualizerCtx.fillRect(0, 0, this.visualizerCanvas.width, this.visualizerCanvas.height);
        
        // Reserve space for different visualizations
        const upperHeight = Math.floor(this.visualizerCanvas.height * 0.6); // Top 60% for waveform
        const lowerHeight = this.visualizerCanvas.height - upperHeight; // Bottom 40% for frequency
        
        // Get analyzer time domain data for waveform
        this.analyser.getByteTimeDomainData(this.dataArray);
        
        // Draw waveform
        this.visualizerCtx.lineWidth = 2;
        this.visualizerCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        this.visualizerCtx.beginPath();
        
        // Calculate x and y coordinates for each data point
        const sliceWidth = this.visualizerCanvas.width / this.analyser.frequencyBinCount;
        let x = 0;
        
        for (let i = 0; i < this.analyser.frequencyBinCount; i++) {
            // Convert data range from 0-255 to 0-1
            const v = this.dataArray[i] / 128.0;
            // Scale to canvas height and invert (y=0 is at the top in canvas)
            const y = (v * upperHeight/2) + upperHeight/4;
            
            if (i === 0) {
                this.visualizerCtx.moveTo(x, y);
            } else {
                this.visualizerCtx.lineTo(x, y);
            }
            
            x += sliceWidth;
        }
        
        this.visualizerCtx.stroke();
        
        // Add a gradient fill under the waveform
        const gradient = this.visualizerCtx.createLinearGradient(0, upperHeight/4, 0, upperHeight);
        gradient.addColorStop(0, 'rgba(29, 185, 84, 0.6)'); // Spotify green with transparency
        gradient.addColorStop(1, 'rgba(29, 185, 84, 0)');
        
        this.visualizerCtx.fillStyle = gradient;
        this.visualizerCtx.lineTo(this.visualizerCanvas.width, upperHeight);
        this.visualizerCtx.lineTo(0, upperHeight);
        this.visualizerCtx.fill();
        
        // Draw separator line
        this.visualizerCtx.strokeStyle = '#333';
        this.visualizerCtx.lineWidth = 1;
        this.visualizerCtx.beginPath();
        this.visualizerCtx.moveTo(0, upperHeight);
        this.visualizerCtx.lineTo(this.visualizerCanvas.width, upperHeight);
        this.visualizerCtx.stroke();
        
        // Get frequency data for the spectrum visualization
        const frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(frequencyData);
        
        // Draw frequency bars
        const frequencyBarCount = 64; // Number of frequency bars to show
        const frequencyBarWidth = this.visualizerCanvas.width / frequencyBarCount;
        const frequencyStep = Math.floor(frequencyData.length / frequencyBarCount);
        
        for (let i = 0; i < frequencyBarCount; i++) {
            // Get average value for this frequency band
            let sum = 0;
            for (let j = 0; j < frequencyStep; j++) {
                sum += frequencyData[i * frequencyStep + j];
            }
            const average = sum / frequencyStep;
            
            // Calculate bar height (0-255 range from analyzer)
            const barHeight = (average / 255) * lowerHeight;
            
            // Color gradient based on frequency
            const hue = (i / frequencyBarCount) * 240; // Blue to red
            this.visualizerCtx.fillStyle = `hsl(${hue}, 100%, 50%)`;
            
            // Draw frequency bar
            this.visualizerCtx.fillRect(
                i * frequencyBarWidth,
                this.visualizerCanvas.height - barHeight,
                frequencyBarWidth - 1,
                barHeight
            );
        }
        
        // Draw playback position
        this.visualizerCtx.fillStyle = '#1db954';
        this.visualizerCtx.font = '12px monospace';
        this.visualizerCtx.fillText(
            `Pattern: ${this.currentPosition}, Row: ${this.currentRow}`,
            10,
            20
        );
    }
    
    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
    
    initializePatternViewer() {
        // Clear existing content
        this.channelHeaders.innerHTML = '';
        this.patternRows.innerHTML = '';
        
        // Create channel headers
        for (let i = 0; i < this.channelCount; i++) {
            const channelHeader = document.createElement('div');
            channelHeader.className = 'channel-header';
            channelHeader.textContent = `CH ${i+1}`;
            this.channelHeaders.appendChild(channelHeader);
        }
        
        // Create rows with placeholders for pattern data
        const visibleRows = 16; // Show 16 rows at a time
        for (let i = 0; i < visibleRows; i++) {
            const row = document.createElement('div');
            row.className = 'pattern-row';
            
            const rowNumber = document.createElement('div');
            rowNumber.className = 'row-number';
            rowNumber.textContent = i.toString().padStart(2, '0');
            row.appendChild(rowNumber);
            
            const rowData = document.createElement('div');
            rowData.className = 'row-data';
            
            for (let j = 0; j < this.channelCount; j++) {
                const channelCell = document.createElement('div');
                channelCell.className = 'pattern-cell';
                channelCell.dataset.channel = j;
                channelCell.dataset.row = i;
                channelCell.textContent = '---';
                rowData.appendChild(channelCell);
            }
            
            row.appendChild(rowData);
            this.patternRows.appendChild(row);
        }
    }
    
    initializeSampleViewer() {
        // Clear existing content
        this.sampleViewer.innerHTML = '';
        
        // Create sample list
        for (let i = 0; i < this.samples.length; i++) {
            if (this.samples[i].length > 2) { // Only show non-empty samples
                const sampleItem = document.createElement('div');
                sampleItem.className = 'sample-item';
                sampleItem.dataset.sampleIndex = i + 1; // 1-based index as in MOD format
                
                const sampleName = this.samples[i].name || `Sample ${i+1}`;
                sampleItem.innerHTML = `
                    <span class="sample-number">${i+1}</span>
                    <span class="sample-name">${sampleName}</span>
                `;
                
                this.sampleViewer.appendChild(sampleItem);
            }
        }
    }
    
    updatePatternViewer() {
        // Get current pattern index
        const patternIndex = this.patternTable[this.currentPosition];
        const pattern = this.patterns[patternIndex];
        
        // Show 8 rows before and 7 rows after current row (total 16 rows)
        const rowsVisible = 16;
        const halfVisible = Math.floor(rowsVisible / 2);
        const startRow = Math.max(0, this.currentRow - halfVisible);
        const endRow = Math.min(63, startRow + rowsVisible - 1);
        
        // Update row numbers and cell data
        const rowElements = this.patternRows.querySelectorAll('.pattern-row');
        
        for (let i = 0; i < rowElements.length; i++) {
            const rowElement = rowElements[i];
            const rowIndex = startRow + i;
            
            // Update row number
            const rowNumberElement = rowElement.querySelector('.row-number');
            rowNumberElement.textContent = rowIndex.toString().padStart(2, '0');
            
            // Highlight current row
            if (rowIndex === this.currentRow) {
                rowElement.classList.add('current-row');
            } else {
                rowElement.classList.remove('current-row');
            }
            
            // Update cell data if row is in range
            if (rowIndex <= 63) {
                const cells = rowElement.querySelectorAll('.pattern-cell');
                
                for (let j = 0; j < cells.length; j++) {
                    const cell = cells[j];
                    
                    if (j < this.channelCount) {
                        const note = pattern[rowIndex][j];
                        
                        // Convert period to note name
                        let noteName = '---';
                        if (note.period !== 0) {
                            noteName = this.periodToNoteName(note.period);
                        }
                        
                        // Format display: Note, Sample, Effect
                        let cellText = noteName;
                        if (note.sampleNumber > 0) {
                            cellText += ` ${note.sampleNumber.toString().padStart(2, '0')}`;
                        } else {
                            cellText += ' --';
                        }
                        
                        if (note.effectCommand !== 0 || note.effectParameter !== 0) {
                            cellText += ` ${note.effectCommand.toString(16).toUpperCase()}${note.effectParameter.toString(16).padStart(2, '0').toUpperCase()}`;
                        } else {
                            cellText += ' ---';
                        }
                        
                        cell.textContent = cellText;
                    }
                }
            }
        }
        
        // Highlight active samples in the sample viewer
        const sampleItems = this.sampleViewer.querySelectorAll('.sample-item');
        sampleItems.forEach(item => item.classList.remove('active'));
        
        // Highlight samples currently playing
        for (let i = 0; i < this.channelCount; i++) {
            const activeNote = this.lastNotesByChannel[i];
            if (activeNote && activeNote.sampleNumber) {
                const activeSample = this.sampleViewer.querySelector(`.sample-item[data-sample-index="${activeNote.sampleNumber}"]`);
                if (activeSample) {
                    activeSample.classList.add('active');
                }
            }
        }
    }
    
    periodToNoteName(period) {
        // Table of period values to note names (Amiga periods)
        const periodTable = {
            856: 'C-1', 808: 'C#1', 762: 'D-1', 720: 'D#1', 678: 'E-1', 640: 'F-1',
            604: 'F#1', 570: 'G-1', 538: 'G#1', 508: 'A-1', 480: 'A#1', 453: 'B-1',
            428: 'C-2', 404: 'C#2', 381: 'D-2', 360: 'D#2', 339: 'E-2', 320: 'F-2',
            302: 'F#2', 285: 'G-2', 269: 'G#2', 254: 'A-2', 240: 'A#2', 226: 'B-2',
            214: 'C-3', 202: 'C#3', 190: 'D-3', 180: 'D#3', 170: 'E-3', 160: 'F-3',
            151: 'F#3', 143: 'G-3', 135: 'G#3', 127: 'A-3', 120: 'A#3', 113: 'B-3'
        };
        
        // Find closest period in the table
        let minDistance = Infinity;
        let closestNote = '---';
        
        for (const [periodStr, noteName] of Object.entries(periodTable)) {
            const tablePeriod = parseInt(periodStr);
            const distance = Math.abs(tablePeriod - period);
            
            if (distance < minDistance) {
                minDistance = distance;
                closestNote = noteName;
            }
        }
        
        return closestNote;
    }
}

// Initialize the player when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const player = new ModPlayer();
}); 