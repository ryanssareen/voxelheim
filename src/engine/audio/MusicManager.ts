const AMBIENT_CHORDS = [
  [261.63, 329.63, 392],    // C major
  [220, 261.63, 329.63],    // A minor
  [246.94, 311.13, 369.99], // B diminished-ish → dreamy
  [196, 246.94, 293.66],    // G major low
  [174.61, 220, 261.63],    // F major low
  [261.63, 311.13, 392],    // C minor-ish
];

export class MusicManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private playing = false;
  private enabled = true;
  private volume = 0.5;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private activeNodes: OscillatorNode[] = [];
  private chordIndex = 0;

  init(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.volume * 0.15;

    this.reverbNode = this.createReverb();
    this.reverbNode.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  private createReverb(): ConvolverNode {
    const ctx = this.ctx!;
    const conv = ctx.createConvolver();
    const rate = ctx.sampleRate;
    const length = rate * 3;
    const impulse = ctx.createBuffer(2, length, rate);

    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
      }
    }
    conv.buffer = impulse;
    return conv;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stop();
    } else if (!this.playing) {
      this.start();
    }
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume / 100));
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        this.volume * 0.15,
        this.ctx!.currentTime,
        0.1
      );
    }
  }

  start(): void {
    if (this.playing || !this.enabled) return;
    if (!this.ctx) this.init();
    if (this.ctx!.state === "suspended") {
      this.ctx!.resume();
    }
    this.playing = true;
    this.scheduleNext(2);
  }

  stop(): void {
    this.playing = false;
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    for (const osc of this.activeNodes) {
      try { osc.stop(); } catch {}
    }
    this.activeNodes = [];
  }

  private scheduleNext(delaySec: number): void {
    if (!this.playing) return;
    this.timeoutId = setTimeout(() => {
      if (this.playing) this.playPad();
    }, delaySec * 1000);
  }

  private playPad(): void {
    if (!this.playing || !this.ctx || !this.masterGain || !this.reverbNode) return;

    const chord = AMBIENT_CHORDS[this.chordIndex % AMBIENT_CHORDS.length];
    this.chordIndex++;

    const now = this.ctx.currentTime;
    const padDuration = 6 + Math.random() * 4;
    const attackTime = 2 + Math.random();
    const releaseTime = 2 + Math.random();

    for (const freq of chord) {
      const detune = (Math.random() - 0.5) * 6;

      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.detune.value = detune;

      const noteGain = this.ctx.createGain();
      noteGain.gain.setValueAtTime(0, now);
      noteGain.gain.linearRampToValueAtTime(0.08, now + attackTime);
      noteGain.gain.setValueAtTime(0.08, now + padDuration - releaseTime);
      noteGain.gain.linearRampToValueAtTime(0, now + padDuration);

      osc.connect(noteGain);
      noteGain.connect(this.reverbNode);
      noteGain.connect(this.masterGain);

      // Add a very quiet second harmonic for warmth
      const osc2 = this.ctx.createOscillator();
      osc2.type = "triangle";
      osc2.frequency.value = freq * 2;
      osc2.detune.value = detune + (Math.random() - 0.5) * 4;

      const harm2Gain = this.ctx.createGain();
      harm2Gain.gain.setValueAtTime(0, now);
      harm2Gain.gain.linearRampToValueAtTime(0.015, now + attackTime);
      harm2Gain.gain.setValueAtTime(0.015, now + padDuration - releaseTime);
      harm2Gain.gain.linearRampToValueAtTime(0, now + padDuration);

      osc2.connect(harm2Gain);
      harm2Gain.connect(this.reverbNode);

      this.activeNodes.push(osc, osc2);

      osc.start(now);
      osc.stop(now + padDuration + 0.1);
      osc2.start(now);
      osc2.stop(now + padDuration + 0.1);

      const cleanup = (o: OscillatorNode) => {
        o.onended = () => {
          const idx = this.activeNodes.indexOf(o);
          if (idx !== -1) this.activeNodes.splice(idx, 1);
          try { noteGain.disconnect(); } catch {}
          try { harm2Gain.disconnect(); } catch {}
        };
      };
      cleanup(osc);
      cleanup(osc2);
    }

    // Occasional single high note melody
    if (Math.random() < 0.4) {
      const melodyDelay = 1 + Math.random() * 3;
      const melodyFreq = chord[Math.floor(Math.random() * chord.length)] * 2;
      const melodyDur = 3 + Math.random() * 2;

      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = melodyFreq;

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, now + melodyDelay);
      g.gain.linearRampToValueAtTime(0.04, now + melodyDelay + 1.5);
      g.gain.linearRampToValueAtTime(0, now + melodyDelay + melodyDur);

      osc.connect(g);
      g.connect(this.reverbNode);

      this.activeNodes.push(osc);
      osc.start(now + melodyDelay);
      osc.stop(now + melodyDelay + melodyDur + 0.1);
      osc.onended = () => {
        const idx = this.activeNodes.indexOf(osc);
        if (idx !== -1) this.activeNodes.splice(idx, 1);
        try { g.disconnect(); } catch {}
      };
    }

    const pauseAfter = padDuration - 2 + Math.random() * 4;
    this.scheduleNext(pauseAfter);
  }

  dispose(): void {
    this.stop();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.masterGain = null;
    this.reverbNode = null;
  }
}
