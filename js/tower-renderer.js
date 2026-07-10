/* ============================================
   HR AI TOWER - TOWER RENDERER (Canvas 2D)
   Torre construida DE ARENA. La solidez de cada
   piso depende de la decision (campo `stability`
   0..100): alto = arenisca compacta dorada, medio =
   arena seca algo agrietada, bajo = bloque erosionado
   que desmorona arena.

   Usa Canvas 2D puro: NO depende de PixiJS ni de
   WebGL/GPU, asi que funciona en cualquier navegador.
   API publica identica a la version anterior:
     init(canvasEl, missions), resize(),
     buildFloor(idx, type, label, stability), destroy()
   ============================================ */

function easeOutBounce(t) {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

function stabilityToSolidity(stability, type) {
  let s = stability;
  if (typeof s !== "number") s = type === "native" ? 85 : type === "external" ? 50 : 20;
  return Math.max(0, Math.min(1, s / 100));
}

function _hexRgb(h) { h = h.replace("#", ""); return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]; }
function _lerp(a, b, t) { return a + (b - a) * t; }
function mixHex(c1, c2, t) {
  const a = _hexRgb(c1), b = _hexRgb(c2);
  const to = (n) => Math.round(n).toString(16).padStart(2, "0");
  return "#" + to(_lerp(a[0], b[0], t)) + to(_lerp(a[1], b[1], t)) + to(_lerp(a[2], b[2], t));
}

function sandPalette(s) {
  return {
    top:    mixHex("#BFB299", "#F0D083", s),
    base:   mixHex("#8F8060", "#C6923B", s),
    border: mixHex("#A99C80", "#F5E0A6", s)
  };
}

function seededRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTopEdge(seed, notches, amp, solidity) {
  const rnd = seededRng(seed);
  const pts = [];
  for (let i = 0; i <= notches; i++) {
    let d = rnd();
    if (solidity > 0.75) d *= 0.32;
    else if (solidity > 0.45) d *= 0.7;
    else d = Math.pow(d, 0.6);
    pts.push(d * amp);
  }
  if (solidity < 0.4 && notches > 3) {
    const k = 1 + Math.floor(rnd() * (notches - 2));
    pts[k] += amp * 0.6;
    pts[k + 1] += amp * 0.4;
  }
  return pts;
}

const NOTCHES = 12;

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

