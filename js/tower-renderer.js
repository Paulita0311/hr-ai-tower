/* ============================================
   HR AI TOWER - TOWER RENDERER (PixiJS)
   Dibuja la torre del jugador en un <canvas>:
   base, pisos que caen con rebote, bandera al
   completar y partículas doradas en aciertos
   nativos. Sin bundlers: usa el global PIXI
   cargado por CDN en play.html.
   ============================================ */

function easeOutBounce(t) {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

const FLOOR_COLORS = {
  native: { top: "#2E8CFF", base: "#0070F2" },
  external: { top: "#D6912E", base: "#BA7517" },
  manual: { top: "#7A7A7A", base: "#555555" }
};

class TowerRenderer {
  constructor() {
    this.app = null;
    this.canvas = null;
    this.missions = [];
    this.floorState = [];
    this.floorSprites = [];
    this.container = null;
    this.particleLayer = null;
    this.particles = [];
    this.flag = null;
    this.flagWaveStarted = false;
    this.geometry = null;
    this.width = 0;
    this.height = 0;
    this.builtCount = 0;
    this.texCache = {};
  }

  init(canvasEl, missions) {
    if (this.app) this.destroy();
    if (typeof PIXI === "undefined" || !canvasEl) return;

    this.canvas = canvasEl;
    this.missions = missions || [];
    this.floorState = this.missions.map(() => "empty");
    this.floorSprites = this.missions.map(() => null);
    this.particles = [];
    this.flag = null;
    this.flagWaveStarted = false;
    this.builtCount = 0;
    this.width = 0;
    this.height = 0;

    this.app = new PIXI.Application({
      view: canvasEl,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true
    });

    this.container = new PIXI.Container();
    this.particleLayer = new PIXI.Container();
    this.app.stage.addChild(this.container);
    this.app.stage.addChild(this.particleLayer);

    this.app.ticker.add(() => this._tickParticles());

    if (typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => this.resize());
      this._resizeObserver.observe(canvasEl);
    }
    window.addEventListener("resize", this._onWindowResize || (this._onWindowResize = () => this.resize()));

    this.resize();
  }

  resize() {
    if (!this.app || !this.canvas) return;
    const w = Math.round(this.canvas.clientWidth || this.canvas.parentElement.clientWidth || 280);
    const h = Math.round(this.canvas.clientHeight || this.canvas.parentElement.clientHeight || 200);
    if (w < 10 || h < 10) return;
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.app.renderer.resize(w, h);
    this._layout();
  }

  buildFloor(idx, type, label) {
    if (!this.app) return;
    if (!this.geometry) this.resize();
    if (!this.geometry) return;

    this._destroyFloorVisual(idx);
    this.floorState[idx] = { type, label: label || "" };
    this.builtCount = this.floorState.filter((s) => s !== "empty").length;

    const holder = this._createFloorVisual(idx);
    const targetY = holder._targetY;
    holder.y = -this.geometry.floorH * 2 - idx * 16;
    this.container.addChild(holder);
    this.floorSprites[idx] = holder;

    this._animateFall(holder, targetY);

    if (type === "native") {
      const cx = holder._targetX + this._floorWidth(idx) / 2;
      const cy = targetY + this.geometry.floorH / 2;
      this._spawnGoldParticles(cx, cy);
    }

    this._layoutFlag();
  }

  destroy() {
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this.app) {
      this.app.destroy(false, { children: true, texture: false, baseTexture: false });
    }
    this.app = null;
  }

  /* ---------- layout ---------- */

  _layout() {
    const total = this.missions.length;
    if (!total) return;

    const baseH = Math.max(8, Math.round(this.height * 0.035));
    const padding = 10;
    const flagSpace = 30;
    const gap = 6;
    const availH = this.height - baseH - flagSpace - padding * 2;
    const floorH = Math.max(24, Math.min(52, availH / total - gap));

    this.geometry = { baseH, padding, flagSpace, gap, floorH };

    this._drawBase();

    for (let i = 0; i < total; i++) {
      this._destroyFloorVisual(i);
      if (this.floorState[i] === "empty") {
        this._drawEmptyFloor(i);
      } else {
        const holder = this._createFloorVisual(i);
        holder.y = holder._targetY;
        this.container.addChild(holder);
        this.floorSprites[i] = holder;
      }
    }

    this._layoutFlag();
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

  _destroyFloorVisual(idx) {
    const existing = this.floorSprites[idx];
    if (existing) {
      this.container.removeChild(existing);
      existing.destroy({ children: true });
      this.floorSprites[idx] = null;
    }
  }

  _drawBase() {
    if (this.baseG) {
      this.container.removeChild(this.baseG);
      this.baseG.destroy();
    }
    const g = this.geometry;
    const baseW = Math.min(this.width - 10, 250);
    const x = (this.width - baseW) / 2;
    const y = this.height - g.padding - g.baseH;
    const gfx = new PIXI.Graphics();
    gfx.beginFill(0x2A3B5C);
    gfx.drawRoundedRect(x, y, baseW, g.baseH, 4);
    gfx.endFill();
    gfx.lineStyle(1, 0x0A1628, 0.7);
    gfx.drawRoundedRect(x, y, baseW, g.baseH, 4);
    this.container.addChildAt(gfx, 0);
    this.baseG = gfx;
  }

  _drawEmptyFloor(idx) {
    const floorW = this._floorWidth(idx);
    const floorH = this.geometry.floorH;
    const x = (this.width - floorW) / 2;
    const y = this._floorTopY(idx);

    const g = new PIXI.Graphics();
    g.lineStyle(1.5, 0xFFFFFF, 0.5);
    this._dashedRoundedRect(g, x, y, floorW, floorH, 9, 5, 4);

    const txt = new PIXI.Text(String(idx + 1), new PIXI.TextStyle({
      fontFamily: "Inter, sans-serif",
      fontSize: 11,
      fontWeight: "700",
      fill: 0xFFFFFF
    }));
    txt.alpha = 0.32;
    txt.anchor.set(0.5);
    txt.x = x + floorW / 2;
    txt.y = y + floorH / 2;

    const holder = new PIXI.Container();
    holder.addChild(g);
    holder.addChild(txt);
    this.container.addChild(holder);
    this.floorSprites[idx] = holder;
  }

  _dashedRoundedRect(g, x, y, w, h, r, dash, gap) {
    const segments = [
      [x + r, y, x + w - r, y],
      [x + w, y + r, x + w, y + h - r],
      [x + w - r, y + h, x + r, y + h],
      [x, y + h - r, x, y + r]
    ];
    segments.forEach(([x1, y1, x2, y2]) => this._dashLine(g, x1, y1, x2, y2, dash, gap));
  }

  _dashLine(g, x1, y1, x2, y2, dash, gap) {
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;
    const ux = dx / dist, uy = dy / dist;
    let pos = 0, draw = true;
    g.moveTo(x1, y1);
    while (pos < dist) {
      const segLen = Math.min(draw ? dash : gap, dist - pos);
      const nx = x1 + ux * (pos + segLen);
      const ny = y1 + uy * (pos + segLen);
      if (draw) g.lineTo(nx, ny); else g.moveTo(nx, ny);
      pos += segLen;
      draw = !draw;
    }
  }

  _gradientTexture(top, base) {
    const key = top + "|" + base;
    if (this.texCache[key]) return this.texCache[key];
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = 64;
    const ctx = c.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, top);
    grad.addColorStop(1, base);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 8, 64);
    const tex = PIXI.Texture.from(c);
    this.texCache[key] = tex;
    return tex;
  }

  _createFloorVisual(idx) {
    const state = this.floorState[idx];
    const floorW = this._floorWidth(idx);
    const floorH = this.geometry.floorH;
    const targetX = (this.width - floorW) / 2;
    const targetY = this._floorTopY(idx);

    const c = FLOOR_COLORS[state.type] || FLOOR_COLORS.manual;
    const baseHex = PIXI.utils.string2hex(c.base);
    const topHex = PIXI.utils.string2hex(c.top);

    const holder = new PIXI.Container();

    const glow = new PIXI.Graphics();
    glow.beginFill(baseHex, 0.45);
    glow.drawRoundedRect(-5, -5, floorW + 10, floorH + 10, 13);
    glow.endFill();
    if (typeof PIXI.BlurFilter === "function") {
      const blur = new PIXI.BlurFilter();
      blur.blur = 7;
      glow.filters = [blur];
    }
    holder.addChild(glow);

    const sprite = new PIXI.Sprite(this._gradientTexture(c.top, c.base));
    sprite.width = floorW;
    sprite.height = floorH;
    holder.addChild(sprite);

    const maskG = new PIXI.Graphics();
    maskG.beginFill(0xFFFFFF);
    maskG.drawRoundedRect(0, 0, floorW, floorH, 9);
    maskG.endFill();
    maskG.renderable = false;
    holder.addChild(maskG);
    sprite.mask = maskG;

    const border = new PIXI.Graphics();
    border.lineStyle(2, topHex, 0.95);
    border.drawRoundedRect(1, 1, floorW - 2, floorH - 2, 8);
    holder.addChild(border);

    const txt = new PIXI.Text(state.label, new PIXI.TextStyle({
      fontFamily: "Inter, sans-serif",
      fontSize: Math.max(10, Math.min(13, Math.floor(floorH * 0.28))),
      fontWeight: "700",
      fill: 0xFFFFFF,
      align: "center",
      wordWrap: true,
      wordWrapWidth: floorW - 8
    }));
    txt.anchor.set(0.5);
    txt.x = floorW / 2;
    txt.y = floorH / 2;
    holder.addChild(txt);

    holder.x = targetX;
    holder._targetX = targetX;
    holder._targetY = targetY;
    return holder;
  }

  _animateFall(displayObj, targetY) {
    const startY = displayObj.y;
    const duration = 650;
    const startTime = performance.now();
    const tick = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOutBounce(t);
      displayObj.y = startY + (targetY - startY) * eased;
      if (t >= 1) {
        displayObj.y = targetY;
        this.app.ticker.remove(tick);
      }
    };
    this.app.ticker.add(tick);
  }

  /* ---------- bandera ---------- */

  _layoutFlag() {
    const total = this.missions.length;
    if (!total || !this.geometry) return;
    const allBuilt = this.builtCount >= total;
    const topY = this._floorTopY(total - 1);
    const centerX = this.width / 2;

    if (!this.flag) {
      this.flag = new PIXI.Container();

      const pole = new PIXI.Graphics();
      pole.lineStyle(2, 0xD9DEE8, 1);
      pole.moveTo(0, 0);
      pole.lineTo(0, -22);
      this.flag.addChild(pole);

      const cloth = new PIXI.Graphics();
      cloth.beginFill(0x0070F2);
      cloth.drawPolygon([0, -22, 16, -18, 0, -14]);
      cloth.endFill();
      cloth.name = "cloth";
      this.flag.addChild(cloth);

      this.flag.visible = false;
      this.container.addChild(this.flag);
    }

    this.flag.x = centerX;
    this.flag.y = topY;

    if (allBuilt && !this.flag.visible) {
      this.flag.visible = true;
      this.flag.scale.set(0.2);
      this.flag.alpha = 0;
      this._animateFlagIn();
    } else if (!allBuilt) {
      this.flag.visible = false;
    }
  }

  _animateFlagIn() {
    const start = performance.now();
    const duration = 500;
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.flag.alpha = eased;
      this.flag.scale.set(0.2 + 0.8 * eased);
      if (t >= 1) {
        this.app.ticker.remove(tick);
        this._startFlagWave();
      }
    };
    this.app.ticker.add(tick);
  }

  _startFlagWave() {
    if (this.flagWaveStarted) return;
    this.flagWaveStarted = true;
    this.app.ticker.add(() => {
      if (!this.flag || !this.flag.visible) return;
      const cloth = this.flag.getChildByName("cloth");
      if (cloth) cloth.skew.y = Math.sin(performance.now() / 260) * 0.18;
    });
  }

  /* ---------- partículas doradas ---------- */

  _spawnGoldParticles(cx, cy) {
    const count = 14;
    for (let i = 0; i < count; i++) {
      const p = new PIXI.Graphics();
      const r = 2 + Math.random() * 2.5;
      p.beginFill(0xE8B84B, 0.95);
      p.drawCircle(0, 0, r);
      p.endFill();
      p.x = cx;
      p.y = cy;
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 1.6;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - 1.2;
      p.birth = performance.now();
      p.maxLife = 700 + Math.random() * 400;
      this.particleLayer.addChild(p);
      this.particles.push(p);
    }
  }

  _tickParticles() {
    if (!this.particles.length) return;
    const now = performance.now();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      const age = now - p.birth;
      if (age >= p.maxLife) {
        this.particleLayer.removeChild(p);
        p.destroy();
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.03;
      p.alpha = 1 - age / p.maxLife;
    }
  }
}

TowerRenderer = new TowerRenderer();
window.TowerRenderer = TowerRenderer;
