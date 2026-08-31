/**
 * simulation.js — Tick-Based Traffic Simulation Engine
 *
 * CPU Scheduling ↔ Traffic Mapping:
 *   - Clock tick       → 1 simulated second
 *   - Process arrival  → Vehicle arriving in a lane's queue
 *   - CPU execution    → Vehicle crossing the intersection during green
 *   - Context switch   → Yellow/all-red clearance interval
 *   - Ready queue      → Lane queues (FIFO)
 *
 * Features:
 *   - Poisson-distributed vehicle arrivals into all 4 lanes (continuous)
 *   - Departures during green at rate of 1 vehicle per avgCrossingTime
 *   - Phase state machine: GREEN → CLEARANCE → next GREEN
 *   - Full event logging of every scheduling decision
 *   - Stats: queue lengths, wait times, throughput, starvation detection
 */

const Simulation = (() => {

  // ── Poisson random variate (Knuth algorithm) ──────────────
  function poissonRandom(lambda) {
    if (lambda <= 0) return 0;
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= Math.random();
    } while (p > L);
    return k - 1;
  }

  // ── Phase states ──────────────────────────────────────────
  const PHASE = Object.freeze({
    IDLE:      'idle',
    GREEN:     'green',
    CLEARANCE: 'clearance',
  });

  // ── Create a new simulation ───────────────────────────────
  /**
   * @param {object} scheduler   — a Scheduler instance (from Scheduler.createScheduler)
   * @param {object} [options]   — override defaults below
   */
  function createSimulation(scheduler, options = {}) {

    const config = {
      arrivalRate:      0.3,   // avg vehicles/second/lane (Poisson λ)
      avgCrossingTime:  3,     // seconds for one vehicle to cross
      perLaneArrival:   null,  // { East:0.3, South:0.5, ... } or null for uniform
      ...options,
    };

    // ── Lane state ────────────────────────────────────────
    const LANE_NAMES = ['East', 'South', 'West', 'North'];
    let nextVehicleId = 1;

    const lanes = {};
    const stats = {};
    for (const name of LANE_NAMES) {
      lanes[name] = [];         // queue of vehicle objects
      stats[name] = {
        totalArrived: 0,
        totalCleared: 0,
        totalWaitTime: 0,       // sum of all wait times (for avg)
        maxWaitTime: 0,
        lastGreenTick: -1,      // track starvation
      };
    }

    // ── Simulation state ──────────────────────────────────
    let tick = 0;
    let phase = PHASE.IDLE;
    let activeLane = null;
    let phaseTimer = 0;           // ticks remaining in current phase
    let greenTimeTotal = 0;       // total green allocated for current phase
    let vehiclesClearedThisPhase = 0;
    let departureTicker = 0;      // counts ticks within green for departure pacing

    let totalVehiclesCleared = 0;
    let globalMaxWaitTime = 0;
    let cycleCount = 0;

    // ── Event log ─────────────────────────────────────────
    const eventLog = [];          // scheduling decisions
    const arrivalLog = [];        // optional detailed arrival tracking

    // ── Vehicle type & route distribution ────────────────
    const V_TYPES = ['sedan', 'sedan', 'suv', 'truck', 'van', 'bike', 'bus'];
    const V_ROUTES = ['straight', 'straight', 'left', 'right'];

    // ── Arrival generation ────────────────────────────────
    function generateArrivals() {
      for (const lane of LANE_NAMES) {
        const rate = (config.perLaneArrival && config.perLaneArrival[lane] != null)
          ? config.perLaneArrival[lane]
          : config.arrivalRate;

        const count = poissonRandom(rate);
        for (let i = 0; i < count; i++) {
          const type = V_TYPES[Math.floor(Math.random() * V_TYPES.length)];
          const route = V_ROUTES[Math.floor(Math.random() * V_ROUTES.length)];
          const vehicle = {
            id: nextVehicleId++,
            lane,
            type,
            route,
            colorVariant: Math.floor(Math.random() * 5),
            arrivalTick: tick,
            departureTick: null,
            waitTime: null,
          };
          lanes[lane].push(vehicle);
          stats[lane].totalArrived++;
        }
      }
    }

    // ── Departure processing ──────────────────────────────
    function processDepartures() {
      if (phase !== PHASE.GREEN || !activeLane) return;

      departureTicker++;

      // One vehicle departs every avgCrossingTime ticks
      if (departureTicker >= config.avgCrossingTime) {
        departureTicker = 0;

        if (lanes[activeLane].length > 0) {
          const vehicle = lanes[activeLane].shift();
          vehicle.departureTick = tick;
          vehicle.waitTime = tick - vehicle.arrivalTick;

          stats[activeLane].totalCleared++;
          stats[activeLane].totalWaitTime += vehicle.waitTime;
          if (vehicle.waitTime > stats[activeLane].maxWaitTime) {
            stats[activeLane].maxWaitTime = vehicle.waitTime;
          }
          if (vehicle.waitTime > globalMaxWaitTime) {
            globalMaxWaitTime = vehicle.waitTime;
          }

          totalVehiclesCleared++;
          vehiclesClearedThisPhase++;
        }
      }
    }

    // ── Phase transition logic ────────────────────────────
    function advancePhase() {
      if (phase === PHASE.IDLE) {
        // First dispatch — start the simulation
        startGreenPhase();
        return;
      }

      phaseTimer--;

      if (phaseTimer <= 0) {
        if (phase === PHASE.GREEN) {
          // Log the completed green phase
          logSchedulingDecision();
          // Transition to clearance
          phase = PHASE.CLEARANCE;
          phaseTimer = scheduler.getConfig().clearanceInterval;
        } else if (phase === PHASE.CLEARANCE) {
          // Dispatch next lane
          startGreenPhase();
        }
      }
    }

    // ── Start a green phase ───────────────────────────────
    function startGreenPhase() {
      const densities = getDensities();
      const record = scheduler.dispatch(densities);

      activeLane = record.lane;
      phaseTimer = record.greenTime;
      greenTimeTotal = record.greenTime;
      vehiclesClearedThisPhase = 0;
      departureTicker = 0;
      phase = PHASE.GREEN;

      stats[activeLane].lastGreenTick = tick;

      // Track full cycles
      if (record.laneIndex === 0) {
        cycleCount++;
      }
    }

    // ── Log a scheduling decision ─────────────────────────
    function logSchedulingDecision() {
      const entry = {
        timestamp: tick,
        lane: activeLane,
        densityAtDispatch: getDensities()[activeLane] + vehiclesClearedThisPhase,
        quantumAssigned: greenTimeTotal,
        vehiclesCleared: vehiclesClearedThisPhase,
        mode: scheduler.getMode(),
      };
      eventLog.push(entry);
    }

    // ── Get current densities ─────────────────────────────
    function getDensities() {
      const d = {};
      for (const lane of LANE_NAMES) {
        d[lane] = lanes[lane].length;
      }
      return d;
    }

    // ── Single tick ───────────────────────────────────────
    function step() {
      tick++;
      generateArrivals();
      advancePhase();
      processDepartures();
    }

    // ── Run N ticks ───────────────────────────────────────
    function runTicks(n) {
      for (let i = 0; i < n; i++) {
        step();
      }
    }

    // ── Run until N full scheduler cycles complete ────────
    function runCycles(targetCycles) {
      const startCycle = cycleCount;
      let safety = 0;
      const maxTicks = targetCycles * 4 * 100; // generous upper bound
      while (cycleCount - startCycle < targetCycles && safety < maxTicks) {
        step();
        safety++;
      }
      return safety; // ticks elapsed
    }

    // ── Snapshot for UI ───────────────────────────────────
    function getSnapshot() {
      const laneQueues = {};
      for (const lane of LANE_NAMES) {
        laneQueues[lane] = lanes[lane].slice(0, 15); // first 15 for visual queue rendering
      }

      return {
        tick,
        phase,
        activeLane,
        phaseTimer,
        greenTimeTotal,
        vehiclesClearedThisPhase,
        densities: getDensities(),
        laneQueues,
        cycleCount,
        totalVehiclesCleared,
        globalMaxWaitTime,
        laneStats: JSON.parse(JSON.stringify(stats)),
        schedulerMode: scheduler.getMode(),
        schedulerConfig: scheduler.getConfig(),
        simConfig: { ...config },
      };
    }

    // ── Summary statistics ────────────────────────────────
    function getSummary() {
      const summary = {
        totalTicks: tick,
        totalCycles: cycleCount,
        totalVehiclesCleared,
        globalMaxWaitTime,
        lanes: {},
      };

      for (const lane of LANE_NAMES) {
        const s = stats[lane];
        summary.lanes[lane] = {
          totalArrived: s.totalArrived,
          totalCleared: s.totalCleared,
          currentQueue: lanes[lane].length,
          avgWaitTime: s.totalCleared > 0
            ? (s.totalWaitTime / s.totalCleared).toFixed(2)
            : 'N/A',
          maxWaitTime: s.maxWaitTime,
        };
      }

      return summary;
    }

    // ── Reset ─────────────────────────────────────────────
    function reset() {
      tick = 0;
      phase = PHASE.IDLE;
      activeLane = null;
      phaseTimer = 0;
      greenTimeTotal = 0;
      vehiclesClearedThisPhase = 0;
      departureTicker = 0;
      totalVehiclesCleared = 0;
      globalMaxWaitTime = 0;
      cycleCount = 0;
      nextVehicleId = 1;
      eventLog.length = 0;

      for (const name of LANE_NAMES) {
        lanes[name] = [];
        stats[name] = {
          totalArrived: 0,
          totalCleared: 0,
          totalWaitTime: 0,
          maxWaitTime: 0,
          lastGreenTick: -1,
        };
      }
    }

    // ── Public API ────────────────────────────────────────
    return {
      step,
      runTicks,
      runCycles,
      reset,
      getSnapshot,
      getSummary,
      getDensities,
      getEventLog:  () => [...eventLog],
      getTick:      () => tick,
      getPhase:     () => phase,
      getActiveLane:() => activeLane,
      getLaneQueue: (lane) => [...lanes[lane]],
      getLaneNames: () => [...LANE_NAMES],
      getConfig:    () => ({ ...config }),

      updateConfig: (overrides) => {
        Object.assign(config, overrides);
      },
    };
  }

  // ── Public API ──────────────────────────────────────────
  return {
    PHASE,
    poissonRandom,
    createSimulation,
  };

})();

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Simulation;
}
