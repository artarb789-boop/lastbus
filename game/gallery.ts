/**
 * Витрина картинок: все ассеты из каталога, их статус в манифесте и вид в игре (×1 и рабочий масштаб)
 * рядом с тем, что сейчас рисует код. Черновики показываются всегда — витрина для проверки.
 * Открывается по адресу /gallery.html на dev-сервере.
 */
import { busSprite, enemyLook, PLAYER_LOOK } from "./art/buses";
import { artCatalog, sizeLabel, sizeOk, type ArtCategory, type ArtSpec } from "./art/catalog";
import { fileUrl, manifest } from "./art/images";
import { personSprite } from "./art/people";
import { spriteUrl } from "./art/pixel";
import { loadBrowserContent } from "./content";
import { mountPoint } from "./ui/scene";
import { NODE, RES } from "./ui/text";

const content = loadBrowserContent();
const catalog = artCatalog(content);
const root = document.getElementById("gallery")!;

const TITLES: Record<ArtCategory, string> = {
  buses: "Автобусы",
  weapons: "Оружие на корпусе",
  items: "Иконки предметов",
  people: "Пассажиры",
  drivers: "Водители",
  map: "Иконки карты",
  resources: "Иконки ресурсов",
  events: "Иллюстрации событий",
  shops: "Вывески магазинов",
  scene: "Слои сцены боя",
};

/** Рабочий масштаб в игре. */
const SCALE: Record<ArtCategory, number> = {
  buses: 3,
  weapons: 3,
  items: 2,
  people: 3,
  drivers: 3,
  map: 2,
  resources: 2,
  events: 2,
  shops: 3,
  scene: 1,
};

let filter: "all" | "missing" | "draft" | "approved" | "rejected" = "all";
let priority = 0;

function img(url: string, w: number, h: number, k: number): string {
  return `<img class="px" src="${url}" width="${w * k}" height="${h * k}" alt="">`;
}

/** Что сейчас рисует игра вместо картинки. */
function fallback(spec: ArtSpec): string {
  const [dir, file] = spec.path.split("/") as [string, string];
  const id = file.replace(/\.png$/, "");
  if (dir === "buses" && !id.endsWith("_wreck")) {
    const s = busSprite(id === "bus_city" ? PLAYER_LOOK : enemyLook(id));
    return img(spriteUrl(s), Math.max(...s.rows.map((r) => r.length)), s.rows.length, 3);
  }
  if (dir === "people") return img(spriteUrl(personSprite(3, id.includes("wounded"))), 7, 9, 3);
  if (dir === "map") return `<span style="font-size:24px">${NODE[id as keyof typeof NODE]?.icon ?? "—"}</span>`;
  if (dir === "resources") return `<span style="font-size:20px">${RES[id as keyof typeof RES]?.icon ?? "—"}</span>`;
  return '<span class="muted">—</span>';
}

function status(spec: ArtSpec): { cls: string; text: string; url?: string | undefined; problem?: string | undefined } {
  const entry = manifest[spec.path];
  const url = fileUrl(spec.path);
  if (!entry && !url) return { cls: "missing", text: "нет" };
  if (!entry) return { cls: "bad", text: "нет в манифесте", url };
  if (!url) return { cls: "bad", text: "нет файла" };
  const problem = sizeOk(spec, entry.w, entry.h) ? undefined : `размер ${entry.w}×${entry.h}, нужно ${sizeLabel(spec)}`;
  return { cls: entry.status, text: entry.status, url, problem };
}

function card(spec: ArtSpec): string {
  const st = status(spec);
  const entry = manifest[spec.path];
  const k = SCALE[spec.category];
  const views: string[] = [];
  if (st.url && entry) {
    views.push(`<div class="g-view">${img(st.url, entry.w, entry.h, 1)}×1</div>`);
    if (k > 1) views.push(`<div class="g-view">${img(st.url, entry.w, entry.h, k)}×${k} в игре</div>`);
  }
  views.push(`<div class="g-view">${fallback(spec)}сейчас</div>`);
  const wide = spec.category === "scene" || spec.category === "events" ? "g-wide" : "";
  return `
    <div class="g-card ${wide}">
      <h3>${spec.label}</h3>
      <div class="g-meta">
        <span class="g-status ${st.problem ? "bad" : st.cls}">${st.problem ? "размер!" : st.text}</span>
        <span>${spec.path}</span><span>${sizeLabel(spec)}</span><span>P${spec.priority}</span>
      </div>
      <div class="g-views">${views.join("")}</div>
      ${st.problem ? `<div class="g-note">${st.problem}</div>` : ""}
      ${entry?.note ? `<div class="g-note">${entry.note}</div>` : ""}
    </div>`;
}

