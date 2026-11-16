/**
 * Сцена боя: создаётся один раз на бой и дальше только обновляется,
 * поэтому анимации (дорога, покачивание, вспышки) идут непрерывно.
 */
import { bandOf, isLeaking, type CombatState, type RangeBand, type RunState } from "../../core";
import { busSprite, enemyLook, playerLook } from "../art/buses";
import { art, type ArtImage } from "../art/images";
import { spriteSize, spriteUrl, type Sprite } from "../art/pixel";
import { enemyMountSlots, mountPoint, weaponSprite } from "../art/weapons";
import type { Store } from "../store";

const SVG_NS = "http://www.w3.org/2000/svg";
const W = 1000;
const H = 210;
const SCALE = 3;
const BASE_Y = 100;
const PLAYER_X = 40;
const ENEMY_X0 = 290;
const ENEMY_STEP = 150;
/** Высота автобуса в игровых пикселях: по ней выравниваются колёса у картинок другой высоты. */
const BUS_H = 24;
const BAND_LABEL: Record<RangeBand, string> = { contact: "вплотную", near: "близко", mid: "средняя", far: "далеко" };

function dunePath(y: number, amp: number, seed: number): string {
  // Две одинаковые половины по 1000, чтобы прокрутка на −1000 была бесшовной.
  let d = `M0 ${H} L0 ${y}`;
  for (let half = 0; half < 2; half++) {
    for (let x = 0; x <= 1000; x += 50) {
      const yy = y - Math.abs(Math.sin((x + seed) / 130)) * amp - Math.abs(Math.sin((x + seed) / 47)) * amp * 0.3;
      d += ` L${half * 1000 + x} ${yy.toFixed(1)}`;
    }
  }
  return d + ` L2000 ${H} Z`;
}

function fromSprite(s: Sprite): ArtImage {
  const { w, h } = spriteSize(s);
  return { url: spriteUrl(s), w, h };
}


/** Небо, дюны и дорога: сгенерированные слои, если утверждены, иначе векторные. */
function backdrop(): string {
  const img = (a: ArtImage, x: number) =>
    `<image class="px" href="${a.url}" x="${x}" y="0" width="${a.w * SCALE}" height="${a.h * SCALE}" preserveAspectRatio="none"/>`;
  const tiles = (a: ArtImage) => img(a, 0) + img(a, 1000);
  const sky = art("scene/sky.png");
  const far = art("scene/dunes_far.png");
  const near = art("scene/dunes_near.png");
  const road = art("scene/road.png");
  return [
    sky ? img(sky, 0) : `<rect width="${W}" height="${H}" fill="url(#sky)"/><circle cx="820" cy="70" r="34" fill="#f6d68b" opacity="0.85"/>`,
    far ? `<g class="dunes far">${tiles(far)}</g>` : `<g class="dunes far"><path d="${dunePath(120, 30, 0)}" fill="#7a4a3a"/></g>`,
    near ? `<g class="dunes near">${tiles(near)}</g>` : `<g class="dunes near"><path d="${dunePath(140, 18, 300)}" fill="#a8683f"/></g>`,
    road
      ? `<g class="roadlayer">${tiles(road)}</g>`
      : `<rect x="0" y="160" width="${W}" height="50" fill="#2d3038"/><rect x="0" y="160" width="${W}" height="3" fill="#4a4f5a"/><line class="lane" x1="0" y1="186" x2="${W + 60}" y2="186"/>`,
  ].join("");
}

/** Картинка оружия: сгенерированная, если утверждена, иначе спрайт кода. */
function weaponImage(itemId: string): ArtImage | null {
  const generated = art(`weapons/${itemId}.png`);
  if (generated) return generated;
  const s = weaponSprite(itemId);
  return s ? fromSprite(s) : null;
}

interface Mount {
  slot: string;
  img: ArtImage;
  broken: boolean;
}

