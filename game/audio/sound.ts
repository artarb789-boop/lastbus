/**
 * Звук кодом: всё синтезируется Web Audio на лету, без звуковых файлов — как и пиксель-арт.
 * Звуковой контекст создаётся при первом действии игрока (так требует браузер).
 * Настройки (выключен ли звук, громкость) хранятся в localStorage.
 */

export type SfxName =
  | "mg"
  | "shotgun"
  | "rockets"
  | "harpoon"
  | "flamer"
  | "oil"
  | "ram"
  | "spikes"
  | "hitPlayer"
  | "hitEnemy"
  | "repair"
  | "click"
  | "victory"
  | "defeat"
  | "escape"
  | "coins"
  | "boss";

/** Какой звук у оружия по id предмета. */
export const WEAPON_SFX: Record<string, SfxName> = {
  wpn_mg: "mg",
  wpn_shotgun: "shotgun",
  wpn_rockets: "rockets",
  wpn_harpoon: "harpoon",
  wpn_flamer: "flamer",
  wpn_oil: "oil",
  wpn_ram: "ram",
  wpn_spikes: "spikes",
};

const SETTINGS_KEY = "lastbus.audio";

interface Settings {
  muted: boolean;
  volume: number;
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Settings>;
      return { muted: !!s.muted, volume: typeof s.volume === "number" ? s.volume : 0.6 };
    }
  } catch {
    // Хранилище недоступно — настройки по умолчанию.
  }
  return { muted: false, volume: 0.6 };
}

const settings = loadSettings();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
/** Сколько звуков сыграно — для проверки в браузере. */
export const stats = { played: 0, byName: {} as Record<string, number> };

function save(): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Не страшно: настройка просто не запомнится.
  }
}

export function isMuted(): boolean {
  return settings.muted;
}

export function setMuted(muted: boolean): void {
  settings.muted = muted;
  save();
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : settings.volume, ctx.currentTime, 0.05);
  if (muted) stopEngine();
}

