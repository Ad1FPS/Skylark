import { esc } from "../format";

export interface Series {
  values: number[];
  color: string; // CSS colour
  kind: "line" | "area" | "bars";
  dashed?: boolean; // lines only
  label?: string; // shown in the tooltip
}

/** Horizontal threshold stripes in value units. */
export interface Band {
  from: number;
  to: number;
  color: string;
}

export interface ChartOpts {
  times: string[]; // local ISO, one per value
  series: Series[];
  nowIndex: number; // vertical "Now" marker; -1 for none
  min?: number; // y range; default 0 for bars/area, data min otherwise (padded 8 %)
  max?: number; // default data max padded 8 %
  height?: number; // px, default 180
  format?: (v: number) => string; // value text for tooltip and y labels
  bands?: Band[];
  yAxis?: "left" | "right"; // where value labels sit; gutter follows
  extrema?: boolean; // mark min/max of the first line/area series
}

const W = 1000;
const PAD_T = 14;
const PAD_B = 24;
const GUTTER = 44;
const EDGE_R = 14;

function hourOf(iso: string): string {
  return iso.length > 10 ? iso.slice(11, 13) : "00";
}

export function renderChart(o: ChartOpts): HTMLElement {
  const root = document.createElement("div");
  root.className = "chart";
  const series = o.series.filter((s) => s.values.length > 0);
  if (o.times.length === 0 || series.length === 0) {
    root.innerHTML = `<div class="chart-empty">No data.</div>`;
    return root;
  }

  const H = o.height ?? 180;
  const fmt = o.format ?? ((v: number) => String(Math.round(v)));
  const n = o.times.length;
  const hasBars = series.some((s) => s.kind === "bars");

  const padL = o.yAxis === "right" ? EDGE_R : GUTTER;
  const padR = o.yAxis === "right" ? GUTTER : EDGE_R;

  const all = series.flatMap((s) => s.values);
  const zeroBased = hasBars || series.some((s) => s.kind === "area");
  let lo = o.min ?? (zeroBased ? 0 : Math.min(...all));
  let hi = o.max ?? Math.max(...all);
  if (hi - lo < 1e-6) hi = lo + 1;
  const pad = (hi - lo) * 0.08;
  if (o.min == null && !zeroBased) lo -= pad;
  if (o.max == null) hi += pad;

  const plotW = W - padL - padR;
  const plotH = H - PAD_T - PAD_B;
  const x = (i: number): number => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number): number => PAD_T + plotH - ((v - lo) / (hi - lo)) * plotH;
  const baseY = y(Math.max(lo, 0));

  let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px;display:block" aria-hidden="true">`;

  // Grid: three evenly spaced ticks.
  const ticks = [lo, lo + (hi - lo) / 2, hi];
  for (const t of ticks) {
    const gy = y(t).toFixed(1);
    svg += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="rgba(255,255,255,.1)" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  }

  // Bands behind the series.
  for (const b of o.bands ?? []) {
    const top = y(Math.min(b.to, hi));
    const bot = y(Math.max(b.from, lo));
    if (bot <= top) continue;
    svg += `<rect x="${padL}" y="${top.toFixed(1)}" width="${plotW}" height="${(bot - top).toFixed(1)}" fill="${b.color}" fill-opacity=".12"/>`;
  }

  // Day divider.
  if (n > 24) {
    const dx = x(24).toFixed(1);
    svg += `<line x1="${dx}" y1="${PAD_T}" x2="${dx}" y2="${PAD_T + plotH}" stroke="rgba(255,255,255,.2)" stroke-width="1" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>`;
  }

  // Series.
  const barSlot = plotW / Math.max(n - 1, 1);
  for (const s of series) {
    if (s.kind === "bars") {
      const bw = barSlot * 0.7;
      s.values.forEach((v, i) => {
        const bx = x(i) - bw / 2;
        const by = y(Math.max(v, lo));
        const bh = Math.max(baseY - by, v > 0 ? 1 : 0);
        if (bh <= 0) return;
        svg += `<rect x="${bx.toFixed(1)}" y="${(baseY - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="${s.color}"/>`;
      });
      continue;
    }
    const pts = s.values.map((v, i) => `${x(i).toFixed(1)} ${y(v).toFixed(1)}`);
    if (s.kind === "area") {
      svg += `<path d="M${pts[0]} L${pts.slice(1).join(" L")} L${x(n - 1).toFixed(1)} ${baseY.toFixed(1)} L${x(0).toFixed(1)} ${baseY.toFixed(1)} Z" fill="${s.color}" fill-opacity=".25"/>`;
    }
    const dash = s.dashed ? ` stroke-dasharray="5 4"` : "";
    svg += `<polyline points="${pts.join(" ")}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${dash} vector-effect="non-scaling-stroke"/>`;
  }

  // Extrema markers on the first line/area series (HTML, so the stretched SVG cannot distort them).
  const extremaMarks: { i: number; v: number; label: string; above: boolean }[] = [];
  if (o.extrema) {
    const first = series.find((s) => s.kind === "line" || s.kind === "area");
    if (first && first.values.length > 1) {
      const vals = first.values;
      let minI = 0;
      let maxI = 0;
      for (let i = 1; i < vals.length; i++) {
        if (vals[i] < vals[minI]) minI = i;
        if (vals[i] > vals[maxI]) maxI = i;
      }
      extremaMarks.push({ i: maxI, v: vals[maxI], label: "H", above: true });
      extremaMarks.push({ i: minI, v: vals[minI], label: "L", above: false });
    }
  }

  // Now marker.
  if (o.nowIndex >= 0 && o.nowIndex < n) {
    const nx = x(o.nowIndex).toFixed(1);
    svg += `<line x1="${nx}" y1="${PAD_T}" x2="${nx}" y2="${PAD_T + plotH}" stroke="rgba(255,255,255,.55)" stroke-width="1" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/>`;
  }

  svg += `</svg>`;
  root.innerHTML = svg;

  // x labels every 6 hours.
  const xl = document.createElement("div");
  xl.className = "chart-x";
  xl.style.paddingLeft = `${(padL / W) * 100}%`;
  xl.style.paddingRight = `${(padR / W) * 100}%`;
  for (let i = 0; i < n; i += 6) {
    const lab = document.createElement("span");
    lab.textContent = hourOf(o.times[i]);
    const pct = ((x(i) - padL) / plotW) * 100;
    lab.style.left = `${pct}%`;
    xl.appendChild(lab);
  }
  root.appendChild(xl);

  for (const m of extremaMarks) {
    const dot = document.createElement("span");
    dot.className = "chart-mark";
    dot.style.cssText = `position:absolute;left:${((x(m.i) / W) * 100).toFixed(2)}%;top:${((y(m.v) / H) * 100).toFixed(2)}%;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:50%;background:#fff;border:2px solid rgba(0,0,0,.45);box-sizing:border-box;pointer-events:none`;
    const tag = document.createElement("span");
    tag.textContent = m.label;
    tag.style.cssText = `position:absolute;left:50%;transform:translateX(-50%);${m.above ? "bottom" : "top"}:10px;font-size:11px;font-weight:600;color:rgba(255,255,255,.8)`;
    dot.appendChild(tag);
    root.appendChild(dot);
  }

  // y labels.
  const yl = document.createElement("div");
  yl.className = `chart-y${o.yAxis === "right" ? " chart-y-right" : ""}`;
  for (const t of [ticks[2], ticks[1], ticks[0]]) {
    const lab = document.createElement("span");
    lab.textContent = fmt(t);
    lab.style.top = `${(y(t) / H) * 100}%`;
    yl.appendChild(lab);
  }
  root.appendChild(yl);

  if (n > 24) {
    const div = document.createElement("span");
    div.className = "chart-day";
    div.textContent = "Tomorrow";
    div.style.left = `${((x(24) - padL) / plotW) * 100 + (padL / W) * 100}%`;
    root.appendChild(div);
  }
  if (o.nowIndex >= 0 && o.nowIndex < n) {
    const now = document.createElement("span");
    now.className = "chart-now";
    now.textContent = "Now";
    now.style.left = `${((x(o.nowIndex) - padL) / plotW) * 100 + (padL / W) * 100}%`;
    root.appendChild(now);
  }

  // Hover cursor + tooltip.
  const cursor = document.createElement("div");
  cursor.className = "chart-cursor";
  cursor.style.display = "none";
  const tip = document.createElement("div");
  tip.className = "chart-tip";
  tip.style.display = "none";
  root.appendChild(cursor);
  root.appendChild(tip);

  const onMove = (e: PointerEvent): void => {
    const rect = root.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round(((rel - padL) / plotW) * (n - 1));
    if (idx < 0 || idx >= n) {
      onLeave();
      return;
    }
    const px = ((x(idx) - padL) / plotW) * 100 + (padL / W) * 100;
    cursor.style.display = "block";
    cursor.style.left = `${px}%`;
    tip.style.display = "block";

    const day = idx >= 24 ? "Tomorrow" : "Today";
    const lines = series
      .map((s) => {
        const v = s.values[idx];
        if (v == null) return "";
        return `<div class="chart-tip-row"><i style="background:${s.color}"></i><span>${esc(s.label ?? "")}</span><b>${esc(fmt(v))}</b></div>`;
      })
      .join("");
    tip.innerHTML = `<div class="chart-tip-time">${esc(day)} ${hourOf(o.times[idx])}:00</div>${lines}`;

    if (px > 60) {
      tip.style.left = "auto";
      tip.style.right = `${100 - px}%`;
      tip.style.transform = "translateX(-8px)";
    } else {
      tip.style.right = "auto";
      tip.style.left = `${px}%`;
      tip.style.transform = "translateX(8px)";
    }
  };
  const onLeave = (): void => {
    cursor.style.display = "none";
    tip.style.display = "none";
  };
  root.addEventListener("pointermove", onMove);
  root.addEventListener("pointerleave", onLeave);

  return root;
}
