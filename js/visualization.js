/**
 * visualization.js — High-Fidelity Animated SVG Traffic Junction Simulator
 *
 * Features:
 *   - Real-world traffic dynamics with realistic real-time speed & deceleration
 *   - Smooth curved vehicle turning (Left Turns, Right Turns & Straight routes)
 *   - Amber blinking turn indicator signals on vehicles
 *   - Photorealistic vector vehicle models with headlights, tinted glass & brake lights
 *   - 3D overhead traffic signal gantries with glowing optical lenses
 *   - Live interactive Scheduling Explainer HUD with dynamic formula breakdown
 */

const Visualization = (() => {

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ── Canvas Dimensions ──────────────────────────────────────
  const W = 960, H = 640;
  const CX = 480, CY = 320;
  const RW = 104;                 // Road width (2 lanes: 52px each)
  const HR = RW / 2;              // Half road width = 52

  // Intersection Bounds
  const IX1 = CX - HR, IX2 = CX + HR;
  const IY1 = CY - HR, IY2 = CY + HR;

  // Vehicle Dimensions & Spacing
  const CAR_LEN = 34;
  const CAR_WID = 18;
  const CAR_GAP = 28;
  const MAX_VIS_QUEUE = 7;

  // ── Color Schemes & Palettes ──────────────────────────────
  const PALETTES = {
    East:  ['#2563eb', '#0284c7', '#1d4ed8', '#38bdf8', '#0369a1'], // Blue tones
    South: ['#ea580c', '#dc2626', '#f97316', '#e11d48', '#c2410c'], // Coral / Orange tones
    West:  ['#9333ea', '#7c3aed', '#a855f7', '#6d28d9', '#c026d3'], // Purple / Violet tones
    North: ['#0d9488', '#059669', '#14b8a6', '#047857', '#10b981'], // Teal / Mint tones
  };

  const THEME = {
    sidewalk:     '#f8f9fa', // Off-white clean background
    asphalt:      '#747d8c', // Realistic dark asphalt for white markings to pop
    asphaltLight: '#7e8796', // Intersection junction
    curb:         '#a4b0be', // Curb edge
    bikeLane:     '#2ed573', // USA style green bike lane
    buildingFill: '#f1f3f4', // Google Maps building color
    buildingStroke:'#dadce0', // Subtle building border
    markingWhite: '#ffffff',
    markingYellow:'#fbbc04', // Google Maps yellow for double lines
    stopLine:     '#ffffff',
    signalArm:    '#57606f',
    signalBox:    '#2f3542',
    lightRedOff:  '#ff4757',
    lightRedOn:   '#ff4757', // Let filter handle glow
    lightYelOff:  '#facc15',
    lightYelOn:   '#facc15', // True yellow
    lightGrnOff:  '#2ed573',
    lightGrnOn:   '#2ed573',
  };

  // ── Lane Geometry Definitions ─────────────────────────────
  const LANES_CONFIG = {
    North: {
      inboundX: CX - HR / 2,
      outboundX: CX + HR / 2,
      stopY: IY1,
      dir: { dx: 0, dy: 1 },
      angle: 180,
      queuePos: (d) => ({ x: CX - HR / 2, y: IY1 - 25 - d }),
    },
    South: {
      inboundX: CX + HR / 2,
      outboundX: CX - HR / 2,
      stopY: IY2,
      dir: { dx: 0, dy: -1 },
      angle: 0,
      queuePos: (d) => ({ x: CX + HR / 2, y: IY2 + 25 + d }),
    },
    East: {
      inboundY: CY - HR / 2,
      outboundY: CY + HR / 2,
      stopX: IX2,
      dir: { dx: -1, dy: 0 },
      angle: 270,
      queuePos: (d) => ({ x: IX2 + 25 + d, y: CY - HR / 2 }),
    },
    West: {
      inboundY: CY + HR / 2,
      outboundY: CY - HR / 2,
      stopX: IX1,
      dir: { dx: 1, dy: 0 },
      angle: 90,
      queuePos: (d) => ({ x: IX1 - 25 - d, y: CY + HR / 2 }),
    }
  };

  // Signal Head Screen Locations (placed perfectly symmetrically in the grass corners)
  // Signal Head Screen Locations (Hugging their respective roads)
  const SIGNAL_HEADS = {
    North: { x: IX1 - 12, y: IY1 - 80 },
    South: { x: IX2 + 12, y: IY2 + 80 },
    East:  { x: IX2 + 80, y: IY1 - 12 },
    West:  { x: IX1 - 80, y: IY2 + 12 },
  };

  // ── State Variables ───────────────────────────────────────
  let svg = null;
  let layers = {};
  let signalLights = {};
  let activeDepartures = [];     // Animated vehicles with smooth turning physics
  let prevSnapshot = null;
  let hudElements = {};
  let blinkState = false;

  // ── Bézier Path Trajectory Evaluation ─────────────────────
  // Computes continuous coordinates (x, y) and tangent angle for turning maneuvers
  function sampleTrajectory(lane, route, u) {
    let p0, p1, p2;
    const LC1_X = CX - HR / 2, LC2_X = CX + HR / 2;
    const LC1_Y = CY - HR / 2, LC2_Y = CY + HR / 2;

    if (lane === 'North') {
      if (route === 'right') {
        p0 = { x: LC1_X, y: IY1 };
        p1 = { x: LC1_X, y: LC1_Y };
        p2 = { x: -40, y: LC1_Y };
      } else if (route === 'left') {
        p0 = { x: LC1_X, y: IY1 };
        p1 = { x: LC1_X, y: LC2_Y };
        p2 = { x: W + 40, y: LC2_Y };
      } else {
        return { x: LC1_X, y: IY1 + u * (H + 40 - IY1), angle: 180 };
      }
    } else if (lane === 'South') {
      if (route === 'right') {
        p0 = { x: LC2_X, y: IY2 };
        p1 = { x: LC2_X, y: LC2_Y };
        p2 = { x: W + 40, y: LC2_Y };
      } else if (route === 'left') {
        p0 = { x: LC2_X, y: IY2 };
        p1 = { x: LC2_X, y: LC1_Y };
        p2 = { x: -40, y: LC1_Y };
      } else {
        return { x: LC2_X, y: IY2 - u * (IY2 + 40), angle: 0 };
      }
    } else if (lane === 'East') {
      if (route === 'right') {
        p0 = { x: IX2, y: LC1_Y };
        p1 = { x: LC2_X, y: LC1_Y };
        p2 = { x: LC2_X, y: -40 };
      } else if (route === 'left') {
        p0 = { x: IX2, y: LC1_Y };
        p1 = { x: LC1_X, y: LC1_Y };
        p2 = { x: LC1_X, y: H + 40 };
      } else {
        return { x: IX2 - u * (IX2 + 40), y: LC1_Y, angle: 270 };
      }
    } else if (lane === 'West') {
      if (route === 'right') {
        p0 = { x: IX1, y: LC2_Y };
        p1 = { x: LC1_X, y: LC2_Y };
        p2 = { x: LC1_X, y: H + 40 };
      } else if (route === 'left') {
        p0 = { x: IX1, y: LC2_Y };
        p1 = { x: LC2_X, y: LC2_Y };
        p2 = { x: LC2_X, y: -40 };
      } else {
        return { x: IX1 + u * (W + 40 - IX1), y: LC2_Y, angle: 90 };
      }
    }

    // Quadratic Bézier Evaluation
    const t = Math.max(0, Math.min(1, u));
    const inv = 1 - t;
    let x = inv * inv * p0.x + 2 * inv * t * p1.x + t * t * p2.x;
    let y = inv * inv * p0.y + 2 * inv * t * p1.y + t * t * p2.y;

    // Tangent derivative vector
    const dx = 2 * inv * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
    const dy = 2 * inv * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);

    if (u < 0) {
      // Linearly extrapolate backwards along the entry lane
      x += (p1.x - p0.x) * 2 * u;
      y += (p1.y - p0.y) * 2 * u;
    }

    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    return { x, y, angle };
  }

  // ── SVG Helper Functions ──────────────────────────────────
  function createSVGElement(tag, attrs = {}, parent = null) {
    const el = document.createElementNS(SVG_NS, tag);
    const exactMatchAttrs = ['viewBox', 'preserveAspectRatio'];
    for (const [key, value] of Object.entries(attrs)) {
      if (exactMatchAttrs.includes(key)) {
        el.setAttribute(key, String(value));
      } else {
        el.setAttribute(key.replace(/([A-Z])/g, '-$1').toLowerCase(), String(value));
      }
    }
    if (parent) parent.appendChild(el);
    return el;
  }

  function createGroup(parent, id) {
    return createSVGElement('g', id ? { id } : {}, parent);
  }

  // ── Initialization ────────────────────────────────────────
  function init(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    svg = createSVGElement('svg', {
      viewBox: `0 0 ${W} ${H}`,
      width: '100%',
      height: '100%',
      preserveAspectRatio: 'xMidYMid slice',
    });
    svg.style.display = 'block';
    svg.style.borderRadius = '8px';
    container.appendChild(svg);

    // Build SVG defs
    buildDefs();

    // Setup rendering layers
    layers.background = createGroup(svg, 'layer-background');
    layers.roads      = createGroup(svg, 'layer-roads');
    layers.markings   = createGroup(svg, 'layer-markings');
    layers.queues     = createGroup(svg, 'layer-queues');
    layers.departures = createGroup(svg, 'layer-departures');
    layers.signals    = createGroup(svg, 'layer-signals');
    layers.hud        = createGroup(svg, 'layer-hud');

    // Draw static scene components
    drawEnvironment();
    drawRoadNetwork();
    drawMarkings();
    drawSignalGantries();
  }

  // ── SVG Filters & Gradients ───────────────────────────────
  function buildDefs() {
    const defs = createSVGElement('defs', {}, svg);

    // Car drop shadow
    const filter = createSVGElement('filter', { id: 'car-shadow', x: '-25%', y: '-25%', width: '150%', height: '150%' }, defs);
    createSVGElement('feDropShadow', { dx: '0', dy: '2', stdDeviation: '2', floodColor: '#000000', floodOpacity: '0.15' }, filter);

    // Paving pattern for realistic plaza
    const paving = createSVGElement('pattern', { id: 'paving-pattern', width: '24', height: '24', patternUnits: 'userSpaceOnUse' }, defs);
    createSVGElement('rect', { width: '24', height: '24', fill: THEME.sidewalk }, paving);
    createSVGElement('path', { d: 'M 24 0 L 0 0 0 24', fill: 'none', stroke: 'rgba(0,0,0,0.04)', strokeWidth: '1' }, paving);
    createSVGElement('circle', { cx: '12', cy: '12', r: '1', fill: 'rgba(0,0,0,0.02)' }, paving);

    // Roof gradient for subtle 3D lighting on buildings
    const rGrad = createSVGElement('linearGradient', { id: 'roof-grad', x1: '0', y1: '0', x2: '1', y2: '1' }, defs);
    createSVGElement('stop', { offset: '0%', stopColor: '#ffffff' }, rGrad);
    createSVGElement('stop', { offset: '100%', stopColor: '#f1f5f9' }, rGrad);

    // Building drop shadow
    const bFilter = createSVGElement('filter', { id: 'building-shadow', x: '-10%', y: '-10%', width: '130%', height: '130%' }, defs);
    createSVGElement('feDropShadow', { dx: '2', dy: '8', stdDeviation: '6', floodColor: '#000000', floodOpacity: '0.12' }, bFilter);

    // Signal glow filter
    const glow = createSVGElement('filter', { id: 'signal-glow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
    createSVGElement('feGaussianBlur', { stdDeviation: '3', result: 'blur' }, glow);
    const merge = createSVGElement('feMerge', {}, glow);
    createSVGElement('feMergeNode', { in: 'blur' }, merge);
    createSVGElement('feMergeNode', { in: 'SourceGraphic' }, merge);

    // Headlight cone gradient (subtle in daylight)
    const hGrad = createSVGElement('linearGradient', { id: 'headlight-beam', x1: '0', y1: '1', x2: '0', y2: '0' }, defs);
    createSVGElement('stop', { offset: '0%', stopColor: '#fef08a', stopOpacity: '0.1' }, hGrad);
    createSVGElement('stop', { offset: '100%', stopColor: '#fef08a', stopOpacity: '0.0' }, hGrad);

    // Glass windshield gradient
    const gGrad = createSVGElement('linearGradient', { id: 'windshield-glass', x1: '0', y1: '0', x2: '1', y2: '1' }, defs);
    createSVGElement('stop', { offset: '0%', stopColor: '#93c5fd', stopOpacity: '0.7' }, gGrad);
    createSVGElement('stop', { offset: '100%', stopColor: '#3b82f6', stopOpacity: '0.85' }, gGrad);
  }

  // ── Draw Environment ──────────────────────────────────────
  function drawEnvironment() {
    // Solid green map background
    createSVGElement('rect', { x: 0, y: 0, width: W, height: H, fill: THEME.sidewalk }, layers.background);
  }

  // ── Draw Road Network ─────────────────────────────────────
  function drawRoadNetwork() {
    // Asphalt base
    createSVGElement('rect', { x: IX1, y: 0, width: RW, height: H, fill: THEME.asphalt }, layers.roads);
    createSVGElement('rect', { x: 0, y: IY1, width: W, height: RW, fill: THEME.asphalt }, layers.roads);

    // Draw Curbs
    drawCornerPath(IX1, IY1, -1, -1, THEME.curb, 3);
    drawCornerPath(IX2, IY1, 1, -1, THEME.curb, 3);
    drawCornerPath(IX1, IY2, -1, 1, THEME.curb, 3);
    drawCornerPath(IX2, IY2, 1, 1, THEME.curb, 3);

    // Draw Bike Lanes (dynamic based on signals)
    const tl = drawCornerPath(IX1 - 12, IY1 - 12, -1, -1, THEME.bikeLane, 2);
    const tr = drawCornerPath(IX2 + 12, IY1 - 12, 1, -1, THEME.bikeLane, 2);
    const bl = drawCornerPath(IX1 - 12, IY2 + 12, -1, 1, THEME.bikeLane, 2);
    const br = drawCornerPath(IX2 + 12, IY2 + 12, 1, 1, THEME.bikeLane, 2);
    
    tl.id = 'bike-tl';
    tr.id = 'bike-tr';
    bl.id = 'bike-bl';
    br.id = 'bike-br';
  }

  function drawCornerPath(x, y, signX, signY, strokeColor, strokeW) {
    const ext = 800;
    const r = 24;
    return createSVGElement('path', {
      d: `M ${x + signX * ext} ${y} L ${x + signX * r} ${y} Q ${x} ${y} ${x} ${y + signY * r} L ${x} ${y + signY * ext}`,
      stroke: strokeColor,
      strokeWidth: strokeW,
      fill: 'none',
    }, layers.roads);
  }

  // ── Draw Road Markings ────────────────────────────────────
  function drawMarkings() {
    // US Double Yellow Center Lines (4-way junction)
    const yp = THEME.markingYellow;
    
    // North lines
    createSVGElement('rect', { x: CX - 3, y: 0, width: 2, height: IY1 - 24, fill: yp }, layers.markings);
    createSVGElement('rect', { x: CX + 1, y: 0, width: 2, height: IY1 - 24, fill: yp }, layers.markings);
    // South lines
    createSVGElement('rect', { x: CX - 3, y: IY2 + 24, width: 2, height: H - IY2 - 24, fill: yp }, layers.markings);
    createSVGElement('rect', { x: CX + 1, y: IY2 + 24, width: 2, height: H - IY2 - 24, fill: yp }, layers.markings);
    // West lines
    createSVGElement('rect', { x: 0, y: CY - 3, width: IX1 - 24, height: 2, fill: yp }, layers.markings);
    createSVGElement('rect', { x: 0, y: CY + 1, width: IX1 - 24, height: 2, fill: yp }, layers.markings);
    // East lines
    createSVGElement('rect', { x: IX2 + 24, y: CY - 3, width: W - IX2 - 24, height: 2, fill: yp }, layers.markings);
    createSVGElement('rect', { x: IX2 + 24, y: CY + 1, width: W - IX2 - 24, height: 2, fill: yp }, layers.markings);

    // Stop Lines
    createSVGElement('rect', { x: IX1 + 2, y: IY1 - 4, width: HR - 4, height: 4, fill: THEME.stopLine }, layers.markings);
    createSVGElement('rect', { x: CX + 2, y: IY2, width: HR - 4, height: 4, fill: THEME.stopLine }, layers.markings);
    createSVGElement('rect', { x: IX2, y: IY1 + 2, width: 4, height: HR - 4, fill: THEME.stopLine }, layers.markings);
    createSVGElement('rect', { x: IX1 - 4, y: CY + 2, width: 4, height: HR - 4, fill: THEME.stopLine }, layers.markings);

    // Zebra Crosswalks
    drawZebraCrosswalk(IX1 + 4, IY1 - 20, RW - 8, 12, true);
    drawZebraCrosswalk(IX1 + 4, IY2 + 8, RW - 8, 12, true);
    drawZebraCrosswalk(IX2 + 8, IY1 + 4, 12, RW - 8, false);
    drawZebraCrosswalk(IX1 - 20, IY1 + 4, 12, RW - 8, false);
  }

  function drawZebraCrosswalk(x, y, width, height, isHorizontal) {
    const stripes = 8;
    for (let i = 0; i < stripes; i++) {
      if (isHorizontal) {
        const sw = (width - 14) / stripes;
        createSVGElement('rect', {
          x: x + i * (sw + 2) + 1, y, width: sw, height,
          fill: THEME.markingWhite, opacity: 0.85, rx: 1,
        }, layers.markings);
      } else {
        const sh = (height - 14) / stripes;
        createSVGElement('rect', {
          x, y: y + i * (sh + 2) + 1, width, height: sh,
          fill: THEME.markingWhite, opacity: 0.85, rx: 1,
        }, layers.markings);
      }
    }
  }

  // ── Draw Traffic Signals ──────────────────────────────────
  function drawSignalGantries() {
    const LANES = ['North', 'South', 'East', 'West'];

    for (const lane of LANES) {
      const pos = SIGNAL_HEADS[lane];
      const g = createGroup(layers.signals, `signal-${lane}`);

      // Offset pole base straight behind the traffic light along the road axis
      let px = pos.x, py = pos.y;
      const POLE_LEN = 65; // Long straight pole

      if (lane === 'North') { // Faces UP, pole goes straight UP
        py -= POLE_LEN;
      } else if (lane === 'South') { // Faces DOWN, pole goes straight DOWN
        py += POLE_LEN;
      } else if (lane === 'East') { // Faces RIGHT, pole goes straight RIGHT
        px += POLE_LEN;
      } else if (lane === 'West') { // Faces LEFT, pole goes straight LEFT
        px -= POLE_LEN;
      }

      // Shadow for the long pole
      createSVGElement('line', {
        x1: px + 2, y1: py + 2, x2: pos.x + 2, y2: pos.y + 2,
        stroke: 'rgba(0,0,0,0.3)', strokeWidth: 3.5, strokeLinecap: 'round'
      }, g);

      // Slim, sleek metallic pole connecting base to casing
      createSVGElement('line', {
        x1: px, y1: py, x2: pos.x, y2: pos.y,
        stroke: '#94a3b8', strokeWidth: 3.5, strokeLinecap: 'round'
      }, g);

      let bw, bh, dx, dy, rdx, rdy, ydx, ydy, gdx, gdy;

      // Unique orientations so each light perfectly faces its oncoming traffic
      if (lane === 'North') { // Faces UP (traffic coming down)
        bw = 18; bh = 44;
        dx = -bw / 2; dy = -bh / 2;
        rdx = 0; rdy = 13; // Red at the bottom (closest to the intersection)
        ydx = 0; ydy = 0;
        gdx = 0; gdy = -13; // Green at the top (furthest)
      } else if (lane === 'South') { // Faces DOWN (traffic coming up)
        bw = 18; bh = 44;
        dx = -bw / 2; dy = -bh / 2;
        rdx = 0; rdy = -13; // Red at the top
        ydx = 0; ydy = 0;
        gdx = 0; gdy = 13; // Green at the bottom
      } else if (lane === 'West') { // Faces LEFT (traffic coming right)
        bw = 44; bh = 18;
        dx = -bw / 2; dy = -bh / 2;
        rdx = 13; rdy = 0; // Red on the right
        ydx = 0; ydy = 0;
        gdx = -13; gdy = 0; // Green on the left
      } else if (lane === 'East') { // Faces RIGHT (traffic coming left)
        bw = 44; bh = 18;
        dx = -bw / 2; dy = -bh / 2;
        rdx = -13; rdy = 0; // Red on the left
        ydx = 0; ydy = 0;
        gdx = 13; gdy = 0; // Green on the right
      }

      // Drop shadow for the casing
      createSVGElement('rect', {
        x: pos.x + dx + 3, y: pos.y + dy + 3, width: bw, height: bh,
        rx: 4, fill: 'rgba(0,0,0,0.15)'
      }, g);

      // The traffic light casing (premium styled)
      createSVGElement('rect', {
        x: pos.x + dx, y: pos.y + dy, width: bw, height: bh,
        rx: 4, fill: '#334155', stroke: '#1e293b', strokeWidth: 2,
      }, g);

      // Dark sockets (reflector housings)
      createSVGElement('circle', { cx: pos.x + rdx, cy: pos.y + rdy, r: 6, fill: '#0f172a' }, g);
      createSVGElement('circle', { cx: pos.x + ydx, cy: pos.y + ydy, r: 6, fill: '#0f172a' }, g);
      createSVGElement('circle', { cx: pos.x + gdx, cy: pos.y + gdy, r: 6, fill: '#0f172a' }, g);

      // The actual glowing LED lights
      const r = 4.5;
      const red = createSVGElement('circle', { cx: pos.x + rdx, cy: pos.y + rdy, r, fill: THEME.lightRedOn }, g);
      const yel = createSVGElement('circle', { cx: pos.x + ydx, cy: pos.y + ydy, r, fill: THEME.lightYelOff }, g);
      const grn = createSVGElement('circle', { cx: pos.x + gdx, cy: pos.y + gdy, r, fill: THEME.lightGrnOff }, g);

      // Calculate Timer Y Position (User requested East / Top-Right to have timer ABOVE the light)
      let timerBoxY = pos.y + bh / 2 + 4;
      if (lane === 'East') {
        timerBoxY = pos.y - bh / 2 - 18;
      }

      // Timer box (always placed upright)
      createSVGElement('rect', {
        x: pos.x - 12, y: timerBoxY, width: 24, height: 14,
        rx: 2, fill: '#334155', stroke: '#1e293b', strokeWidth: 1.2,
      }, g);

      const timerText = createSVGElement('text', {
        x: pos.x, y: timerBoxY + 10.5, fill: '#ef4444', fontSize: '10',
        fontFamily: 'monospace', fontWeight: 'bold', textAnchor: 'middle',
      }, g);
      timerText.textContent = '--';

      signalLights[lane] = { red, yellow: yel, green: grn, timer: timerText };
    }
  }

  // ── Build Live Interactive Explainer HUD ───────────────────
  function buildHUD() {
    const hudBox = createSVGElement('g', { id: 'hud-container' }, layers.hud);

    // Place on top-right corner. W = 640. Width = 360, Margin = 16.
    const hudW = 380;
    const hudX = W - hudW - 16;
    const hudY = 16;

    createSVGElement('rect', {
      x: hudX, y: hudY, width: hudW, height: 72, rx: 8,
      fill: '#ffffff', fillOpacity: '0.9', stroke: '#e5e7eb', strokeWidth: 1,
      filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.05))'
    }, hudBox);

    hudElements.title = createSVGElement('text', {
      x: hudX + 16, y: hudY + 24, fill: '#1f2937', fontSize: '12', fontWeight: 'bold',
      fontFamily: 'Inter, sans-serif',
    }, hudBox);

    hudElements.formula = createSVGElement('text', {
      x: hudX + 16, y: hudY + 44, fill: '#005bbf', fontSize: '11', fontFamily: '"JetBrains Mono", monospace', fontWeight: 'bold',
    }, hudBox);

    createSVGElement('rect', {
      x: hudX + 16, y: hudY + 54, width: hudW - 32, height: 4, rx: 2, fill: '#f4f4f5',
    }, hudBox);

    hudElements.progressBar = createSVGElement('rect', {
      x: hudX + 16, y: hudY + 54, width: 0, height: 4, rx: 2, fill: '#34a853',
    }, hudBox);

    hudElements.timeText = createSVGElement('text', {
      x: hudX + hudW - 16, y: hudY + 24, fill: '#6b7280', fontSize: '11', fontFamily: '"JetBrains Mono", monospace', textAnchor: 'end', fontWeight: 'bold'
    }, hudBox);
  }

  // ── Detailed Vector Vehicle Renderer with Turn Signals ────
  function createDetailedCar(car, cx, cy, angle, isBraking = false, parentGroup) {
    const g = createSVGElement('g', {
      transform: `translate(${cx}, ${cy}) rotate(${angle})`,
      filter: 'url(#car-shadow)',
    }, parentGroup);

    const palette = PALETTES[car.lane] || PALETTES.East;
    const bodyColor = palette[(car.colorVariant || 0) % palette.length];
    const type = car.type || 'sedan';
    const route = car.route || 'straight';
    const w = CAR_WID, h = CAR_LEN;
    const isBlinkL = blinkState && route === 'left';
    const isBlinkR = blinkState && route === 'right';

    if (type === 'bike') {
      // 1. Headlight beam
      createSVGElement('polygon', { points: `-4,-16 -8,-35 8,-35 4,-16`, fill: 'url(#headlight-beam)', opacity: isBraking ? 0.3 : 0.65 }, g);
      // 2. Tires
      createSVGElement('rect', { x: -1.5, y: -h/2 + 6, width: 3, height: 6, rx: 1, fill: '#0a0a0a' }, g);
      createSVGElement('rect', { x: -1.5, y: h/2 - 12, width: 3, height: 6, rx: 1, fill: '#0a0a0a' }, g);
      // 3. Bike Chassis
      createSVGElement('rect', { x: -3, y: -h/2 + 8, width: 6, height: h - 18, rx: 2, fill: bodyColor, stroke: '#374151', strokeWidth: 0.5 }, g);
      // Rider Helmet
      createSVGElement('circle', { cx: 0, cy: 0, r: 3.5, fill: '#374151' }, g); 
      // Handlebars
      createSVGElement('line', { x1: -5, y1: -4, x2: 5, y2: -4, stroke: '#374151', strokeWidth: 1.5, strokeLinecap: 'round' }, g);
      // Lights
      createSVGElement('circle', { cx: 0, cy: -h/2 + 8, r: 1.5, fill: '#fef08a' }, g); // Front
      const brakeColor = isBraking ? '#ff1e1e' : '#991b1b';
      createSVGElement('circle', { cx: 0, cy: h/2 - 10, r: 1.5, fill: brakeColor }, g); // Back
      if (isBraking) createSVGElement('circle', { cx: 0, cy: h/2 - 10, r: 4, fill: '#ff1e1e', opacity: 0.4 }, g);
      // Indicators
      if (isBlinkL) { createSVGElement('circle', { cx: -2, cy: -h/2 + 9, r: 1.5, fill: '#f59e0b' }, g); createSVGElement('circle', { cx: -2, cy: h/2 - 11, r: 1.5, fill: '#f59e0b' }, g); }
      if (isBlinkR) { createSVGElement('circle', { cx: 2, cy: -h/2 + 9, r: 1.5, fill: '#f59e0b' }, g); createSVGElement('circle', { cx: 2, cy: h/2 - 11, r: 1.5, fill: '#f59e0b' }, g); }

    } else if (type === 'truck') {
      const tw = w + 4; // Width 22
      const th = h + 20; // Length 56
      // 1. Headlight beam
      createSVGElement('polygon', { points: `-8,-26 -18,-58 18,-58 8,-26`, fill: 'url(#headlight-beam)', opacity: isBraking ? 0.3 : 0.65 }, g);
      // 1b. Rubber Tires
      const ttW = 4, ttH = 9;
      createSVGElement('rect', { x: -tw/2 - 2, y: -th/2 + 7, width: ttW, height: ttH, rx: 1.5, fill: '#1a1a1a' }, g);
      createSVGElement('rect', { x: tw/2 - 2,  y: -th/2 + 7, width: ttW, height: ttH, rx: 1.5, fill: '#1a1a1a' }, g);
      createSVGElement('rect', { x: -tw/2 - 2, y: th/2 - 16, width: ttW, height: ttH, rx: 1.5, fill: '#1a1a1a' }, g);
      createSVGElement('rect', { x: tw/2 - 2,  y: th/2 - 16, width: ttW, height: ttH, rx: 1.5, fill: '#1a1a1a' }, g);
      createSVGElement('rect', { x: -tw/2 - 2, y: th/2 - 28, width: ttW, height: ttH, rx: 1.5, fill: '#1a1a1a' }, g);
      createSVGElement('rect', { x: tw/2 - 2,  y: th/2 - 28, width: ttW, height: ttH, rx: 1.5, fill: '#1a1a1a' }, g);
      // 2. Cab (Front)
      createSVGElement('rect', { x: -tw/2 + 1, y: -th/2 + 2, width: tw - 2, height: 16, rx: 2, fill: bodyColor, stroke: '#3f3f46', strokeWidth: 0.8 }, g);
      // Windshield
      createSVGElement('rect', { x: -tw/2 + 2, y: -th/2 + 11, width: tw - 4, height: 5, rx: 1, fill: 'url(#windshield-glass)' }, g);
      // 3. Trailer (Back)
      createSVGElement('rect', { x: -tw/2, y: -th/2 + 22, width: tw, height: th - 22, rx: 1, fill: '#f1f5f9', stroke: '#94a3b8', strokeWidth: 1.5 }, g);
      // Lights
      createSVGElement('circle', { cx: -tw/2 + 4, cy: -th/2 + 3, r: 2.5, fill: '#fef08a' }, g);
      createSVGElement('circle', { cx: tw/2 - 4, cy: -th/2 + 3, r: 2.5, fill: '#fef08a' }, g);
      const brakeColor = isBraking ? '#ef4444' : '#991b1b';
      createSVGElement('rect', { x: -tw/2 + 1, y: th/2 - 2, width: 5, height: 2, fill: brakeColor }, g);
      createSVGElement('rect', { x: tw/2 - 6, y: th/2 - 2, width: 5, height: 2, fill: brakeColor }, g);
      if (isBraking) {
        createSVGElement('circle', { cx: -tw/2 + 3, cy: th/2 - 1, r: 6, fill: '#ef4444', opacity: 0.4 }, g);
        createSVGElement('circle', { cx: tw/2 - 3, cy: th/2 - 1, r: 6, fill: '#ef4444', opacity: 0.4 }, g);
      }
      // Indicators
      if (isBlinkL) { createSVGElement('circle', { cx: -tw/2 + 1, cy: -th/2 + 4, r: 2.2, fill: '#f59e0b' }, g); createSVGElement('circle', { cx: -tw/2 + 2, cy: th/2 - 1, r: 2.2, fill: '#f59e0b' }, g); }
      if (isBlinkR) { createSVGElement('circle', { cx: tw/2 - 1, cy: -th/2 + 4, r: 2.2, fill: '#f59e0b' }, g); createSVGElement('circle', { cx: tw/2 - 2, cy: th/2 - 1, r: 2.2, fill: '#f59e0b' }, g); }

    } else if (type === 'bus') {
      const bw = w + 4; // Width 22
      const bh = h + 24; // Length 60
      // 1. Headlight beam
      createSVGElement('polygon', { points: `-8,-28 -18,-60 18,-60 8,-28`, fill: 'url(#headlight-beam)', opacity: isBraking ? 0.3 : 0.65 }, g);
      // 1b. Rubber Tires
      const btW = 4, btH = 10;
      createSVGElement('rect', { x: -bw/2 - 2, y: -bh/2 + 8, width: btW, height: btH, rx: 1.5, fill: '#1a1a1a' }, g);
      createSVGElement('rect', { x: bw/2 - 2,  y: -bh/2 + 8, width: btW, height: btH, rx: 1.5, fill: '#1a1a1a' }, g);
      createSVGElement('rect', { x: -bw/2 - 2, y: bh/2 - 18, width: btW, height: btH, rx: 1.5, fill: '#1a1a1a' }, g);
      createSVGElement('rect', { x: bw/2 - 2,  y: bh/2 - 18, width: btW, height: btH, rx: 1.5, fill: '#1a1a1a' }, g);
      createSVGElement('rect', { x: -bw/2 - 2, y: bh/2 - 32, width: btW, height: btH, rx: 1.5, fill: '#1a1a1a' }, g);
      createSVGElement('rect', { x: bw/2 - 2,  y: bh/2 - 32, width: btW, height: btH, rx: 1.5, fill: '#1a1a1a' }, g);
      // 2. Main Bus Body (Long, solid rectangle)
      createSVGElement('rect', { x: -bw/2, y: -bh/2, width: bw, height: bh, rx: 3, fill: bodyColor, stroke: '#3f3f46', strokeWidth: 0.8 }, g);
      // 3. Roof / AC Units
      createSVGElement('rect', { x: -bw/2 + 3, y: -bh/2 + 7, width: bw - 6, height: bh - 14, rx: 1.5, fill: 'rgba(255,255,255,0.2)', stroke: 'rgba(0,0,0,0.1)' }, g);
      createSVGElement('rect', { x: -bw/2 + 5, y: -bh/2 + 12, width: bw - 10, height: 7, rx: 1, fill: '#71717a' }, g); // Front AC
      createSVGElement('rect', { x: -bw/2 + 5, y: bh/2 - 16, width: bw - 10, height: 6, rx: 1, fill: '#64748b' }, g); // Rear AC
      // Windshield
      createSVGElement('rect', { x: -bw/2 + 1, y: -bh/2 + 1, width: bw - 2, height: 4, rx: 1, fill: 'url(#windshield-glass)' }, g);
      // Rear Window
      createSVGElement('rect', { x: -bw/2 + 1, y: bh/2 - 4, width: bw - 2, height: 3, rx: 1, fill: 'url(#windshield-glass)' }, g);
      // Lights
      createSVGElement('circle', { cx: -bw/2 + 3, cy: -bh/2 + 1, r: 2, fill: '#fef08a' }, g);
      createSVGElement('circle', { cx: bw/2 - 3, cy: -bh/2 + 1, r: 2, fill: '#fef08a' }, g);
      const brakeColor = isBraking ? '#ff1e1e' : '#991b1b';
      createSVGElement('rect', { x: -bw/2 + 1, y: bh/2 - 2, width: 4, height: 2, fill: brakeColor }, g);
      createSVGElement('rect', { x: bw/2 - 5, y: bh/2 - 2, width: 4, height: 2, fill: brakeColor }, g);
      if (isBraking) {
        createSVGElement('circle', { cx: -bw/2 + 3, cy: bh/2 - 1, r: 5, fill: '#ff1e1e', opacity: 0.4 }, g);
        createSVGElement('circle', { cx: bw/2 - 3, cy: bh/2 - 1, r: 5, fill: '#ff1e1e', opacity: 0.4 }, g);
      }
      // Indicators
      if (isBlinkL) { createSVGElement('circle', { cx: -bw/2 + 1, cy: -bh/2 + 2, r: 2.2, fill: '#f59e0b' }, g); createSVGElement('circle', { cx: -bw/2 + 2, cy: bh/2 - 2, r: 2.2, fill: '#f59e0b' }, g); }
      if (isBlinkR) { createSVGElement('circle', { cx: bw/2 - 1, cy: -bh/2 + 2, r: 2.2, fill: '#f59e0b' }, g); createSVGElement('circle', { cx: bw/2 - 2, cy: bh/2 - 2, r: 2.2, fill: '#f59e0b' }, g); }

    } else {
      // ── Standard Cars (sedan, suv, sports, taxi, van) ──
      // 1. Forward Headlight Beams
      createSVGElement('polygon', { points: `-7,-16 -16,-45 16,-45 7,-16`, fill: 'url(#headlight-beam)', opacity: isBraking ? 0.3 : 0.65 }, g);

      // 2. Rubber Tires
      const tireW = 4, tireH = 8;
      createSVGElement('rect', { x: -w/2 - 2, y: -h/2 + 5, width: tireW, height: tireH, rx: 1.5, fill: '#0a0a0a' }, g);
      createSVGElement('rect', { x: w/2 - 2,  y: -h/2 + 5, width: tireW, height: tireH, rx: 1.5, fill: '#0a0a0a' }, g);
      createSVGElement('rect', { x: -w/2 - 2, y: h/2 - 13, width: tireW, height: tireH, rx: 1.5, fill: '#0a0a0a' }, g);
      createSVGElement('rect', { x: w/2 - 2,  y: h/2 - 13, width: tireW, height: tireH, rx: 1.5, fill: '#0a0a0a' }, g);

      // 3. Chassis Body
      createSVGElement('rect', {
        x: -w/2, y: -h/2, width: w, height: h,
        rx: type === 'suv' ? 4 : type === 'sports' ? 6 : 5,
        fill: type === 'taxi' ? '#facc15' : bodyColor,
        stroke: '#374151', strokeWidth: 0.8,
      }, g);

      // 4. Roof & Glass Windshields
      createSVGElement('path', { d: `M ${-w/2+2} ${-h/2+9} L ${w/2-2} ${-h/2+9} L ${w/2-3} ${-h/2+15} L ${-w/2+3} ${-h/2+15} Z`, fill: 'url(#windshield-glass)' }, g);
      createSVGElement('rect', {
        x: -w/2+2.5, y: -h/2+14, width: w-5, height: h-23, rx: 2,
        fill: type === 'taxi' ? '#eab308' : bodyColor,
        stroke: 'rgba(0,0,0,0.15)', strokeWidth: 0.5,
      }, g);
      createSVGElement('path', { d: `M ${-w/2+3} ${h/2-8} L ${w/2-3} ${h/2-8} L ${w/2-2} ${h/2-4} L ${-w/2+2} ${h/2-4} Z`, fill: 'url(#windshield-glass)' }, g);

      // 5. Special Type Trims
      if (type === 'taxi') {
        createSVGElement('rect', { x: -4, y: -2, width: 8, height: 4, rx: 1, fill: '#ffffff', stroke: '#000', strokeWidth: 0.5 }, g);
      } else if (type === 'van') {
        createSVGElement('line', { x1: -w/2+4, y1: 2, x2: w/2-4, y2: 2, stroke: 'rgba(0,0,0,0.3)', strokeWidth: 1 }, g);
      }

      // 6. Front Headlights
      createSVGElement('circle', { cx: -w/2+3, cy: -h/2+1.5, r: 1.8, fill: '#fef08a' }, g);
      createSVGElement('circle', { cx: w/2-3,  cy: -h/2+1.5, r: 1.8, fill: '#fef08a' }, g);

      // 7. Rear Taillights / Brake Lights
      const brakeColor = isBraking ? '#ff1e1e' : '#991b1b';
      createSVGElement('circle', { cx: -w/2+3, cy: h/2-1.5, r: isBraking ? 2.4 : 1.8, fill: brakeColor }, g);
      createSVGElement('circle', { cx: w/2-3,  cy: h/2-1.5, r: isBraking ? 2.4 : 1.8, fill: brakeColor }, g);

      if (isBraking) {
        createSVGElement('circle', { cx: -w/2+3, cy: h/2-1.5, r: 4, fill: '#ff1e1e', opacity: 0.35 }, g);
        createSVGElement('circle', { cx: w/2-3,  cy: h/2-1.5, r: 4, fill: '#ff1e1e', opacity: 0.35 }, g);
      }

      // 8. Turn Indicators
      if (isBlinkL) {
        createSVGElement('circle', { cx: -w/2+1, cy: -h/2+1.5, r: 2.2, fill: '#f59e0b' }, g);
        createSVGElement('circle', { cx: -w/2+1, cy: h/2-1.5,  r: 2.2, fill: '#f59e0b' }, g);
      } else if (isBlinkR) {
        createSVGElement('circle', { cx: w/2-1, cy: -h/2+1.5, r: 2.2, fill: '#f59e0b' }, g);
        createSVGElement('circle', { cx: w/2-1, cy: h/2-1.5,  r: 2.2, fill: '#f59e0b' }, g);
      }
    }

    return g;
  }

  // ── Render Method (60 FPS with Delta-Time Physics) ────────
  function render(snapshot, dt = 0.016, speedMultiplier = 1.0) {
    if (!svg || !snapshot) return;

    // Update amber turn signal blink state (approx 1.8 Hz)
    blinkState = (Math.sin(performance.now() * 0.009) > 0);

    updateTrafficSignals(snapshot);
    updateQueueVehicles(snapshot, dt, speedMultiplier);
    updateDepartingVehicles(snapshot, dt, speedMultiplier);
    updateHUD(snapshot);

    prevSnapshot = snapshot;
  }

  // ── Update Signal Heads ───────────────────────────────────
  function updateTrafficSignals(snap) {
    // Bike lane lines stay permanently green — no color changes with traffic signals

    const LANES = ['North', 'South', 'East', 'West'];

    for (const lane of LANES) {
      const lights = signalLights[lane];
      if (!lights) continue;

      const isGreen = snap.phase === 'green' && snap.activeLane === lane;
      const isYellow = snap.phase === 'clearance' && snap.activeLane === lane;

      lights.red.setAttribute('fill', (!isGreen && !isYellow) ? THEME.lightRedOn : THEME.lightRedOff);
      lights.yellow.setAttribute('fill', isYellow ? THEME.lightYelOn : THEME.lightYelOff);
      lights.green.setAttribute('fill', isGreen ? THEME.lightGrnOn : THEME.lightGrnOff);

      if (isGreen) {
        lights.green.setAttribute('filter', 'url(#signal-glow)');
        lights.timer.textContent = String(snap.phaseTimer);
        lights.timer.setAttribute('fill', THEME.lightGrnOn);
      } else {
        lights.green.removeAttribute('filter');
      }

      if (isYellow) {
        lights.yellow.setAttribute('filter', 'url(#signal-glow)');
        lights.timer.textContent = String(snap.phaseTimer);
        lights.timer.setAttribute('fill', THEME.lightYelOn);
      } else {
        lights.yellow.removeAttribute('filter');
      }

      if (!isGreen && !isYellow) {
        lights.timer.textContent = '--';
        lights.timer.setAttribute('fill', THEME.lightRedOn);
      }
    }
  }

  // ── Unified Constant Vehicle Physics ───────────────────────
  const VEHICLE_SPEED = 75; // Constant speed (px/sec) in ALL situations: queue, arrival, straight & turning
  const ROUTE_DISTANCES = { straight: 412, left: 560, right: 520 };

  const visualVehicles = new Map();

  function updateQueueVehicles(snap, dt, speedMultiplier) {
    while (layers.queues.firstChild) {
      layers.queues.removeChild(layers.queues.firstChild);
    }

    const LANES = ['East', 'South', 'West', 'North'];
    const currentQueueIds = new Set();

    for (const lane of LANES) {
      const cfg = LANES_CONFIG[lane];
      const vehicles = (snap.laneQueues && snap.laneQueues[lane]) || [];
      const totalInQueue = snap.densities[lane] || 0;
      const isLaneGreen = snap.phase === 'green' && snap.activeLane === lane;

      const renderCount = Math.min(vehicles.length, MAX_VIS_QUEUE);
      let distSum = 0;
      for (let i = 0; i < renderCount; i++) {
        const v = vehicles[i];
        
        const V_LENGTHS = { 'sedan': 28, 'suv': 32, 'truck': 45, 'van': 35, 'bike': 18, 'bus': 60 };
        const vLen = V_LENGTHS[v.type || 'sedan'] || 28;
        
        // Final resting distance from the intersection stop line
        const targetD = distSum + vLen / 2;
        
        currentQueueIds.add(v.id);

        if (!visualVehicles.has(v.id)) {
          // Spawn vehicle smoothly behind the queue
          visualVehicles.set(v.id, { d: targetD + 160 });
        }

        const state = visualVehicles.get(v.id);

        // Car-following: constrain based on the vehicle immediately in front
        let minAllowedD = targetD;
        if (i > 0) {
          const frontV = vehicles[i-1];
          const frontState = visualVehicles.get(frontV.id);
          const frontLen = V_LENGTHS[frontV.type || 'sedan'] || 28;
          if (frontState) {
            // Must stay behind the front vehicle's center + half its length + half our length + gap
            const safeD = frontState.d + (frontLen / 2) + (vLen / 2) + CAR_GAP;
            minAllowedD = Math.max(targetD, safeD);
          }
        }

        // Move vehicle forward at constant unified VEHICLE_SPEED (no acceleration surges)
        if (state.d > minAllowedD) {
          const step = VEHICLE_SPEED * dt * speedMultiplier;
          state.d = Math.max(minAllowedD, state.d - step);
        } else {
          state.d = minAllowedD;
        }

        const pos = cfg.queuePos(state.d);

        // Apply brake lights if vehicle is stopped at its target position
        const isBraking = (!isLaneGreen || i > 0) && (state.d <= minAllowedD + 2);
        createDetailedCar(v, pos.x, pos.y, cfg.angle, isBraking, layers.queues);
        
        distSum += vLen + CAR_GAP;
      }
    }

    // Clean up vehicles that have departed or were removed
    for (const id of visualVehicles.keys()) {
      if (!currentQueueIds.has(id)) {
        visualVehicles.delete(id);
      }
    }
  }

  // ── Update Departing Vehicles with Constant Steady Speed ──
  let departureCooldown = 0;        // seconds until next vehicle can depart
  let pendingDepartures = [];       // vehicles waiting to be released one-by-one

  function updateDepartingVehicles(snap, dt, speedMultiplier) {
    // Collect newly cleared vehicles into the pending queue
    if (prevSnapshot && snap.totalVehiclesCleared > prevSnapshot.totalVehiclesCleared && snap.activeLane) {
      const clearedCount = snap.totalVehiclesCleared - prevSnapshot.totalVehiclesCleared;
      const queue = (prevSnapshot.laneQueues && prevSnapshot.laneQueues[snap.activeLane]) || [];

      for (let i = 0; i < Math.min(clearedCount, 2); i++) {
        const carMeta = queue[i] || {};
        pendingDepartures.push({
          lane: snap.activeLane,
          route: carMeta.route || 'straight',
          type: carMeta.type || 'sedan',
          colorVariant: carMeta.colorVariant != null ? carMeta.colorVariant : Math.floor(Math.random() * 5),
        });
      }
    }

    // Release one pending vehicle at a time with a steady 1-second headway gap
    departureCooldown -= dt * speedMultiplier;
    if (departureCooldown <= 0 && pendingDepartures.length > 0) {
      const car = pendingDepartures.shift();
      activeDepartures.push({
        ...car,
        u: 0.0,   // start smoothly right at the stop line
      });
      departureCooldown = 1.0;  // 1-second gap before next vehicle can proceed
    }

    // Redraw moving departures along their smooth curves
    while (layers.departures.firstChild) {
      layers.departures.removeChild(layers.departures.firstChild);
    }

    // Move all departures at the EXACT SAME constant linear speed as the queue (no acceleration surges)
    activeDepartures = activeDepartures.filter(dep => {
      const routeLen = ROUTE_DISTANCES[dep.route] || 412;
      const du = (VEHICLE_SPEED / routeLen) * dt * speedMultiplier;
      dep.u += du;

      if (dep.u >= 1.0) return false;

      // Sample trajectory directly at constant linear progression
      const state = sampleTrajectory(dep.lane, dep.route, dep.u);
      createDetailedCar(dep, state.x, state.y, state.angle, false, layers.departures);
      return true;
    });
  }

  // ── Update Live HUD Banner ────────────────────────────────
  function updateHUD(snap) {
    const elStatus = document.getElementById('hud-status-text');
    const elLane = document.getElementById('hud-lane-text');
    const elWaiting = document.getElementById('hud-waiting-text');
    const elTime = document.getElementById('hud-time-text');
    const elCircle = document.getElementById('hud-progress-circle');

    if (!elStatus) return;

    if (!snap || snap.phase === 'idle') {
      elStatus.textContent = 'IDLE';
      elStatus.className = 'text-xs font-data-mono-sm font-medium text-on-surface-variant';
      elLane.textContent = '—';
      elWaiting.textContent = '0';
      elTime.textContent = '0.0s';
      if (elCircle) {
        elCircle.setAttribute('stroke-dasharray', `0, 100`);
        elCircle.className = 'transition-all duration-300 text-success';
      }
      return;
    }

    let totalWaiting = 0;
    for (const d of Object.values(snap.densities)) totalWaiting += d;
    elWaiting.textContent = totalWaiting.toString();
    elLane.textContent = snap.activeLane || '—';

    if (snap.phase === 'green') {
      elStatus.textContent = 'GREEN';
      elStatus.className = 'text-xs font-data-mono-sm font-medium text-success animate-pulse';
      elTime.textContent = `${Math.ceil(snap.phaseTimer)}s`;

      if (elCircle) {
        const elapsed = snap.greenTimeTotal - snap.phaseTimer;
        const pct = Math.min(Math.max((elapsed / Math.max(snap.greenTimeTotal, 1)) * 100, 0), 100);
        elCircle.setAttribute('stroke-dasharray', `${pct}, 100`);
        elCircle.classList.remove('text-primary', 'text-warning');
        elCircle.classList.add('text-success');
      }
    } else if (snap.phase === 'clearance') {
      elStatus.textContent = 'YELLOW';
      elStatus.className = 'text-xs font-data-mono-sm font-medium text-warning';
      elTime.textContent = `${Math.ceil(snap.phaseTimer)}s`;

      if (elCircle) {
        const totalC = (snap.schedulerConfig && snap.schedulerConfig.clearanceInterval) || 2;
        const elapsed = totalC - snap.phaseTimer;
        const pct = Math.min(Math.max((elapsed / totalC) * 100, 0), 100);
        elCircle.setAttribute('stroke-dasharray', `${pct}, 100`);
        elCircle.classList.remove('text-primary', 'text-success');
        elCircle.classList.add('text-warning');
      }
    }
  }

  // ── Reset ─────────────────────────────────────────────────
  function reset() {
    activeDepartures = [];
    pendingDepartures = [];
    departureCooldown = 0;
    prevSnapshot = null;
  }

  // ── Public API ────────────────────────────────────────────
  return { init, render, reset };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Visualization;
}
