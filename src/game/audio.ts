export class RaceAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private screechGain: GainNode | null = null;
  private screechFilter: BiquadFilterNode | null = null;
  private boostGain: GainNode | null = null;
  private boostFilter: BiquadFilterNode | null = null;
  private muted = false;
  private initialized = false;

  public init(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.35;
      master.connect(ctx.destination);
      this.masterGain = master;

      // Engine synthesizer (dual harmonic oscillators + dynamic lowpass)
      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.value = 65;

      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.value = 130;

      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineFilter.Q.value = 2.5;

      const engineGain = ctx.createGain();
      engineGain.gain.value = 0.0;

      osc1.connect(engineFilter);
      osc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);

      osc1.start();
      osc2.start();

      this.engineOsc1 = osc1;
      this.engineOsc2 = osc2;
      this.engineFilter = engineFilter;
      this.engineGain = engineGain;

      // Noise buffer for tire screech & nitro boost
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      // Tire screech loop
      const screechSrc = ctx.createBufferSource();
      screechSrc.buffer = noiseBuffer;
      screechSrc.loop = true;

      const screechFilter = ctx.createBiquadFilter();
      screechFilter.type = 'bandpass';
      screechFilter.frequency.value = 1650;
      screechFilter.Q.value = 5.5;

      const screechGain = ctx.createGain();
      screechGain.gain.value = 0;

      screechSrc.connect(screechFilter);
      screechFilter.connect(screechGain);
      screechGain.connect(master);
      screechSrc.start();

      this.screechFilter = screechFilter;
      this.screechGain = screechGain;

      // Nitro boost jet loop
      const boostSrc = ctx.createBufferSource();
      boostSrc.buffer = noiseBuffer;
      boostSrc.loop = true;

      const boostFilter = ctx.createBiquadFilter();
      boostFilter.type = 'lowpass';
      boostFilter.frequency.value = 680;
      boostFilter.Q.value = 1.8;

      const boostGain = ctx.createGain();
      boostGain.gain.value = 0;

      boostSrc.connect(boostFilter);
      boostFilter.connect(boostGain);
      boostGain.connect(master);
      boostSrc.start();

      this.boostFilter = boostFilter;
      this.boostGain = boostGain;

      this.initialized = true;
    } catch {
      // Audio unavailable
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.35, this.ctx.currentTime, 0.04);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public updateTelemetry(
    active: boolean,
    rpmNorm: number,
    speedNorm: number,
    driftIntensity: number,
    isBoosting: boolean
  ): void {
    if (!this.initialized || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    if (!active) {
      this.engineGain?.gain.setTargetAtTime(0, now, 0.08);
      this.screechGain?.gain.setTargetAtTime(0, now, 0.05);
      this.boostGain?.gain.setTargetAtTime(0, now, 0.05);
      return;
    }

    const baseFreq = 52 + rpmNorm * 135 + (isBoosting ? 24 : 0);
    this.engineOsc1?.frequency.setTargetAtTime(baseFreq, now, 0.04);
    this.engineOsc2?.frequency.setTargetAtTime(baseFreq * 1.98, now, 0.04);
    this.engineFilter?.frequency.setTargetAtTime(280 + rpmNorm * 1150 + (isBoosting ? 400 : 0), now, 0.05);
    this.engineGain?.gain.setTargetAtTime(0.14 + speedNorm * 0.14, now, 0.06);

    const screechTarget = Math.min(0.22, Math.max(0, driftIntensity * 0.22));
    this.screechGain?.gain.setTargetAtTime(screechTarget, now, 0.04);
    this.screechFilter?.frequency.setTargetAtTime(1400 + speedNorm * 550, now, 0.05);

    this.boostGain?.gain.setTargetAtTime(isBoosting ? 0.26 : 0, now, 0.06);
    this.boostFilter?.frequency.setTargetAtTime(isBoosting ? 950 : 400, now, 0.06);
  }

  public playCountdownTone(isGo: boolean): void {
    this.init();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isGo ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isGo ? 880 : 440, now);
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isGo ? 0.42 : 0.2));
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + (isGo ? 0.45 : 0.22));
  }

  public playLapChime(isFinal: boolean): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = isFinal ? [523.25, 659.25, 783.99, 1046.5] : [587.33, 880];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const t = now + idx * 0.08;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  }

  public playCollision(intensity = 0.6): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + 0.16);
    gain.gain.setValueAtTime(Math.min(0.4, intensity * 0.38), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public dispose(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.initialized = false;
  }
}