interface Side {
  root: SVGGElement;
  hit: SVGGElement;
  image: SVGImageElement;
  hp: SVGRectElement;
  smoke: SVGGElement;
  fire: SVGGElement;
  muzzle: SVGCircleElement;
  mountsBack: SVGGElement;
  mountsFront: SVGGElement;
  width: number;
  look: string;
  mounts: string;
  /** Где у оружия в каждом слоте вспыхивает выстрел, в координатах автобуса. */
  barrels: Map<string, { x: number; y: number }>;
}

export class CombatScene {
  readonly el: SVGSVGElement;
  private player: Side;
  private enemy: Side;
  private tether: SVGLineElement;
  private bands: SVGRectElement[] = [];
  private combat: CombatState | null = null;
  private prev = { playerHull: 0, enemyHull: 0, playerCharges: [] as number[], enemyCharges: [] as number[] };

  constructor() {
    const el = document.createElementNS(SVG_NS, "svg");
    el.setAttribute("viewBox", `0 0 ${W} ${H}`);
    el.setAttribute("class", "scene");
    el.innerHTML = `
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2b2340"/><stop offset="0.6" stop-color="#c46a3c"/><stop offset="1" stop-color="#e9a65a"/>
        </linearGradient>
      </defs>
      ${backdrop()}
      <g class="bands"></g>
      <line class="tether" x1="0" y1="0" x2="0" y2="0"/>
    `;
    this.el = el;
    const bandsG = el.querySelector(".bands")!;
    (["contact", "near", "mid", "far"] as RangeBand[]).forEach((b, i) => {
      const x0 = ENEMY_X0 + Math.max(0, i - 0.5) * ENEMY_STEP;
      const x1 = ENEMY_X0 + Math.min(3, i + 0.5) * ENEMY_STEP;
      const r = document.createElementNS(SVG_NS, "rect");
      r.setAttribute("x", String(x0));
      r.setAttribute("y", "196");
      r.setAttribute("width", String(x1 - x0));
      r.setAttribute("height", "14");
      r.setAttribute("class", "band");
      bandsG.appendChild(r);
      const t = document.createElementNS(SVG_NS, "text");
      t.setAttribute("x", String((x0 + x1) / 2));
      t.setAttribute("y", "207");
      t.setAttribute("class", "band-label");
      t.textContent = BAND_LABEL[b];
      bandsG.appendChild(t);
      this.bands.push(r);
    });
    this.tether = el.querySelector(".tether")!;
    this.player = this.makeSide("player");
    this.enemy = this.makeSide("enemy");
  }

  private makeSide(cls: string): Side {
    const root = document.createElementNS(SVG_NS, "g");
    root.setAttribute("class", `vehicle ${cls}`);
    root.innerHTML = `
      <g class="bob"><g class="hitbox">
        <image class="px" x="0" y="0"/>
        <g class="mounts back"></g>
        <g class="mounts front"></g>
        <g class="smoke"><circle cx="20" cy="10" r="7"/><circle cx="34" cy="4" r="9"/><circle cx="50" cy="0" r="6"/></g>
        <g class="fire"><path d="M0 0 q6 -14 12 0 q-6 6 -12 0z"/></g>
        <circle class="muzzle" r="9"/>
      </g></g>
      <rect class="hpbg" x="0" y="-14" height="6"/>
      <rect class="hp" x="0" y="-14" height="6"/>`;
    this.el.appendChild(root);
    return {
      root,
      hit: root.querySelector(".hitbox")!,
      image: root.querySelector("image")!,
      hp: root.querySelector(".hp")!,
      smoke: root.querySelector(".smoke")!,
      fire: root.querySelector(".fire")!,
      muzzle: root.querySelector(".muzzle")!,
      mountsBack: root.querySelector(".mounts.back")!,
      mountsFront: root.querySelector(".mounts.front")!,
      width: 0,
      look: "",
      mounts: "",
      barrels: new Map(),
    };
  }

