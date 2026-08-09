// InkScroll Audio Engine - Ambient Soundscapes & Action SFX
class InkAudioEngine {
  constructor() {
    this.audioContext = null;
    this.isMuted = false;
    this.volume = 0.7;
    this.currentAmbient = null;

    // Procedural sound generators via Web Audio API when external assets load
    this.rainOsc = null;
    this.gainNode = null;
  }

  init() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
    } catch (e) {
      console.warn('Web Audio API not supported');
    }
  }

  // Play ambient atmospheric soundscape based on chapter mood
  playAmbient(mood = 'action') {
    if (this.isMuted) return;
    this.stopAmbient();

    if (!this.audioContext) this.init();
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    // Procedural White Noise Rain generator if Web Audio available
    if (this.audioContext) {
      const bufferSize = this.audioContext.sampleRate * 2;
      const noiseBuffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = this.audioContext.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      // Filter for rain sound effect
      const filter = this.audioContext.createBiquadFilter();
      filter.type = mood === 'dramatic' ? 'lowpass' : 'bandpass';
      filter.frequency.value = mood === 'dramatic' ? 400 : 800;

      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0.08 * this.volume;

      whiteNoise.connect(filter);
      filter.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

      whiteNoise.start();
      this.rainOsc = whiteNoise;
    }
  }

  stopAmbient() {
    if (this.rainOsc) {
      try { this.rainOsc.stop(); } catch (e) {}
      this.rainOsc = null;
    }
  }

  // Phase 4a: Ambient Crossfade between moods
  crossfadeAmbient(nextMood = 'action') {
    if (this.isMuted) return;
    if (!this.audioContext) this.init();
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    if (this.gainNode && this.audioContext) {
      // Fade out current gain over 1.5s
      const now = this.audioContext.currentTime;
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
      this.gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

      setTimeout(() => {
        this.stopAmbient();
        this.playAmbient(nextMood);
      }, 1500);
    } else {
      this.playAmbient(nextMood);
    }
  }

  // Phase 4b: Soft Page-Turn Paper Foley (Cross-page transitions)
  playPageTurnFoley() {
    if (this.isMuted || !this.audioContext) return;
    try {
      const bufferSize = this.audioContext.sampleRate * 0.2; // 200ms
      const noiseBuffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = this.audioContext.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const filter = this.audioContext.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1200;
      filter.Q.value = 1.5;

      const gain = this.audioContext.createGain();
      const now = this.audioContext.currentTime;
      gain.gain.setValueAtTime(0.12 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.audioContext.destination);

      whiteNoise.start(now);
    } catch (e) {}
  }

  // Play panel transition swoosh / impact SFX
  playPanelTransition() {
    if (this.isMuted || !this.audioContext) return;
    try {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, this.audioContext.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, this.audioContext.currentTime + 0.15);

      gain.gain.setValueAtTime(0.15 * this.volume, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(this.audioContext.destination);

      osc.start();
      osc.stop(this.audioContext.currentTime + 0.15);
    } catch (e) {}
  }

  // Play dramatic impact sound effect for Action / Dramatic scenes
  playImpactSFX() {
    if (this.isMuted || !this.audioContext) return;
    try {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(90, this.audioContext.currentTime);
      osc.frequency.exponentialRampToValueAtTime(20, this.audioContext.currentTime + 0.35);

      gain.gain.setValueAtTime(0.35 * this.volume, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(this.audioContext.destination);

      osc.start();
      osc.stop(this.audioContext.currentTime + 0.35);
    } catch (e) {}
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.gainNode) {
      this.gainNode.gain.value = 0.08 * this.volume;
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopAmbient();
    } else {
      const mood = window.immersiveReader?.chapter?.metadata?.mood || 'action';
      this.playAmbient(mood);
    }
    return this.isMuted;
  }
}

window.inkAudio = new InkAudioEngine();
