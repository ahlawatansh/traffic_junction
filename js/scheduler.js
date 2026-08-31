/**
 * scheduler.js — Round Robin Scheduler Logic
 *
 * CPU Scheduling ↔ Traffic Mapping:
 *   - Process        → Lane (East, South, West, North)
 *   - Burst time     → Vehicle density (queue length)
 *   - Time quantum   → Green-light duration
 *   - Context switch → Yellow/all-red clearance interval
 *   - Ready queue    → Fixed cyclic order: E → S → W → N → E …
 *
 * Two scheduling modes:
 *   1. Fixed Quantum RR   — every lane gets the same green duration
 *   2. Variable (Density)  — green_time = clamp(avg_cross * density, min, max)
 */

const Scheduler = (() => {

  // ── Lane definitions (fixed cyclic dispatch order) ──────────────
  const LANES = ['East', 'South', 'West', 'North'];
  const LANE_COUNT = LANES.length;

  // ── Default parameters ─────────────────────────────────────────
  const DEFAULTS = {
    avgCrossingTime: 3,    // seconds per vehicle
    minGreen: 5,           // minimum green duration (seconds)
    maxGreen: 50,          // maximum green duration (seconds)
    fixedQuantum: 15,      // fixed green for Fixed-RR mode (seconds)
    clearanceInterval: 2,  // yellow/all-red between phases (seconds)
  };

  // ── Scheduling modes ──────────────────────────────────────────
  const MODE = Object.freeze({
    FIXED:    'fixed',
    VARIABLE: 'variable',
  });

  // ── Clamp utility ─────────────────────────────────────────────
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // ── Compute green time for a lane ─────────────────────────────
  /**
   * Variable quantum formula:
   *   green_time = clamp(avgCrossingTime × density, minGreen, maxGreen)
   *
   * Fixed quantum:
   *   green_time = fixedQuantum  (constant, ignores density)
   *
   * @param {number} density       — current queue length for the lane
   * @param {object} params        — { avgCrossingTime, minGreen, maxGreen, fixedQuantum }
   * @param {string} mode          — 'fixed' | 'variable'
   * @returns {number} green duration in seconds
   */
  function computeGreenTime(density, params, mode) {
    const p = { ...DEFAULTS, ...params };

    if (mode === MODE.FIXED) {
      return p.fixedQuantum;
    }

    // Variable (density-based) quantum
    const raw = p.avgCrossingTime * density;
    return Math.round(clamp(raw, p.minGreen, p.maxGreen));
  }

  // ── Scheduler state machine ───────────────────────────────────
  /**
   * Creates a new scheduler instance.
   *
   * The scheduler cycles through lanes in fixed order (E→S→W→N),
   * assigning each a green phase followed by a clearance interval.
   *
   * @param {object} [params]  — override any DEFAULTS
   * @param {string} [mode]    — 'fixed' | 'variable'
   */
  function createScheduler(params = {}, mode = MODE.VARIABLE) {
    const config = { ...DEFAULTS, ...params };
    let currentLaneIndex = 0;
    let currentMode = mode;
    let cycleCount = 0;            // how many full 4-lane cycles completed
    let dispatchCount = 0;         // total individual lane dispatches
    const dispatchHistory = [];    // log of every dispatch decision

    /**
     * Dispatch the next lane.
     *
     * @param {object} densities — { East: n, South: n, West: n, North: n }
     * @returns {object} dispatch record
     */
    function dispatch(densities) {
      const lane = LANES[currentLaneIndex];
      const density = densities[lane] || 0;
      const greenTime = computeGreenTime(density, config, currentMode);

      const record = {
        dispatchIndex: dispatchCount,
        lane,
        laneIndex: currentLaneIndex,
        density,
        greenTime,
        clearanceTime: config.clearanceInterval,
        totalPhaseTime: greenTime + config.clearanceInterval,
        mode: currentMode,
        cycle: Math.floor(dispatchCount / LANE_COUNT),
      };

      dispatchHistory.push(record);
      dispatchCount++;

      // Advance to next lane in cyclic order
      currentLaneIndex = (currentLaneIndex + 1) % LANE_COUNT;

      // Track full cycles
      if (currentLaneIndex === 0) {
        cycleCount++;
      }

      return record;
    }

    /**
     * Peek at which lane is next without advancing.
     */
    function peekNextLane() {
      return LANES[currentLaneIndex];
    }

    /**
     * Run a full cycle (all 4 lanes) and return the 4 dispatch records.
     */
    function runFullCycle(densities) {
      const records = [];
      for (let i = 0; i < LANE_COUNT; i++) {
        records.push(dispatch(densities));
      }
      return records;
    }

    // Public interface
    return {
      dispatch,
      peekNextLane,
      runFullCycle,

      getConfig:       () => ({ ...config }),
      getMode:         () => currentMode,
      setMode:         (m) => { currentMode = m; },
      getCycleCount:   () => cycleCount,
      getDispatchCount:() => dispatchCount,
      getHistory:      () => [...dispatchHistory],

      updateConfig: (overrides) => {
        Object.assign(config, overrides);
      },
    };
  }

  // ── Public API ────────────────────────────────────────────────
  return {
    LANES,
    LANE_COUNT,
    DEFAULTS,
    MODE,
    clamp,
    computeGreenTime,
    createScheduler,
  };

})();

// Export for Node.js test runner (harmless in browser)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Scheduler;
}