/** Автобус игрока со всем оружием по точкам крепления — проверка, что точки попадают в корпус. */
function assembly(): string {
  const bus = manifest["buses/bus_city.png"];
  const busUrl = fileUrl("buses/bus_city.png");
  if (!bus || !busUrl) return "";
  const k = 3;
  const weapons = Object.values(content.items).filter((i) => i.kind === "weapon");
  const slots = ["roof", "front", "rear", "sideL1", "sideL2", "sideR1", "sideR2"];
  let back = "";
  let front = "";
  slots.forEach((slot, i) => {
    const wpn = weapons[i % weapons.length]!;
    const e = manifest[`weapons/${wpn.id}.png`];
    const url = fileUrl(`weapons/${wpn.id}.png`);
    const p = mountPoint(slot, bus.w);
    if (!p) return;
    const x = (p.x - (e?.w ?? 16) / 2) * k;
    const y = (p.y - (e?.h ?? 10)) * k;
    const tag =
      e && url
        ? `<image class="px" href="${url}" x="${x}" y="${y}" width="${e.w * k}" height="${e.h * k}"${p.flip ? ` transform="translate(${2 * x + e.w * k},0) scale(-1,1)"` : ""}/>`
        : `<rect x="${x}" y="${y}" width="${16 * k}" height="${10 * k}" fill="none" stroke="#ff4fd8" stroke-dasharray="4 3"/>`;
    if (p.behind) back += tag;
    else front += tag;
  });
  const pad = 40;
  return `
    <section class="g-section">
      <h2>Сборка: автобус игрока с оружием</h2>
      <p class="muted">Оружие ставится серединой нижнего края в точки крепления. Розовая рамка — у оружия ещё нет картинки.</p>
      <svg viewBox="${-pad} ${-pad} ${bus.w * k + 2 * pad} ${bus.h * k + 2 * pad}" width="${bus.w * k + 2 * pad}" style="max-width:100%;background:#2d3038;border-radius:8px">
        ${back}<image class="px" href="${busUrl}" width="${bus.w * k}" height="${bus.h * k}"/>${front}
      </svg>
    </section>`;
}

function render(): void {
  const visible = catalog.filter((s) => {
    if (priority && s.priority !== priority) return false;
    if (filter === "all") return true;
    const st = status(s).cls;
    return filter === "missing" ? st === "missing" || st === "bad" : st === filter;
  });
  const count = (cls: string) => catalog.filter((s) => status(s).cls === cls).length;
  const btn = (kind: string, value: string, label: string, on: boolean) =>
    `<button data-${kind}="${value}" class="${on ? "on" : ""}">${label}</button>`;
  const groups = (Object.keys(TITLES) as ArtCategory[])
    .map((cat) => {
      const specs = visible.filter((s) => s.category === cat);
      if (specs.length === 0) return "";
      return `<section class="g-section"><h2>${TITLES[cat]}</h2><div class="g-grid">${specs.map(card).join("")}</div></section>`;
    })
    .join("");
  root.innerHTML = `
    <div class="g-head">
      <h1>Витрина картинок</h1>
      <span class="muted">принято ${count("approved")} · черновиков ${count("draft")} · отклонено ${count("rejected")} · нет ${count("missing")} · всего ${catalog.length}</span>
    </div>
    <p class="muted">Ассеты из <code>assets/img/</code> по каталогу <code>game/art/catalog.ts</code>. В игре показываются только approved; игра с черновиками — <a href="./index.html?art=draft">index.html?art=draft</a>.</p>
    <div class="g-filters">
      ${btn("filter", "all", "Все", filter === "all")}
      ${btn("filter", "missing", "Нет", filter === "missing")}
      ${btn("filter", "draft", "Черновики", filter === "draft")}
      ${btn("filter", "approved", "Приняты", filter === "approved")}
      ${btn("filter", "rejected", "Отклонены", filter === "rejected")}
      <span class="muted">·</span>
      ${btn("priority", "0", "Любой приоритет", priority === 0)}
      ${btn("priority", "1", "P1", priority === 1)}
      ${btn("priority", "2", "P2", priority === 2)}
      ${btn("priority", "3", "P3", priority === 3)}
    </div>
    ${assembly()}
    ${groups || '<p class="muted">Ничего не подходит под фильтр.</p>'}`;
}

root.addEventListener("click", (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-filter],[data-priority]");
  if (!el) return;
  if (el.dataset.filter) filter = el.dataset.filter as typeof filter;
  if (el.dataset.priority) priority = Number(el.dataset.priority);
  render();
});

render();
