/**
 * app.js — Application Entry Point & Animation Loop
 *
 * Wires together:  Scheduler → Simulation → Visualization
 *                  + GanttChart + StatsPanel + Controls
 */

const App = (() => {

  // ── State ─────────────────────────────────────────────────
  let scheduler = null;
  let simulation = null;
  let running = false;
  let speed = 1.0;            
  let animFrameId = null;
  let lastFrameTime = null;
  let tickAccumulator = 0;
  let renderThrottle = 0;

  // ── Initialize ────────────────────────────────────────────
  function init() {
    scheduler = Scheduler.createScheduler({
      avgCrossingTime: 1.5,
      minGreen: 5,
      maxGreen: 30,
      clearanceInterval: 2,
      fixedQuantum: 15,
    }, Scheduler.MODE.VARIABLE);

    simulation = Simulation.createSimulation(scheduler, {
      arrivalRate: 0.15,
      avgCrossingTime: 1.5,
    });

    // Initialize all UI components
    Visualization.init('junction-canvas-container');
    GanttChart.init('gantt-content');
    StatsPanel.initStats('stats-content');
    StatsPanel.initLog('log-content');

    // Initialize controls with mode-change callback
    Controls.init(scheduler, simulation, (newMode) => {
      // Mode changed — update the overlay and badge
      const snap = simulation.getSnapshot();
      Visualization.render(snap, 0, speed);
      updateModeBadge(newMode);
    });

    // Wire up playback buttons
    document.getElementById('btn-start').addEventListener('click', start);
    document.getElementById('btn-pause').addEventListener('click', pause);
    document.getElementById('btn-reset').addEventListener('click', reset);
    document.getElementById('btn-step').addEventListener('click', stepOneCycle);

    // Speed slider (0.5x, 1x, 2x, 5x)
    const speedSlider = document.getElementById('speed-slider');
    const speedLabel  = document.getElementById('speed-value');
    const speedMap = [0.5, 1, 2, 5];
    if (speedSlider) {
      speedSlider.value = "1";
      if (speedLabel) speedLabel.textContent = "1.0× (Real-Time)";

      speedSlider.addEventListener('input', () => {
        const val = parseInt(speedSlider.value);
        speed = speedMap[val];
        if (speedLabel) speedLabel.textContent = `${speed}× ${speed === 1 ? '(Real-Time)' : ''}`;
      });
    }

    // CSV export button
    const exportBtn = document.getElementById('btn-export-csv');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        StatsPanel.exportCSV(simulation.getEventLog());
      });
    }

    // Render initial state
    const snap = simulation.getSnapshot();
    Visualization.render(snap, 0, speed);
    StatsPanel.updateStats(snap);
    updateModeBadge(scheduler.getMode());
    updateStatusBadge();

    console.log('[app] Initialized — real-time simulation ready');
  }

  // ── Mode & Status Badges ──────────────────────────────────
  function updateModeBadge(mode) {
    const badge = document.getElementById('sim-mode-badge');
    if (badge) {
      badge.textContent = mode === 'variable' ? 'Variable RR' : 'Fixed RR';
    }
  }

  function updateStatusBadge() {
    const badge = document.getElementById('junction-status-badge');
    if (badge) {
      if (running) {
        badge.textContent = 'RUNNING';
        badge.style.borderColor = 'rgba(46, 196, 182, 0.4)';
        badge.style.color = 'var(--success)';
      } else {
        badge.textContent = 'PAUSED';
        badge.style.borderColor = 'rgba(255, 183, 3, 0.4)';
        badge.style.color = 'var(--warning)';
      }
    }
  }

  // ── Real-Time 60 FPS Animation Loop ───────────────────────
  function gameLoop(timestamp) {
    if (!running) return;

    if (!lastFrameTime) lastFrameTime = timestamp;
    const dt = Math.min((timestamp - lastFrameTime) / 1000, 0.1);
    lastFrameTime = timestamp;

    // Real-time discrete tick accumulator
    tickAccumulator += dt * speed;
    let stepped = false;

    while (tickAccumulator >= 1.0) {
      simulation.step();
      tickAccumulator -= 1.0;
      stepped = true;
    }

    // High-frequency 60fps vector render with delta-time for smooth physics
    const snap = simulation.getSnapshot();
    Visualization.render(snap, dt, speed);

    // Update Gantt & Stats when tick progresses or throttled
    renderThrottle++;
    if (stepped || renderThrottle >= 10) {
      renderThrottle = 0;
      const eventLog = simulation.getEventLog();
      GanttChart.update(eventLog, snap.tick, scheduler.getConfig().clearanceInterval);
      StatsPanel.updateStats(snap);
      StatsPanel.updateLog(eventLog);
    }

    animFrameId = requestAnimationFrame(gameLoop);
  }

  // ── Controls ──────────────────────────────────────────────
  function start() {
    if (running) return;
    running = true;
    lastFrameTime = performance.now();
    tickAccumulator = 0;
    updateButtonStates();
    updateStatusBadge();
    animFrameId = requestAnimationFrame(gameLoop);
  }

  function pause() {
    running = false;
    updateButtonStates();
    updateStatusBadge();
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    const snap = simulation.getSnapshot();
    const eventLog = simulation.getEventLog();
    Visualization.render(snap, 0, speed);
    GanttChart.update(eventLog, snap.tick, scheduler.getConfig().clearanceInterval);
    StatsPanel.updateStats(snap);
    StatsPanel.updateLog(eventLog);
  }

  function reset() {
    pause();

    // Preserve current mode and rebuild
    const currentMode = scheduler.getMode();
    scheduler = Scheduler.createScheduler(
      scheduler.getConfig(),
      currentMode
    );
    simulation = Simulation.createSimulation(scheduler, simulation.getConfig());

    // Refresh controls to re-bind to new instances
    Controls.refresh(scheduler, simulation);

    Visualization.reset();
    GanttChart.reset();
    StatsPanel.reset();

    const snap = simulation.getSnapshot();
    Visualization.render(snap, 0, speed);
    StatsPanel.updateStats(snap);
    updateButtonStates();
    updateStatusBadge();
    updateModeBadge(currentMode);
    console.log('[app] Reset complete');
  }

  function stepOneCycle() {
    if (running) pause();

    const startDispatches = scheduler.getDispatchCount();
    let safety = 0;
    while (scheduler.getDispatchCount() - startDispatches < 4 && safety < 5000) {
      simulation.step();
      safety++;
    }

    const snap = simulation.getSnapshot();
    const eventLog = simulation.getEventLog();
    Visualization.render(snap, 0, speed);
    GanttChart.update(eventLog, snap.tick, scheduler.getConfig().clearanceInterval);
    StatsPanel.updateStats(snap);
    StatsPanel.updateLog(eventLog);
    updateStatusBadge();
  }

  function updateButtonStates() {
    const startBtn = document.getElementById('btn-start');
    const pauseBtn = document.getElementById('btn-pause');
    if (startBtn) startBtn.disabled = running;
    if (pauseBtn) pauseBtn.disabled = !running;
  }

  return {
    init, start, pause, reset,
    getSimulation: () => simulation,
    getScheduler:  () => scheduler,
    isRunning:     () => running,
  };

})();

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
