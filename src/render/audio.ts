/** Web Audio: sound effects with variation, music with crossfade. Unlocks on first user gesture. */
export class AudioSys {
  ctx?: AudioContext;
  private buffers = new Map<string, AudioBuffer>();
  private sfxGain?: GainNode; private musicGain?: GainNode;
  private music?: { src: AudioBufferSourceNode; gain: GainNode; name: string };
  private pending = new Map<string, Promise<AudioBuffer | undefined>>();
  sfxVolume = 0.8; musicVolume = 0.5;
  private lastPlay = new Map<string, number>();

  private ensure() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = this.sfxVolume; this.sfxGain.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = this.musicVolume; this.musicGain.connect(this.ctx.destination);
  }
  unlock() { this.ensure(); if (this.ctx!.state === 'suspended') this.ctx!.resume(); }
  setVolumes(sfx: number, music: number) { this.sfxVolume = sfx; this.musicVolume = music; if (this.sfxGain) this.sfxGain.gain.value = sfx; if (this.musicGain) this.musicGain.gain.value = music; }

  private async load(url: string): Promise<AudioBuffer | undefined> {
    if (this.buffers.has(url)) return this.buffers.get(url);
    if (this.pending.has(url)) return this.pending.get(url);
    const p = (async () => { try { this.ensure(); const r = await fetch(url); if (!r.ok) return undefined; const ab = await r.arrayBuffer(); const b = await this.ctx!.decodeAudioData(ab); this.buffers.set(url, b); return b; } catch { return undefined; } })();
    this.pending.set(url, p); return p;
  }
  preload(names: string[]) { for (const n of names) this.load(`/audio/sfx/${n}`); }

  /** Play one of several variants: pass base name + count, e.g. sfx('step', 5) picks step0..step4. */
  async sfx(name: string, variants = 1, volume = 1, ext?: string) {
    if (!this.ctx) return;
    const now = performance.now(); if ((this.lastPlay.get(name) ?? 0) > now - 40) return; this.lastPlay.set(name, now);
    const idx = variants > 1 ? Math.floor(Math.random() * variants) : -1;
    const base = idx >= 0 ? name + idx : name;
    const exts = ext ? [ext] : ['ogg', 'wav'];
    let buf: AudioBuffer | undefined;
    for (const e of exts) { buf = await this.load(`/audio/sfx/${base}.${e}`); if (buf) break; }
    if (!buf) return;
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = 0.94 + Math.random() * 0.12;
    const g = this.ctx.createGain(); g.gain.value = volume; src.connect(g); g.connect(this.sfxGain!); src.start();
  }

  async playMusic(name: string, fade = 1.5) {
    if (!this.ctx) return;
    if (this.music?.name === name) return;
    let buf: AudioBuffer | undefined;
    for (const e of ['ogg', 'mp3']) { buf = await this.load(`/audio/music/${name}.${e}`); if (buf) break; }
    if (this.music?.name === name) return;
    const old = this.music;
    if (old) { old.gain.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3); setTimeout(() => { try { old.src.stop(); } catch { } }, fade * 1000 + 100); this.music = undefined; }
    if (!buf) return;
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const g = this.ctx.createGain(); g.gain.value = 0; src.connect(g); g.connect(this.musicGain!); src.start();
    g.gain.setTargetAtTime(1, this.ctx.currentTime, fade / 3);
    this.music = { src, gain: g, name };
  }
  stopMusic(fade = 1.5) { if (!this.ctx || !this.music) return; const old = this.music; old.gain.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3); setTimeout(() => { try { old.src.stop(); } catch { } }, fade * 1000 + 100); this.music = undefined; }
}