class TowerRenderer {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.dpr = 1;
    this.missions = [];
    this.floors = [];          // {built, type, label, stability, solidity, seed, animStart}
    this.particles = [];
    this.trickleFloors = new Set();
    this.width = 0;
    this.height = 0;
    this.geometry = null;
    this.builtCount = 0;
    this.flag = null;          // {start, waveStarted}
    this.running = false;
    this.rafId = null;
    this._lastNow = 0;
    this._resizeObserver = null;
  }

  init(canvasEl, missions) {
    if (this.canvas) this.destroy();
    if (!canvasEl || !canvasEl.getContext) return;

    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext("2d");
    this.missions = missions || [];
    this.floors = this.missions.map(() => ({ built: false }));
    this.particles = [];
    this.trickleFloors = new Set();
    this.builtCount = 0;
    this.flag = null;
    this.width = 0;
    this.height = 0;
    this.geometry = null;

    // El canvas siempre en bloque y transparente; la columna recorta desbordes.
    this.canvas.style.display = "block";
    this.canvas.style.background = "transparent";
    this.canvas.style.maxWidth = "100%";
    const host = this.canvas.parentElement;
    if (host) host.style.overflow = "hidden";

    if (typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => this.resize());
      this._resizeObserver.observe(host || this.canvas);
    }
    this._onWindowResize = () => this.resize();
    window.addEventListener("resize", this._onWindowResize);

    this.running = true;
    this._lastNow = (typeof performance !== "undefined" ? performance.now() : Date.now());
    this._startLoop();

    // init() suele correr con la pantalla aun oculta -> tamaño 0. Reintenta.
    this._ensureSized(40);
  }

  destroy() {
    this.running = false;
    if (this.rafId != null && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this._resizeObserver) { this._resizeObserver.disconnect(); this._resizeObserver = null; }
    if (this._onWindowResize) window.removeEventListener("resize", this._onWindowResize);
    if (this.ctx && this.canvas) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.canvas = null;
    this.ctx = null;
  }

  /* ---------- medidas ---------- */

  resize() {
    if (!this.canvas || !this.ctx) return;
    const host = this.canvas.parentElement || this.canvas;
    const hostW = host.clientWidth || 0;
    const hostH = host.clientHeight || 0;
    if (hostW < 10 || hostH < 10) return;   // aun oculto

    let siblings = 0;
    const kids = host.children || [];
    for (let i = 0; i < kids.length; i++) if (kids[i] !== this.canvas) siblings += kids[i].offsetHeight || 0;
    const cs = window.getComputedStyle(host);
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const gap = parseFloat(cs.rowGap || cs.gap) || 0;

    let w = Math.round(hostW - padX);
    let h = Math.round(hostH - siblings - padY - gap);
    if (h < 120) h = 200;
    h = Math.min(h, (window.innerHeight || 900) + 40);
    w = Math.max(60, Math.min(w, 300));

    if (w === this.width && h === this.height && this.geometry) return;

    this.width = w;
    this.height = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.canvas.style.flex = "none";
    this._computeGeometry();
  }

  _ensureSized(triesLeft) {
    if (!this.canvas) return;
    this.resize();
    if ((this.geometry && this.width > 0) || triesLeft <= 0) return;
    setTimeout(() => this._ensureSized(triesLeft - 1), 150);
  }

  _computeGeometry() {
    const total = this.missions.length;
    if (!total) { this.geometry = null; return; }
    const baseH = Math.max(8, Math.round(this.height * 0.035));
    const padding = 10;
    const flagSpace = 30;
    const gap = 6;
    const availH = this.height - baseH - flagSpace - padding * 2;
    const floorH = Math.max(24, Math.min(52, availH / total - gap));
    this.geometry = { baseH, padding, flagSpace, gap, floorH };
  }

  _floorWidth(idx) {
    const maxW = Math.min(this.width - 24, 230);
    return Math.max(60, maxW * (1 - idx * 0.045));
  }

  _floorTopY(idx) {
    const g = this.geometry;
    const bottomOfStack = this.height - g.padding - g.baseH;
    const bottomY = bottomOfStack - idx * (g.floorH + g.gap);
    return bottomY - g.floorH;
  }

  /* ---------- construir piso ---------- */

  buildFloor(idx, type, label, stability) {
    if (!this.geometry) this.resize();
    if (!this.geometry || idx == null || idx < 0) return;
    const solidity = stabilityToSolidity(stability, type);
    this.floors[idx] = {
      built: true,
      type,
      label: label || "",
      stability: typeof stability === "number" ? stability : Math.round(solidity * 100),
      solidity,
      seed: 1013 * (idx + 1) + 17,
      animStart: (typeof performance !== "undefined" ? performance.now() : Date.now())
    };
    this.builtCount = this.floors.filter((f) => f && f.built).length;

    if (solidity < 0.4) this.trickleFloors.add(idx); else this.trickleFloors.delete(idx);

    const fw = this._floorWidth(idx);
    const cx = (this.width - fw) / 2 + fw / 2;
    const cy = this._floorTopY(idx) + this.geometry.floorH;
    this._spawnSandPuff(cx, cy, solidity);
    if (solidity >= 0.7) this._spawnGold(cx, cy - this.geometry.floorH / 2);

    if (this.builtCount >= this.missions.length && !this.flag) {
      this.flag = { start: (typeof performance !== "undefined" ? performance.now() : Date.now()), waveStarted: false };
    }
  }

  /* ---------- loop ---------- */

  _startLoop() {
    if (typeof requestAnimationFrame === "undefined") return;
    const loop = (now) => {
      if (!this.running) return;
      this._update(now);
      this._draw();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  _update(now) {
    // emision de arena en pisos debiles
    if (this.trickleFloors.size && this.geometry) {
      this.trickleFloors.forEach((idx) => { if (Math.random() < 0.08) this._spawnTrickle(idx); });
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      const age = now - p.birth;
      if (age >= p.maxLife) { this.particles.splice(i, 1); continue; }
      p.x += p.vx; p.y += p.vy; p.vy += p.grav; p.alpha = 1 - age / p.maxLife;
    }
  }

  /* ---------- dibujo ---------- */

  _draw() {
    const ctx = this.ctx;
    if (!ctx || !this.geometry) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    this._drawBase(ctx);

    const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
    for (let i = 0; i < this.missions.length; i++) {
      const f = this.floors[i];
      if (!f || !f.built) { this._drawEmptyFloor(ctx, i); continue; }
      const targetY = this._floorTopY(i);
      let y = targetY;
      const t = Math.min(1, (now - f.animStart) / 650);
      if (t < 1) {
        const startY = -this.geometry.floorH * 2 - i * 16;
        const eased = f.solidity >= 0.7 ? easeOutBounce(t) : _lerp(easeOutBounce(t), 1 - Math.pow(1 - t, 2), 1 - f.solidity);
        y = startY + (targetY - startY) * eased;
      }
      const fw = this._floorWidth(i);
      this._drawFloor(ctx, (this.width - fw) / 2, y, fw, this.geometry.floorH, f.solidity, f.seed, f.label);
    }

    this._drawParticles(ctx);
    this._drawFlag(ctx, now);
  }

  _drawBase(ctx) {
    const g = this.geometry;
    const baseW = Math.min(this.width - 10, 250);
    const x = (this.width - baseW) / 2;
    const y = this.height - g.padding - g.baseH;
    ctx.fillStyle = "#4A3F28";
    roundRectPath(ctx, x, y, baseW, g.baseH, 4); ctx.fill();
    ctx.fillStyle = "#2E2717";
    roundRectPath(ctx, x, y + g.baseH * 0.55, baseW, g.baseH * 0.45, 3); ctx.fill();
    ctx.strokeStyle = "rgba(26,21,10,0.8)"; ctx.lineWidth = 1;
    roundRectPath(ctx, x, y, baseW, g.baseH, 4); ctx.stroke();
  }

  _drawEmptyFloor(ctx, idx) {
    const fw = this._floorWidth(idx);
    const fh = this.geometry.floorH;
    const x = (this.width - fw) / 2;
    const y = this._floorTopY(idx);
    ctx.save();
    ctx.strokeStyle = "rgba(217,199,154,0.5)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    roundRectPath(ctx, x, y, fw, fh, 9); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(232,217,180,0.3)";
    ctx.font = "700 11px Inter, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(idx + 1), x + fw / 2, y + fh / 2);
    ctx.restore();
  }

  _drawFloor(ctx, x, y, w, h, solidity, seed, label) {
    const pal = sandPalette(solidity);
    const rough = 1 - solidity;
    const amp = rough * Math.min(16, h * 0.42);
    const edge = buildTopEdge(seed, NOTCHES, amp, solidity);
    const topY = (i) => y + edge[i] + 2;

    // resplandor calido en pisos solidos
    if (solidity >= 0.7) {
      ctx.save();
      ctx.shadowColor = "rgba(232,184,75,0.6)";
      ctx.shadowBlur = 18;
      ctx.fillStyle = "rgba(232,184,75,0.22)";
      ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      ctx.restore();
    }

    const path = () => {
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x, topY(0));
      for (let i = 0; i <= NOTCHES; i++) ctx.lineTo(x + (w * i) / NOTCHES, topY(i));
      ctx.lineTo(x + w, y + h);
      ctx.closePath();
    };

    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, pal.top); g.addColorStop(1, pal.base);
    ctx.save();
    path(); ctx.fillStyle = g; ctx.fill(); ctx.clip();

    // granos de arena
    const rnd = seededRng(seed * 3 + 1);
    const grains = Math.min(220, Math.round(w * h * 0.05));
    for (let i = 0; i < grains; i++) {
      const gx = x + rnd() * w, gy = y + rnd() * h;
      ctx.fillStyle = rnd() > 0.5 ? "rgba(255,246,220,0.13)" : "rgba(74,52,22,0.13)";
      ctx.fillRect(gx, gy, 1.3, 1.3);
    }
    // realce de compactacion + sombra base
    ctx.fillStyle = "rgba(255,246,230," + (0.22 * solidity + 0.05) + ")";
    ctx.fillRect(x, y + amp + 2, w, Math.max(2, h * 0.12));
    ctx.fillStyle = "rgba(35,24,8,0.26)";
    ctx.fillRect(x, y + h - Math.max(2, h * 0.18), w, Math.max(2, h * 0.18));
    // grietas
    const crackCount = Math.round(rough * 4);
    ctx.strokeStyle = "rgba(30,20,6,0.45)";
    for (let c = 0; c < crackCount; c++) {
      ctx.lineWidth = 0.8 + rnd() * 1.3;
      let cx = x + 6 + rnd() * (w - 12), cy = y + amp + 4 + rnd() * (h - amp - 8);
      ctx.beginPath(); ctx.moveTo(cx, cy);
      const segs = 3 + Math.floor(rnd() * 3);
      for (let s = 0; s < segs; s++) { cx += (rnd() - 0.5) * 16; cy += 3 + rnd() * 7; ctx.lineTo(cx, cy); }
      ctx.stroke();
    }
    // remaches en pisos solidos
    if (solidity >= 0.7) {
      ctx.fillStyle = "rgba(255,240,200,0.5)";
      for (let s = 0; s < 3; s++) { ctx.beginPath(); ctx.arc(x + w * (0.25 + 0.25 * s), y + h - 6, 1.6, 0, 7); ctx.fill(); }
    }
    ctx.restore();

    // borde siguiendo el perfil erosionado
    ctx.save();
    ctx.strokeStyle = pal.border;
    ctx.lineWidth = solidity >= 0.7 ? 2.2 : 1.3;
    ctx.globalAlpha = 0.45 + 0.55 * solidity;
    if (solidity < 0.4) ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(x, y + h); ctx.lineTo(x, topY(0));
    for (let i = 0; i <= NOTCHES; i++) ctx.lineTo(x + (w * i) / NOTCHES, topY(i));
    ctx.lineTo(x + w, y + h);
    ctx.stroke();
    ctx.restore();

    // etiqueta en la zona solida
    if (label) {
      const solidTop = y + amp + 2;
      ctx.save();
      ctx.font = "700 " + Math.max(10, Math.min(13, Math.floor(h * 0.26))) + "px Inter, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = 2.5; ctx.strokeStyle = "rgba(255,243,214,0.9)";
      ctx.fillStyle = "#3A2A10";
      const lbl = label.length > 22 ? label.slice(0, 21) + "…" : label;
      const ly = solidTop + (y + h - solidTop) / 2;
      ctx.strokeText(lbl, x + w / 2, ly);
      ctx.fillText(lbl, x + w / 2, ly);
      ctx.restore();
    }
  }

  _drawParticles(ctx) {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      if (p.rect) ctx.fillRect(p.x, p.y, 1.6, 2.6);
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }

  _drawFlag(ctx, now) {
    if (!this.flag || this.builtCount < this.missions.length) return;
    const topY = this._floorTopY(this.missions.length - 1);
    const cx = this.width / 2;
    const t = Math.min(1, (now - this.flag.start) / 500);
    const grow = 0.2 + 0.8 * (1 - Math.pow(1 - t, 3));
    ctx.save();
    ctx.translate(cx, topY);
    ctx.scale(grow, grow);
    ctx.globalAlpha = 1 - Math.pow(1 - t, 3);
    ctx.strokeStyle = "#D9DEE8"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -22); ctx.stroke();
    const wave = Math.sin(now / 260) * 3;
    ctx.fillStyle = "#0070F2";
    ctx.beginPath();
    ctx.moveTo(0, -22); ctx.lineTo(16, -18 + wave); ctx.lineTo(0, -14); ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* ---------- particulas ---------- */

  _spawnSandPuff(cx, cy, solidity) {
    const count = Math.round(10 + (1 - solidity) * 18);
    const tone = solidity >= 0.7 ? "#E9CE93" : solidity >= 0.4 ? "#CEBB93" : "#B8A77F";
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
      const speed = 0.5 + Math.random() * 1.5;
      this.particles.push({
        x: cx + (Math.random() - 0.5) * 40, y: cy - Math.random() * 4,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        grav: 0.05, r: 1 + Math.random() * 2.2, color: tone, alpha: 1,
        birth: now, maxLife: 500 + Math.random() * 500
      });
    }
  }

  _spawnGold(cx, cy) {
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 1.6;
      this.particles.push({
        x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1.2,
        grav: 0.03, r: 2 + Math.random() * 2.5, color: "#E8B84B", alpha: 1,
        birth: now, maxLife: 700 + Math.random() * 400
      });
    }
  }

  _spawnTrickle(idx) {
    if (!this.geometry) return;
    const fw = this._floorWidth(idx);
    const x = (this.width - fw) / 2;
    const y = this._floorTopY(idx) + this.geometry.floorH - 3;
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
    this.particles.push({
      x: x + 6 + Math.random() * (fw - 12), y: y,
      vx: (Math.random() - 0.5) * 0.2, vy: 0.3 + Math.random() * 0.4,
      grav: 0.05, rect: true, color: "#B8A87E", alpha: 1,
      birth: now, maxLife: 700 + Math.random() * 500
    });
  }
}

TowerRenderer = new TowerRenderer();
if (typeof window !== "undefined") window.TowerRenderer = TowerRenderer;
if (typeof module !== "undefined" && module.exports) module.exports = { TowerRenderer, sandPalette, buildTopEdge, seededRng };