/** Создать контекст по первому действию игрока. Повторные вызовы безопасны. */
export function unlockAudio(): void {
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume();
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = settings.muted ? 0 : settings.volume;
  // Лёгкий компрессор, чтобы залпы не клиппили.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  // Две секунды белого шума — основа выстрелов, ударов и огня.
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

export function audioReady(): boolean {
  return ctx !== null && ctx.state === "running";
}

// ---------- Строительные блоки ----------

/** Выход с панорамой (-1 слева … 1 справа) и громкостью. */
function out(pan: number, gain: number): GainNode {
  const g = ctx!.createGain();
  g.gain.value = gain;
  if (pan !== 0 && "createStereoPanner" in ctx!) {
    const p = ctx!.createStereoPanner();
    p.pan.value = pan;
    g.connect(p).connect(master!);
  } else {
    g.connect(master!);
  }
  return g;
}

/** Огибающая: быстрая атака и экспоненциальное затухание. */
function env(param: AudioParam, t: number, peak: number, attack: number, decay: number): void {
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

/** Пачка шума через фильтр. */
function noise(
  dest: AudioNode,
  t: number,
  dur: number,
  opts: { type?: BiquadFilterType; freq?: number; freqEnd?: number; q?: number; peak?: number; attack?: number },
): void {
  const src = ctx!.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  const f = ctx!.createBiquadFilter();
  f.type = opts.type ?? "bandpass";
  f.frequency.setValueAtTime(opts.freq ?? 1000, t);
  if (opts.freqEnd) f.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + dur);
  f.Q.value = opts.q ?? 1;
  const g = ctx!.createGain();
  env(g.gain, t, opts.peak ?? 1, opts.attack ?? 0.003, dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

/** Тон с огибающей и, по желанию, скольжением частоты. */
function tone(
  dest: AudioNode,
  t: number,
  dur: number,
  opts: { type?: OscillatorType; freq: number; freqEnd?: number; peak?: number; attack?: number; detune?: number },
): void {
  const o = ctx!.createOscillator();
  o.type = opts.type ?? "sine";
  o.frequency.setValueAtTime(opts.freq, t);
  if (opts.freqEnd) o.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + dur);
  if (opts.detune) o.detune.value = opts.detune;
  const g = ctx!.createGain();
  env(g.gain, t, opts.peak ?? 0.5, opts.attack ?? 0.005, dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Металлический удар: несколько негармоничных обертонов. */
function clang(dest: AudioNode, t: number, base: number, dur: number, peak: number): void {
  for (const k of [1, 2.76, 5.4, 8.93]) tone(dest, t, dur / Math.sqrt(k), { type: "triangle", freq: base * k, peak: peak / k });
}

// ---------- Звуки ----------

const RECIPES: Record<SfxName, (dest: AudioNode, t: number) => void> = {
  mg: (d, t) => {
    for (let i = 0; i < 3; i++) {
      noise(d, t + i * 0.075, 0.06, { freq: 1800, q: 0.8, peak: 0.9 });
      tone(d, t + i * 0.075, 0.05, { type: "square", freq: 140, freqEnd: 60, peak: 0.25 });
    }
  },
  shotgun: (d, t) => {
    noise(d, t, 0.32, { type: "lowpass", freq: 3200, freqEnd: 300, peak: 1 });
    tone(d, t, 0.18, { freq: 110, freqEnd: 40, peak: 0.9 });
  },
  rockets: (d, t) => {
    noise(d, t, 0.5, { freq: 400, freqEnd: 2600, q: 2, peak: 0.6, attack: 0.08 });
    noise(d, t + 0.45, 0.6, { type: "lowpass", freq: 900, freqEnd: 120, peak: 1 });
    tone(d, t + 0.45, 0.5, { freq: 70, freqEnd: 30, peak: 1 });
  },
  harpoon: (d, t) => {
    tone(d, t, 0.25, { type: "sawtooth", freq: 420, freqEnd: 140, peak: 0.25 });
    noise(d, t, 0.12, { freq: 3000, q: 3, peak: 0.4 });
    clang(d, t + 0.22, 520, 0.3, 0.3);
  },
  flamer: (d, t) => {
    noise(d, t, 0.7, { type: "lowpass", freq: 700, freqEnd: 1600, peak: 0.8, attack: 0.06 });
    noise(d, t, 0.7, { freq: 300, q: 4, peak: 0.4, attack: 0.1 });
  },
  oil: (d, t) => {
    for (let i = 0; i < 3; i++) tone(d, t + i * 0.12, 0.1, { freq: 180 - i * 30, freqEnd: 90, peak: 0.5 });
    noise(d, t + 0.3, 0.25, { type: "lowpass", freq: 500, peak: 0.4 });
  },
  ram: (d, t) => {
    noise(d, t, 0.45, { type: "lowpass", freq: 1200, freqEnd: 200, peak: 1 });
    tone(d, t, 0.35, { freq: 80, freqEnd: 35, peak: 1 });
    clang(d, t + 0.02, 160, 0.6, 0.5);
    noise(d, t + 0.1, 0.5, { freq: 2600, q: 6, peak: 0.25 }); // скрежет
  },
  spikes: (d, t) => {
    noise(d, t, 0.3, { freq: 3500, q: 5, peak: 0.5 });
    clang(d, t, 900, 0.25, 0.25);
  },
  hitPlayer: (d, t) => {
    clang(d, t, 210, 0.55, 0.7);
    noise(d, t, 0.15, { type: "lowpass", freq: 2000, peak: 0.6 });
  },
  hitEnemy: (d, t) => {
    noise(d, t, 0.18, { type: "lowpass", freq: 900, freqEnd: 200, peak: 0.7 });
    tone(d, t, 0.12, { freq: 120, freqEnd: 60, peak: 0.5 });
  },
  repair: (d, t) => {
    for (let i = 0; i < 4; i++) {
      noise(d, t + i * 0.07, 0.03, { freq: 4000, q: 8, peak: 0.5 });
      tone(d, t + i * 0.07, 0.03, { type: "square", freq: 900, peak: 0.08 });
    }
    clang(d, t + 0.3, 700, 0.25, 0.2);
  },
  click: (d, t) => {
    tone(d, t, 0.04, { type: "square", freq: 660, peak: 0.08 });
  },
  victory: (d, t) => {
    [392, 494, 587, 784].forEach((f, i) => tone(d, t + i * 0.12, 0.35, { type: "triangle", freq: f, peak: 0.35 }));
  },
  defeat: (d, t) => {
    [392, 349, 311, 233].forEach((f, i) => tone(d, t + i * 0.18, 0.5, { type: "triangle", freq: f, peak: 0.35 }));
  },
  escape: (d, t) => {
    tone(d, t, 0.6, { type: "sawtooth", freq: 90, freqEnd: 220, peak: 0.2, attack: 0.05 });
    noise(d, t, 0.6, { freq: 600, freqEnd: 1800, q: 1, peak: 0.3, attack: 0.1 });
  },
  coins: (d, t) => {
    [1320, 1760].forEach((f, i) => tone(d, t + i * 0.07, 0.15, { type: "square", freq: f, peak: 0.08 }));
  },
  boss: (d, t) => {
    [110, 104, 98].forEach((f, i) => tone(d, t + i * 0.35, 0.6, { type: "sawtooth", freq: f, peak: 0.25, attack: 0.02 }));
    noise(d, t, 1.2, { type: "lowpass", freq: 200, peak: 0.4, attack: 0.3 });
  },
};

export const SFX_NAMES = Object.keys(RECIPES) as SfxName[];

/** Сыграть звук. pan: −1 слева (игрок), 1 справа (враг). */
export function sfx(name: SfxName, opts: { pan?: number; gain?: number; delay?: number } = {}): void {
  if (!ctx || !master || !noiseBuf || settings.muted || ctx.state !== "running") return;
  const dest = out(opts.pan ?? 0, opts.gain ?? 1);
  RECIPES[name](dest, ctx.currentTime + (opts.delay ?? 0));
  stats.played++;
  stats.byName[name] = (stats.byName[name] ?? 0) + 1;
}

// ---------- Мотор ----------

interface Engine {
  osc: OscillatorNode;
  sub: OscillatorNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  filter: BiquadFilterNode;
  gain: GainNode;
}

let engine: Engine | null = null;

/**
 * Гул мотора в бою: тон зависит от манёвра, у сломанного двигателя — чихание (глубокая модуляция).
 * Вызывается на каждой отрисовке боя; без изменений параметры не трогаются.
 */
export function engineHum(on: boolean, opts: { rpm?: number; broken?: boolean; paused?: boolean } = {}): void {
  if (!ctx || !master || settings.muted || ctx.state !== "running") {
    if (!on) stopEngine();
    return;
  }
  if (!on) {
    stopEngine();
    return;
  }
  if (!engine) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    const sub = ctx.createOscillator();
    sub.type = "square";
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 260;
    filter.Q.value = 3;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0;
    lfo.connect(lfoGain).connect(gain.gain);
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain).connect(out(-0.3, 1));
    osc.start();
    sub.start();
    lfo.start();
    engine = { osc, sub, lfo, lfoGain, filter, gain };
  }
  const t = ctx.currentTime;
  const rpm = opts.rpm ?? 1;
  const base = 42 * rpm;
  engine.osc.frequency.setTargetAtTime(base, t, 0.3);
  engine.sub.frequency.setTargetAtTime(base / 2, t, 0.3);
  engine.filter.frequency.setTargetAtTime(200 + 160 * rpm, t, 0.3);
  // Сломанный двигатель «чихает», на паузе гул тише.
  engine.lfo.frequency.setTargetAtTime(opts.broken ? 3 : 7, t, 0.2);
  engine.lfoGain.gain.setTargetAtTime(opts.broken ? 0.05 : 0.008, t, 0.2);
  engine.gain.gain.setTargetAtTime(opts.paused ? 0.025 : 0.06, t, 0.3);
}

function stopEngine(): void {
  if (!engine || !ctx) return;
  const e = engine;
  engine = null;
  e.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
  const stopAt = ctx.currentTime + 0.6;
  e.osc.stop(stopAt);
  e.sub.stop(stopAt);
  e.lfo.stop(stopAt);
}