  private setLook(side: Side, look: ArtImage): void {
    const { url, w, h } = look;
    if (url === side.look) return;
    side.look = url;
    side.width = w * SCALE;
    side.image.setAttribute("href", url);
    // Колёса на одной линии, даже если картинка выше обычного автобуса.
    side.image.setAttribute("y", String((BUS_H - h) * SCALE));
    side.image.setAttribute("width", String(w * SCALE));
    side.image.setAttribute("height", String(h * SCALE));
    side.root.querySelector(".hpbg")!.setAttribute("width", String(w * SCALE));
    side.smoke.setAttribute("transform", `translate(${w * SCALE * 0.3},${-4})`);
    side.fire.setAttribute("transform", `translate(${w * SCALE * 0.45},${30})`);
    side.muzzle.setAttribute("cx", String(w * SCALE * 0.7));
    side.muzzle.setAttribute("cy", "6");
  }

  /** Оружие игрока по слотам. Сломанное остаётся на месте, но тускнеет. */
  private playerMounts(store: Store): Mount[] {
    const out: Mount[] = [];
    for (const [slot, inst] of Object.entries(store.state.equipment)) {
      if (!inst || store.content.items[inst.itemId]?.kind !== "weapon") continue;
      const img = weaponImage(inst.itemId);
      if (img) out.push({ slot, img, broken: inst.durability <= 0 });
    }
    return out;
  }

  /** Оружие врага, разложенное по креплениям (у врага слотов нет — только список). */
  private enemyMounts(store: Store, c: CombatState): Mount[] {
    const slots = enemyMountSlots(c.enemy.weapons.map((w) => w.itemId), store.content);
    const out: Mount[] = [];
    c.enemy.weapons.forEach((w, i) => {
      const slot = slots[i];
      const img = weaponImage(w.itemId);
      if (slot && img) out.push({ slot, img, broken: w.hp <= 0 || w.disabled });
    });
    return out;
  }

  private setMounts(side: Side, list: Mount[]): void {
    const key = list.map((m) => `${m.slot}:${m.img.url}:${m.broken}`).join("|") + `@${side.width}`;
    if (key === side.mounts) return;
    side.mounts = key;
    const w = side.width / SCALE;
    let back = "";
    let front = "";
    side.barrels.clear();
    for (const { slot, img, broken } of list) {
      const p = mountPoint(slot, w);
      if (!p) continue;
      const x = (p.x - img.w / 2) * SCALE;
      const y = (p.y - img.h) * SCALE;
      // Выстрел — у дальнего от крепления края, чуть выше низа спрайта.
      side.barrels.set(slot, { x: p.flip ? x : x + img.w * SCALE, y: y + (img.h - 3) * SCALE });
      const flip = p.flip ? ` transform="translate(${2 * x + img.w * SCALE},0) scale(-1,1)"` : "";
      const cls = broken ? "px broken" : "px";
      const tag = `<image class="${cls}" href="${img.url}" x="${x}" y="${y}" width="${img.w * SCALE}" height="${img.h * SCALE}"${flip}/>`;
      if (p.far) back += tag;
      else front += tag;
    }
    side.mountsBack.innerHTML = back;
    side.mountsFront.innerHTML = front;
  }

  /** Вспышка выстрела у ствола оружия в слоте (или над крышей, если оружия не видно). */
  private flash(side: Side, slot: string): void {
    const b = side.barrels.get(slot);
    side.muzzle.setAttribute("cx", String(b ? b.x : side.width * 0.7));
    side.muzzle.setAttribute("cy", String(b ? b.y : 6));
    this.pulse(side.muzzle, "flash", 160);
  }

  /** Короткий класс-эффект: добавить и снять через ms. */
  private pulse(el: Element, cls: string, ms: number): void {
    el.classList.remove(cls);
    // Перезапуск CSS-анимации.
    void (el as SVGGraphicsElement).getBBox?.();
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }

  private floatDamage(side: Side, x: number, amount: number): void {
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("class", "dmg");
    t.setAttribute("x", String(x + side.width / 2));
    t.setAttribute("y", String(BASE_Y - 4));
    t.textContent = `−${amount}`;
    this.el.appendChild(t);
    setTimeout(() => t.remove(), 900);
  }

