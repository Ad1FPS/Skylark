const MARGIN = 12;
const GAP = 12;
const ARROW = 14;
const ARROW_EDGE = 22;
const NARROW = 700;

export interface PopoverOpts {
  anchor: HTMLElement;
  title: string;
  iconHtml: string;
  body: HTMLElement;
  width?: number;
  onClose?: () => void;
}

export interface PopoverHandle {
  close(): void;
  reposition(): void;
  el: HTMLElement;
}

interface Placement {
  side: "right" | "left" | "below" | "above" | "narrow";
  top: number;
  left: number;
  width: number;
  haveArrow: boolean;
  arrowX?: number;
  arrowY?: number;
}

let current: { el: HTMLElement; close: () => void } | null = null;

export function openPopover(o: PopoverOpts): PopoverHandle {
  if (current) current.close();

  const el = document.createElement("div");
  el.className = "popover";
  el.setAttribute("role", "dialog");
  el.tabIndex = -1;

  const head = document.createElement("div");
  head.className = "popover-head";
  head.innerHTML = `<span class="popover-icon">${o.iconHtml}</span><span class="popover-title">${o.title}</span>`;

  const body = document.createElement("div");
  body.className = "popover-body";
  body.appendChild(o.body);

  const arrow = document.createElement("div");
  arrow.className = "popover-arrow";

  el.appendChild(head);
  el.appendChild(body);
  el.appendChild(arrow);
  document.body.appendChild(el);

  const prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  let frame = 0;
  let closed = false;

  const measure = (): DOMRect => o.anchor.getBoundingClientRect();

  function computePlacement(): Placement {
    const width = Math.min(o.width ?? 380, window.innerWidth - MARGIN * 2);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const a = measure();

    if (vw < NARROW) {
      const maxH = vh - MARGIN * 2;
      const h = Math.min(el.offsetHeight || 0, maxH);
      const left = (vw - width) / 2;
      let top = a.bottom + GAP;
      if (top + h > vh - MARGIN) top = a.top - GAP - h;
      top = clamp(top, MARGIN, vh - MARGIN - h);
      return { side: "narrow", top, left, width, haveArrow: false };
    }

    const maxH = vh - MARGIN * 2;
    const h = Math.min(el.offsetHeight || 0, maxH);

    const fitsRight = a.right + GAP + width <= vw - MARGIN;
    const fitsLeft = a.left - GAP - width >= MARGIN;
    const fitsBelow = a.bottom + GAP + h <= vh - MARGIN;
    const fitsAbove = a.top - GAP - h >= MARGIN;

    const side = fitsRight ? "right" : fitsLeft ? "left" : fitsBelow ? "below" : fitsAbove ? "above" : "right";
    const aCx = a.left + a.width / 2;
    const aCy = a.top + a.height / 2;

    let top: number;
    let left: number;
    if (side === "right" || side === "left") {
      top = clamp(aCy - h / 2, MARGIN, vh - MARGIN - h);
      left = side === "right" ? a.right + GAP : a.left - GAP - width;
    } else {
      left = clamp(aCx - width / 2, MARGIN, vw - MARGIN - width);
      top = side === "below" ? a.bottom + GAP : a.top - GAP - h;
    }

    let arrowX: number | undefined;
    let arrowY: number | undefined;
    if (side === "right" || side === "left") {
      arrowY = clamp(aCy - top - ARROW / 2, ARROW_EDGE, h - ARROW_EDGE - ARROW);
    } else {
      arrowX = clamp(aCx - left - ARROW / 2, ARROW_EDGE, width - ARROW_EDGE - ARROW);
    }

    return { side, top, left, width, haveArrow: true, arrowX, arrowY };
  }

  function apply(): void {
    const p = computePlacement();
    el.style.top = `${Math.round(p.top)}px`;
    el.style.left = `${Math.round(p.left)}px`;
    el.style.width = `${Math.round(p.width)}px`;

    el.classList.remove("pop-right", "pop-left", "pop-below", "pop-above", "pop-narrow");
    el.classList.add(`pop-${p.side}`);

    if (!p.haveArrow) {
      arrow.classList.add("arrow-hidden");
      return;
    }
    arrow.classList.remove("arrow-hidden");
    if (p.arrowY !== undefined) {
      arrow.style.top = `${Math.round(p.arrowY)}px`;
      arrow.style.left = "";
    } else if (p.arrowX !== undefined) {
      arrow.style.left = `${Math.round(p.arrowX)}px`;
      arrow.style.top = "";
    }
  }

  function reposition(): void {
    if (closed) return;
    if (!o.anchor.isConnected) {
      close();
      return;
    }
    if (scrolledOut()) {
      close();
      return;
    }
    apply();
  }

  function scrolledOut(): boolean {
    const a = measure();
    if (a.bottom <= 0 || a.top >= window.innerHeight) return true;
    let p = o.anchor.parentElement;
    while (p && p !== document.body) {
      const style = getComputedStyle(p);
      const oy = style.overflowY;
      if (oy === "auto" || oy === "scroll" || oy === "hidden") {
        const r = p.getBoundingClientRect();
        if (a.top >= r.bottom || a.bottom <= r.top) return true;
      }
      p = p.parentElement;
    }
    return false;
  }

  function onPointerDown(e: PointerEvent): void {
    const t = e.target as Node | null;
    if (!t) return;
    if (el.contains(t)) return;
    if (o.anchor.contains(t) || o.anchor === t) return;
    close();
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") close();
  }

  function onBlur(): void {
    close();
  }

  function onScrollResize(): void {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      reposition();
    });
  }

  function close(): void {
    if (closed) return;
    closed = true;
    if (frame) cancelAnimationFrame(frame);
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("resize", onScrollResize);
    document.removeEventListener("scroll", onScrollResize, true);
    el.remove();
    if (current?.el === el) current = null;
    prevFocus?.focus();
    o.onClose?.();
  }

  function arrowOrigin(): string {
    const p = computePlacement();
    if (p.side === "right") return "left center";
    if (p.side === "left") return "right center";
    if (p.side === "below") return "center top";
    if (p.side === "above") return "center bottom";
    return "center center";
  }

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("blur", onBlur);
  window.addEventListener("resize", onScrollResize);
  document.addEventListener("scroll", onScrollResize, true);

  apply();
  el.style.transformOrigin = arrowOrigin();

  const handle: PopoverHandle = { close, reposition, el };
  current = { el, close };

  el.focus();

  return handle;
}

function clamp(v: number, lo: number, hi: number): number {
  if (hi < lo) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}
