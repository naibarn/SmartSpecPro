/**
 * Web Audio API Real-time Sidechain Ducking & Multi-track Audio Engine
 * High-performance audio mixing with envelope detection for voice vs BGM ducking.
 */

export interface TrackAudioState {
  trackId: string;
  volume: number; // 0.0 - 2.0
  muted: boolean;
  solo: boolean;
}

export interface DuckingParameters {
  enabled: boolean;
  thresholdDb: number;   // e.g. -28 dB
  attenuationDb: number; // e.g. -16 dB
  attackMs: number;      // e.g. 40 ms
  releaseMs: number;     // e.g. 350 ms
}

export class AudioDuckingEngine {
  private ctx: AudioContext | null = null;
  private voiceGainNode: GainNode | null = null;
  private musicGainNode: GainNode | null = null;
  private musicDuckerNode: GainNode | null = null;
  private voiceAnalyser: AnalyserNode | null = null;
  private isDuckingActive = false;
  private pollIntervalId: number | null = null;

  public duckingConfig: DuckingParameters = {
    enabled: true,
    thresholdDb: -28,
    attenuationDb: -16,
    attackMs: 40,
    releaseMs: 350,
  };

  public init(audioContext?: AudioContext): AudioContext {
    if (!this.ctx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = audioContext || new AudioCtxClass();

      // Master voice path
      this.voiceGainNode = this.ctx.createGain();
      this.voiceAnalyser = this.ctx.createAnalyser();
      this.voiceAnalyser.fftSize = 512;
      this.voiceAnalyser.smoothingTimeConstant = 0.3;
      this.voiceGainNode.connect(this.voiceAnalyser);
      this.voiceAnalyser.connect(this.ctx.destination);

      // Music path with sidechain ducker
      this.musicGainNode = this.ctx.createGain();
      this.musicDuckerNode = this.ctx.createGain();
      this.musicGainNode.connect(this.musicDuckerNode);
      this.musicDuckerNode.connect(this.ctx.destination);

      this.startEnvelopeFollower();
    }
    return this.ctx;
  }

  public async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch (err) {
        console.warn("Could not resume AudioContext:", err);
      }
    }
  }

  public setVoiceVolume(volume: number, muted = false) {
    if (!this.voiceGainNode || !this.ctx) return;
    const target = muted ? 0 : Math.max(0, Math.min(2.0, volume));
    this.voiceGainNode.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
  }

  public setMusicVolume(volume: number, muted = false) {
    if (!this.musicGainNode || !this.ctx) return;
    const target = muted ? 0 : Math.max(0, Math.min(2.0, volume));
    this.musicGainNode.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
  }

  public setDuckingEnabled(enabled: boolean) {
    this.duckingConfig.enabled = enabled;
    if (!enabled && this.musicDuckerNode && this.ctx) {
      this.musicDuckerNode.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.05);
      this.isDuckingActive = false;
    }
  }

  public getVoiceInputNode(): GainNode | null {
    return this.voiceGainNode;
  }

  public getMusicInputNode(): GainNode | null {
    return this.musicGainNode;
  }

  public getIsDuckingActive(): boolean {
    return this.isDuckingActive;
  }

  private startEnvelopeFollower() {
    if (this.pollIntervalId) return;

    const buffer = new Float32Array(512);

    this.pollIntervalId = window.setInterval(() => {
      if (!this.duckingConfig.enabled || !this.voiceAnalyser || !this.musicDuckerNode || !this.ctx) {
        return;
      }

      this.voiceAnalyser.getFloatTimeDomainData(buffer);

      // Calculate RMS power of voice
      let sumSq = 0;
      for (let i = 0; i < buffer.length; i++) {
        sumSq += buffer[i] * buffer[i];
      }
      const rms = Math.sqrt(sumSq / buffer.length);
      const rmsDb = rms > 0.00001 ? 20 * Math.log10(rms) : -100;

      const now = this.ctx.currentTime;
      const targetGainLinear = Math.pow(10, this.duckingConfig.attenuationDb / 20);

      if (rmsDb > this.duckingConfig.thresholdDb) {
        // Voice is active -> Duck music down smoothly (Attack)
        if (!this.isDuckingActive) {
          this.isDuckingActive = true;
          this.musicDuckerNode.gain.setTargetAtTime(
            targetGainLinear,
            now,
            this.duckingConfig.attackMs / 1000,
          );
        }
      } else {
        // Voice is quiet -> Restore music gain smoothly (Release)
        if (this.isDuckingActive) {
          this.isDuckingActive = false;
          this.musicDuckerNode.gain.setTargetAtTime(
            1.0,
            now,
            this.duckingConfig.releaseMs / 1000,
          );
        }
      }
    }, 40); // 25 Hz poll rate for responsive envelope tracking
  }

  public dispose() {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
    if (this.ctx && this.ctx.state !== "closed") {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
