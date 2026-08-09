// InkScroll Sound-Reactive SFX Engine (Howler.js & Web Audio Integration)
class InkSFXEngine {
  constructor() {
    this.sfxEnabled = localStorage.getItem('inkscroll_sfx') !== 'false'; // ON by default
    this.audioUnlocked = false;
    this.audioCtx = null;
    this.initAudioContext();
  }

  initAudioContext() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    } catch (err) {
      console.warn('Web Audio API unavailable:', err);
    }
  }

  unlockAudioOnce() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    this.audioUnlocked = true;
  }

  playTransitionSfx(type = 'panelAdvance') {
    if (!this.sfxEnabled) return;
    this.unlockAudioOnce();

    if (!this.audioCtx) this.initAudioContext();
    if (!this.audioCtx) return;

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    try {
      const now = this.audioCtx.currentTime;

      if (type === 'splashReveal' || type === 'fullbleed') {
        // --- Splash Reveal: Deep Impact Boom + Sub-Bass Sweep ---
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(32, now + 0.35);

        gain.gain.setValueAtTime(0.50, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.35);

        // Secondary impact noise
        const bufferSize = Math.floor(this.audioCtx.sampleRate * 0.2);
        const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.05));
        }
        const noise = this.audioCtx.createBufferSource();
        noise.buffer = noiseBuffer;

        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 350;

        const noiseGain = this.audioCtx.createGain();
        noiseGain.gain.setValueAtTime(0.35, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.audioCtx.destination);
        noise.start(now);

      } else {
        // --- Panel Advance: Crisp Washi Swoosh + Pitch Sweep ---
        const rateVar = 0.92 + Math.random() * 0.16; // Random pitch variation
        const baseFreq = 260 * rateVar;

        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.14);

        gain.gain.setValueAtTime(0.38, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.14);

        // High frequency paper shff noise
        const sampleRate = this.audioCtx.sampleRate;
        const numSamples = Math.floor(sampleRate * 0.10);
        const buffer = this.audioCtx.createBuffer(1, numSamples, sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < numSamples; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.025));
        }

        const noise = this.audioCtx.createBufferSource();
        noise.buffer = buffer;

        const bandpass = this.audioCtx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = 1200 * rateVar;
        bandpass.Q.value = 1.5;

        const noiseGain = this.audioCtx.createGain();
        noiseGain.gain.setValueAtTime(0.25, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.10);

        noise.connect(bandpass);
        bandpass.connect(noiseGain);
        noiseGain.connect(this.audioCtx.destination);
        noise.start(now);
      }
    } catch (err) {
      console.warn('SFX synthesis error:', err);
    }
  }

  isSfxEnabled() {
    return this.sfxEnabled;
  }

  toggleSfx() {
    this.sfxEnabled = !this.sfxEnabled;
    localStorage.setItem('inkscroll_sfx', this.sfxEnabled);
    if (this.sfxEnabled) {
      this.playTransitionSfx('panelAdvance'); // Play test sound when turned ON
    }
    return this.sfxEnabled;
  }
}

window.inkSFX = new InkSFXEngine();

// Register global audio unlock on any user click / keypress
['click', 'keydown', 'pointerdown', 'touchstart'].forEach(evtType => {
  window.addEventListener(evtType, () => {
    if (window.inkSFX) window.inkSFX.unlockAudioOnce();
  }, { once: false, passive: true });
});

// Global functions for non-module scripts
window.playTransitionSfx = function(type) {
  if (window.inkSFX) window.inkSFX.playTransitionSfx(type);
};

window.isSfxEnabled = function() {
  return window.inkSFX ? window.inkSFX.isSfxEnabled() : false;
};

window.toggleSfx = function() {
  return window.inkSFX ? window.inkSFX.toggleSfx() : false;
};

window.unlockAudioOnce = function() {
  if (window.inkSFX) window.inkSFX.unlockAudioOnce();
};
