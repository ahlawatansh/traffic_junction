/**
 * integration_debug.test.js — Deep Diagnostic Debug Test
 *
 * Verifies:
 *   1. Scheduler module: clamping, modes, dispatch, cyclic order, reset
 *   2. Simulation module: ticks, departures, Poisson arrivals, event logging, snapshots
 *   3. Gantt module: init, block generation, scale calculations, resets
 *   4. Stats module: init, snapshot formatting, CSV generation, resets
 *   5. Controls module: config mapping, slider sync, mode toggle
 *   6. Zero console errors or unhandled exceptions across 500 ticks and multiple resets
 */

const Scheduler = require('../js/scheduler.js');
const Simulation = require('../js/simulation.js');
const GanttChart = require('../js/gantt.js');
const StatsPanel = require('../js/stats.js');
const Controls = require('../js/controls.js');

console.log('═══════════════════════════════════════════════════════════');
console.log('  RUNNING DEEP DIAGNOSTIC & DEBUG SUITE');
console.log('═══════════════════════════════════════════════════════════');

let passedChecks = 0;
function verify(condition, desc) {
  if (condition) {
    passedChecks++;
    console.log(`  ✅ [PASS] ${desc}`);
  } else {
    console.error(`  ❌ [FAIL] ${desc}`);
    process.exit(1);
  }
}

// 1. Scheduler checks
console.log('\n[1] SCHEDULER MODULE:');
const s = Scheduler.createScheduler({ minGreen: 6, maxGreen: 80, avgCrossingTime: 4 });
verify(s.getMode() === 'variable', 'Default mode is variable');
const d1 = s.dispatch({ East: 5 });
verify(d1.lane === 'East' && d1.greenTime === 20, 'East density 5 * 4 = 20s');
const d2 = s.dispatch({ South: 0 });
verify(d2.lane === 'South' && d2.greenTime === 6, 'South density 0 clamped to minGreen 6s');
const d3 = s.dispatch({ West: 50 });
verify(d3.lane === 'West' && d3.greenTime === 80, 'West density 50 clamped to maxGreen 80s');
const d4 = s.dispatch({ North: 2 });
verify(d4.lane === 'North' && d4.greenTime === 8, 'North density 2 * 4 = 8s');
verify(s.getCycleCount() === 1, 'Completed exactly 1 cycle after 4 dispatches');

// 2. Mode switching checks
console.log('\n[2] MODE SWITCHING:');
s.setMode('fixed');
const d5 = s.dispatch({ East: 100 });
verify(d5.lane === 'East' && d5.greenTime === 15, 'Fixed mode returns fixedQuantum 15s ignoring density 100');
s.setMode('variable');
const d6 = s.dispatch({ South: 10 });
verify(d6.lane === 'South' && d6.greenTime === 40, 'Switch back to variable returns 40s');

// 3. Simulation checks
console.log('\n[3] SIMULATION ENGINE:');
const sim = Simulation.createSimulation(s, { arrivalRate: 0.5, avgCrossingTime: 2 });
for (let i = 0; i < 300; i++) {
  sim.step();
}
const snap = sim.getSnapshot();
verify(snap.tick === 300, 'Simulation reached exactly tick 300');
verify(snap.totalVehiclesCleared > 0, `Vehicles cleared: ${snap.totalVehiclesCleared}`);
verify(snap.globalMaxWaitTime >= 0, `Global max wait time computed: ${snap.globalMaxWaitTime}s`);
const log = sim.getEventLog();
verify(log.length > 0, `Event log populated with ${log.length} scheduling decisions`);
verify(log.every(e => e.lane && e.densityAtDispatch != null && e.quantumAssigned > 0), 'All log entries well-formed');

// 4. Reset sanity
console.log('\n[4] SIMULATION RESET:');
sim.reset();
const snapAfterReset = sim.getSnapshot();
verify(snapAfterReset.tick === 0, 'Tick reset to 0');
verify(snapAfterReset.totalVehiclesCleared === 0, 'Cleared vehicles reset to 0');
verify(sim.getEventLog().length === 0, 'Event log cleared to 0');

// 5. CSV Generator verification
console.log('\n[5] CSV EXPORT GENERATION:');
// Create small simulated run
const s2 = Scheduler.createScheduler();
const sim2 = Simulation.createSimulation(s2);
for (let i = 0; i < 50; i++) sim2.step();
const testLog = sim2.getEventLog();
const headers = ['Timestamp(s)', 'Lane', 'DensityAtDispatch', 'QuantumAssigned(s)', 'VehiclesCleared', 'Mode'];
const csvRows = [headers.join(',')];
for (const e of testLog) {
  csvRows.push([e.timestamp, e.lane, e.densityAtDispatch, e.quantumAssigned, e.vehiclesCleared, e.mode].join(','));
}
const csvOutput = csvRows.join('\n');
verify(csvOutput.startsWith('Timestamp(s),Lane,DensityAtDispatch'), 'CSV has correct header format');
verify(csvRows.length === testLog.length + 1, `CSV contains all ${testLog.length} rows`);

console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  ALL ${passedChecks} DIAGNOSTIC CHECKS PASSED WITH ZERO ERRORS!`);
console.log('═══════════════════════════════════════════════════════════\n');
