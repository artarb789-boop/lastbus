/**
 * Сцена боя: создаётся один раз на бой и дальше только обновляется,
 * поэтому анимации (дорога, покачивание, вспышки) идут непрерывно.
 */
import { bandOf, isLeaking, type CombatState, type RangeBand, type RunState } from "../../core";
import { busSprite, enemyLook, playerLook } from "../art/buses";
import { art, type ArtImage } from "../art/images";
import { spriteSize, spriteUrl, type Sprite } from "../art/pixel";
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

/**
 * Точки крепления оружия на сгенерированном автобусе игрока, в игровых пикселях от левого верхнего угла.
 * Оружие ставится серединой нижнего края в эту точку. Правый борт не виден — его оружие рисуется за корпусом.
 */
export function mountPoint(slot: string, w: number): { x: number; y: number; behind: boolean; flip: boolean } | null {
  switch (slot) {
    case "roof":
      return { x: Math.round(w / 2), y: 4, behind: false, flip: false };
    case "front":
      return { x: w - 2, y: 18, behind: false, flip: false };
    case "rear":
      return { x: 2, y: 18, behind: false, flip: true };
    case "sideL1":
      return { x: Math.round(w * 0.72), y: 13, behind: false, flip: false };
    case "sideL2":
      return { x: Math.round(w * 0.38), y: 13, behind: false, flip: false };
    case "sideR1":
      return { x: Math.round(w * 0.78), y: 9, behind: true, flip: false };
    case "sideR2":
      return { x: Math.round(w * 0.44), y: 9, behind: true, flip: false };
    default:
      return null;
  }
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
        <g class="mounts back"></g>
        <image class="px" x="0" y="0"/>
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

  /** Оружие игрока, у которого есть утверждённый спрайт: что и куда ставить. */
  private mountList(store: Store): { slot: string; img: ArtImage }[] {
    const out: { slot: string; img: ArtImage }[] = [];
    for (const [slot, inst] of Object.entries(store.state.equipment)) {
      if (!inst || inst.durability <= 0) continue;
      const img = art(`weapons/${inst.itemId}.png`);
      if (img) out.push({ slot, img });
    }
    return out;
  }

  private setMounts(side: Side, list: { slot: string; img: ArtImage }[]): void {
    const key = list.map((m) => `${m.slot}:${m.img.url}`).join("|") + `@${side.width}`;
    if (key === side.mounts) return;
    side.mounts = key;
    const w = side.width / SCALE;
    let back = "";
    let front = "";
    for (const { slot, img } of list) {
      const p = mountPoint(slot, w);
      if (!p) continue;
      const x = (p.x - img.w / 2) * SCALE;
      const y = (p.y - img.h) * SCALE;
      const flip = p.flip ? ` transform="translate(${2 * x + img.w * SCALE},0) scale(-1,1)"` : "";
      const tag = `<image class="px" href="${img.url}" x="${x}" y="${y}" width="${img.w * SCALE}" height="${img.h * SCALE}"${flip}/>`;
      if (p.behind) back += tag;
      else front += tag;
    }
    side.mountsBack.innerHTML = back;
    side.mountsFront.innerHTML = front;
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

    // Сгенерированный автобус игрока рисуется без оружия, оружие ставится поверх по точкам крепления.
    const playerArt = art("buses/bus_city.png");
    this.setLook(this.player, playerArt ?? fromSprite(busSprite(playerLook(state, content))));
    this.setMounts(this.player, playerArt ? this.mountList(store) : []);
    this.setLook(this.enemy, art(`buses/${c.enemy.enemyId}.png`) ?? fromSprite(busSprite(enemyLook(c.enemy.enemyId))));

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

    if (!fresh) this.effects(state, c, enemyX);
    this.prev = {
      playerHull: state.hull.hp,
      enemyHull: c.enemy.hull.hp,
      playerCharges: c.weapons.map((w) => w.charge),
      enemyCharges: c.enemy.weapons.map((w) => w.charge),
    };
  }

  /** Вспышки выстрелов и попаданий по разнице с прошлым кадром. */
  private effects(state: RunState, c: CombatState, enemyX: number): void {
    const fired = (now: number[], before: number[]) => now.some((ch, i) => ch === 0 && (before[i] ?? 0) > 1);
    if (fired(c.weapons.map((w) => w.charge), this.prev.playerCharges)) this.pulse(this.player.muzzle, "flash", 160);
    if (fired(c.enemy.weapons.map((w) => w.charge), this.prev.enemyCharges)) this.pulse(this.enemy.muzzle, "flash", 160);
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
