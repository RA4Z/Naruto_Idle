import { t } from "../i18n/core";
import { radarProjection } from "./map-projection";
import type { Point } from "./navigation";
import type { WorldMap } from "./maps";
export type MinimapState = {
  hero: Point;
  enemies: (Point & { elite: boolean; name: string })[];
  npcs: (Point & { name: string })[];
  portal?: Point;
  target?: Point & { name: string };
  path: Point[];
  auto: boolean;
  view: { x: number; y: number; width: number; height: number };
};
const NS = "http://www.w3.org/2000/svg";
let nextViewport = 0;
const node = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number> = {},
) => {
  const result = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes))
    result.setAttribute(key, String(value));
  return result;
};
/** DOM/SVG overlay moves with the existing canvas into PiP; never adds a second renderer. */
export class Minimap {
  private panel = document.createElement("div");
  private svg = node("svg", {
    viewBox: "0 0 240 240",
    tabindex: 0,
    role: "button",
    "aria-label": t("expansion.minimapControl"),
  });
  private base = node("g");
  private moving = node("g");
  private markersOrigin = { x: 0, y: 0 };
  private caption = document.createElement("p");
  private status = document.createElement("p");
  private projection = radarProjection(1, 1, { x: 0, y: 0 });
  private cursor?: Point;
  private map?: WorldMap;
  private state?: MinimapState;
  constructor(
    host: HTMLElement,
    private choose: (point: Point) => boolean,
  ) {
    this.panel.className = "world-minimap";
    this.panel.setAttribute("role", "region");
    this.panel.setAttribute("aria-label", t("expansion.minimap"));
    this.caption.className = "minimap-location";
    const online = document.createElement("div");
    online.className = "minimap-online";
    const north = node("text", {
      x: 120,
      y: 83,
      "text-anchor": "middle",
      fill: "#ffdc8b",
      "font-size": 12,
      "font-weight": 700,
      "aria-hidden": "true",
      stroke: "#10211a",
      "stroke-width": 3,
      "paint-order": "stroke",
    });
    north.textContent = "N";
    const clipId = `minimap-viewport-${++nextViewport}`;
    const defs = node("defs");
    const clip = node("clipPath", {
      id: clipId,
      clipPathUnits: "userSpaceOnUse",
    });
    clip.append(node("circle", { cx: 120, cy: 120, r: 116 }));
    defs.append(clip);
    const viewport = node("g", { "clip-path": `url(#${clipId})` });
    viewport.append(this.base, this.moving);
    const hero = node("circle", {
      cx: 120,
      cy: 120,
      r: 4,
      fill: "#ffffff",
      stroke: "#10221a",
      "stroke-width": 1,
    });
    const heroTitle = node("title");
    heroTitle.textContent = t("expansion.you");
    hero.append(heroTitle);
    viewport.append(hero);
    this.svg.append(
      defs,
      node("circle", { cx: 120, cy: 120, r: 117, fill: "#10211a" }),
      viewport,
    );
    this.svg.append(north);
    const help = document.createElement("p");
    help.className = "minimap-help";
    help.textContent = t("expansion.minimapHelp");
    this.svg.setAttribute("title", help.textContent);
    this.status.setAttribute("role", "status");
    this.status.className = "sr-only";
    this.panel.append(this.svg, this.caption, online, this.status);
    this.caption.addEventListener("click", (event) => event.stopPropagation());
    online.addEventListener("click", (event) => event.stopPropagation());
    host.append(this.panel);
    this.svg.addEventListener("click", (event) => {
      event.stopPropagation();
      this.svg.focus();
      const rect = this.svg.getBoundingClientRect();
      const x = ((event.clientX - rect.left) * 240) / rect.width;
      const y = ((event.clientY - rect.top) * 240) / rect.height;
      if (Math.hypot(x - 120, y - 120) > 116) return;
      const point = this.projection.unproject({
        x,
        y,
      });
      if (point) this.go(point);
    });
    this.svg.addEventListener("keydown", (event) => {
      if (
        ![
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "Enter",
          " ",
          "Home",
        ].includes(event.key)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (!this.map || !this.state) return;
      if (event.key === "Home") this.cursor = { ...this.state.hero };
      else if (event.key === "Enter" || event.key === " ") {
        this.go(this.cursor || this.state.hero);
        return;
      } else {
        const p = this.cursor || this.state.hero,
          step = this.projection.range / 10;
        this.cursor = {
          x: Math.max(
            0,
            Math.min(
              this.map.width,
              p.x +
                (event.key === "ArrowLeft"
                  ? -step
                  : event.key === "ArrowRight"
                    ? step
                    : 0),
            ),
          ),
          y: Math.max(
            0,
            Math.min(
              this.map.height,
              p.y +
                (event.key === "ArrowUp"
                  ? -step
                  : event.key === "ArrowDown"
                    ? step
                    : 0),
            ),
          ),
        };
      }
      this.update(this.state);
    });
  }
  private go(point: Point) {
    this.cursor = point;
    this.status.textContent = t(
      this.choose(point)
        ? "expansion.destinationSet"
        : "expansion.destinationBlocked",
    );
    if (this.state) this.update(this.state);
  }
  setMap(map: WorldMap, points: readonly Point[]) {
    this.map = map;
    this.cursor = undefined;
    this.status.textContent = "";
    this.svg.dataset.mapId = map.id;
    this.base.replaceChildren();
    this.moving.replaceChildren();
    this.projection = radarProjection(map.width, map.height, map.spawn);
    this.base.append(
      node("image", {
        href: map.thumbnail,
        x: 0,
        y: 0,
        width: map.width,
        height: map.height,
        opacity: 0.9,
      }),
    );
    // One SVG path for the native walkable grid. No thousands of DOM markers.
    const sample = Math.max(1, Math.ceil(points.length / 1800));
    let d = "";
    for (let i = 0; i < points.length; i += sample) {
      const q = points[i];
      d += `M${q.x.toFixed(1)},${q.y.toFixed(1)}h1v1h-1z`;
    }
    this.base.append(node("path", { d, fill: "#b7e9a7", opacity: 0.35 }));
    this.positionTerrain();
  }
  private positionTerrain() {
    const p = this.projection;
    this.base.setAttribute(
      "transform",
      `translate(${p.x} ${p.y}) scale(${p.scale})`,
    );
  }
  /** Pan each frame without rebuilding the marker DOM on the HUD's 250ms tick. */
  follow(hero: Point) {
    if (!this.map) return;
    this.projection = radarProjection(this.map.width, this.map.height, hero);
    this.positionTerrain();
    this.moving.setAttribute(
      "transform",
      `translate(${this.projection.x - this.markersOrigin.x} ${this.projection.y - this.markersOrigin.y})`,
    );
  }
  update(state: MinimapState) {
    this.state = state;
    if (!this.map) return;
    this.follow(state.hero);
    this.markersOrigin = { x: this.projection.x, y: this.projection.y };
    this.moving.removeAttribute("transform");
    this.moving.replaceChildren();
    const project = this.projection.project;
    const dot = (p: Point, color: string, r: number, label: string) => {
      const q = project(p),
        circle = node("circle", {
          cx: q.x,
          cy: q.y,
          r,
          fill: color,
          stroke: "#10221a",
          "stroke-width": 1,
        });
      const title = node("title");
      title.textContent = label;
      circle.append(title);
      this.moving.append(circle);
    };
    if (state.path.length) {
      const q = project(state.path.at(-1)!);
      this.moving.append(
        node("circle", {
          "data-destination": "true",
          cx: q.x,
          cy: q.y,
          r: 5,
          fill: "none",
          stroke: state.auto ? "#72e5ef" : "#ffdc8b",
          "stroke-width": 2,
        }),
      );
    }
    for (const enemy of state.enemies)
      dot(enemy, enemy.elite ? "#ffc85e" : "#ef8072", 3, enemy.name);
    for (const npc of state.npcs) dot(npc, "#a5e994", 3, npc.name);
    if (state.portal) dot(state.portal, "#ceadff", 3.5, t("expansion.portal"));
    if (state.target) {
      const q = project(state.target);
      this.moving.append(
        node("circle", {
          cx: q.x,
          cy: q.y,
          r: 6,
          fill: "none",
          stroke: "#72e5ef",
          "stroke-width": 2,
        }),
      );
    }
    if (this.cursor) {
      const q = project(this.cursor);
      this.moving.append(
        node("path", {
          d: `M${q.x - 4},${q.y}h8M${q.x},${q.y - 4}v8`,
          stroke: "#ffe59c",
          "stroke-width": 1.5,
        }),
      );
    }
    this.caption.textContent = this.map.name;
    this.caption.title = this.map.name;
    this.svg.dataset.target = state.target?.name || "";
  }
  destroy() {
    this.panel.remove();
  }
}
