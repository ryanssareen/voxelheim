const PENTATONIC = [261.63, 293.66, 329.63, 392, 440, 523.25];

export class MusicManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private playing = false;
  private enabled = true;
  private volume = 0.5;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private activeNodes: { osc: OscillatorNode; gain: GainNode }[] = [];

  init(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.volume * 0.3;
    this.masterGain.connect(this.ctx.destination);
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
        this.volume * 0.3,
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
    this.scheduleNextPhrase(1);
  }

  stop(): void {
    this.playing = false;
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    for (const node of this.activeNodes) {
      try {
        node.osc.stop();
      } catch {}
    }
    this.activeNodes = [];
  }

  private scheduleNextPhrase(delaySeconds: number): void {
    if (!this.playing) return;
    this.timeoutId = setTimeout(() => {
      if (this.playing) this.playAmbientPhrase();
    }, delaySeconds * 1000);
  }

  private playNote(
    frequency: number,
    duration: number,
    delay: number,
    type: OscillatorType
  ): void {
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.value = frequency;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.1);
    gain.gain.setValueAtTime(0.15, now + duration - 0.3);
    gain.gain.linearRampToValueAtTime(0, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    const reverbGain = this.ctx.createGain();
    const reverbDelay = this.ctx.createDelay();
    reverbDelay.delayTime.value = 0.15;
    reverbGain.gain.value = 0.06;

    osc.connect(reverbDelay);
    reverbDelay.connect(reverbGain);
    reverbGain.connect(this.masterGain);

    const entry = { osc, gain };
    this.activeNodes.push(entry);

    osc.start(now);
    osc.stop(now + duration + 0.05);
    osc.onended = () => {
      const idx = this.activeNodes.indexOf(entry);
      if (idx !== -1) this.activeNodes.splice(idx, 1);
      try {
        gain.disconnect();
        reverbGain.disconnect();
        reverbDelay.disconnect();
      } catch {}
    };
  }

  private playAmbientPhrase(): void {
    if (!this.playing) return;

    const noteCount = 3 + Math.floor(Math.random() * 3);
    let offset = 0;

    for (let i = 0; i < noteCount; i++) {
      const freq = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
      const duration = 0.5 + Math.random() * 1.5;
      const type: OscillatorType = Math.random() < 0.5 ? "sine" : "triangle";

      this.playNote(freq, duration, offset, type);
      offset += 0.3 + Math.random() * 1.2;
    }

    const pauseAfter = 4 + Math.random() * 6;
    this.scheduleNextPhrase(offset + pauseAfter);
  }

  dispose(): void {
    this.stop();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.masterGain = null;
  }
}