  update(store: Store, paused: boolean): void {
    const { state, content } = store;
    if (state.phase.type !== "combat") return;
    const c = state.phase.combat;
    const fresh = c !== this.combat;
    this.combat = c;

    // Автобус игрока рисуется без оружия, оружие ставится поверх по точкам крепления.
    this.setLook(this.player, art("buses/bus_city.png") ?? fromSprite(busSprite(playerLook(state, content))));
    this.setMounts(this.player, this.playerMounts(store));
    // Сгенерированный враг уже нарисован с оружием; врагу кодом оружие ставится так же, как игроку.
    const enemyArt = art(`buses/${c.enemy.enemyId}.png`);
    this.setLook(this.enemy, enemyArt ?? fromSprite(busSprite(enemyLook(c.enemy.enemyId))));
    this.setMounts(this.enemy, enemyArt ? [] : this.enemyMounts(store, c));

    const enemyX = ENEMY_X0 + c.distance * ENEMY_STEP;
    this.player.root.style.transform = `translate(${PLAYER_X}px, ${BASE_Y}px)`;
    this.enemy.root.style.transform = `translate(${enemyX}px, ${BASE_Y - 6}px)`;
    if (fresh) this.enemy.root.classList.add("no-anim");
    else this.enemy.root.classList.remove("no-anim");

    this.player.hp.setAttribute("width", String((this.player.width * Math.max(0, state.hull.hp)) / state.hull.max));
    this.enemy.hp.setAttribute("width", String((this.enemy.width * Math.max(0, c.enemy.hull.hp)) / c.enemy.hull.max));

    this.player.smoke.classList.toggle("on", state.hull.hp <= state.hull.max / 2);
    this.enemy.smoke.classList.toggle("on", c.enemy.hull.hp <= c.enemy.hull.max / 2);
    this.player.fire.classList.toggle("on", c.status.burning.length > 0 || isLeaking(state));
    this.enemy.fire.classList.toggle("on", c.enemy.status.burning.length > 0);

    const band = bandOf(c.distance);
    this.bands.forEach((r, i) => r.classList.toggle("active", (["contact", "near", "mid", "far"] as RangeBand[])[i] === band));

    const tethered = c.status.tethered > 0 || c.enemy.status.tethered > 0;
    this.tether.classList.toggle("on", tethered);
    this.tether.setAttribute("x1", String(PLAYER_X + this.player.width - 10));
    this.tether.setAttribute("y1", String(BASE_Y + 30));
    this.tether.setAttribute("x2", String(enemyX + 10));
    this.tether.setAttribute("y2", String(BASE_Y + 24));

    this.el.classList.toggle("paused", paused);

    if (!fresh) this.effects(store, c, enemyX);
    this.prev = {
      playerHull: state.hull.hp,
      enemyHull: c.enemy.hull.hp,
      playerCharges: c.weapons.map((w) => w.charge),
      enemyCharges: c.enemy.weapons.map((w) => w.charge),
    };
  }

  /** Вспышки выстрелов и попаданий по разнице с прошлым кадром. */
  private effects(store: Store, c: CombatState, enemyX: number): void {
    const state = store.state;
    const firedIndex = (now: number[], before: number[]) => now.findIndex((ch, i) => ch === 0 && (before[i] ?? 0) > 1);
    const pi = firedIndex(c.weapons.map((w) => w.charge), this.prev.playerCharges);
    if (pi >= 0) this.flash(this.player, c.weapons[pi]!.slotId);
    const ei = firedIndex(c.enemy.weapons.map((w) => w.charge), this.prev.enemyCharges);
    if (ei >= 0) this.flash(this.enemy, enemyMountSlots(c.enemy.weapons.map((w) => w.itemId), store.content)[ei] ?? "");
    const playerLost = this.prev.playerHull - state.hull.hp;
    const enemyLost = this.prev.enemyHull - c.enemy.hull.hp;
    if (playerLost > 0) {
      this.pulse(this.player.hit, "hit", 220);
      this.floatDamage(this.player, PLAYER_X, playerLost);
    }
    if (enemyLost > 0) {
      this.pulse(this.enemy.hit, "hit", 220);
      this.floatDamage(this.enemy, enemyX, enemyLost);
    }
  }
}
