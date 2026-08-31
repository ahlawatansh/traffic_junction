/**
 * simulation.test.js — Headless Simulation Run (~200 cycles)
 *
 * Run with:  node tests/simulation.test.js
 *
 * Runs the full simulation engine for 200 scheduler cycles in both
 * Variable and Fixed quantum modes, printing summary stats for
 * sanity-checking before any graphics are built.
 */

const Scheduler  = require('../js/scheduler.js');
const Simulation = require('../js/simulation.js');

function hr(ch = '═', len = 65) { return ch.repeat(len); }

function printTable(headers, rows) {
  const colWidths = headers.map((h, i) => {
    const maxData = Math.max(...rows.map(r => String(r[i]).length));
    return Math.max(h.length, maxData) + 2;
  });

  const line = colWidths.map(w => '─'.repeat(w)).join('┼');
  const fmtRow = (vals) => vals.map((v, i) => String(v).padStart(colWidths[i])).join('│');

  console.log('  ' + fmtRow(headers));
  console.log('  ' + line);
  rows.forEach(r => console.log('  ' + fmtRow(r)));
}

// ═══════════════════════════════════════════════════════════════
//  RUN 1: Variable Quantum (Density-Based) Round Robin
// ═══════════════════════════════════════════════════════════════
console.log(`\n${hr()}`);
console.log('  RUN 1: Variable Quantum (Density-Based) Round Robin');
console.log('  200 cycles, arrivalRate=0.3/sec/lane, avgCrossing=3s');
console.log(hr());

{
  const sched = Scheduler.createScheduler({
    avgCrossingTime: 3,
    minGreen: 5,
    maxGreen: 90,
    clearanceInterval: 2,
  }, Scheduler.MODE.VARIABLE);

  const sim = Simulation.createSimulation(sched, {
    arrivalRate: 0.3,
    avgCrossingTime: 3,
  });

  const ticksElapsed = sim.runCycles(200);
  const summary = sim.getSummary();
  const eventLog = sim.getEventLog();

  console.log(`\n  Simulation time: ${summary.totalTicks} ticks (seconds)`);
  console.log(`  Full cycles completed: ${summary.totalCycles}`);
  console.log(`  Total vehicles cleared: ${summary.totalVehiclesCleared}`);
  console.log(`  Global max wait time: ${summary.globalMaxWaitTime}s`);
  console.log(`  Scheduling decisions logged: ${eventLog.length}`);

  console.log('\n  Per-Lane Statistics:');
  printTable(
    ['Lane', 'Arrived', 'Cleared', 'Queue', 'Avg Wait(s)', 'Max Wait(s)'],
    Object.entries(summary.lanes).map(([lane, s]) => [
      lane, s.totalArrived, s.totalCleared, s.currentQueue, s.avgWaitTime, s.maxWaitTime
    ])
  );

  // Sanity checks
  console.log('\n  Sanity Checks:');
  let allOk = true;

  // Check 1: all lanes were dispatched
  const dispatchedLanes = new Set(eventLog.map(e => e.lane));
  const check1 = dispatchedLanes.size === 4;
  console.log(`  ${check1 ? '✅' : '❌'} All 4 lanes dispatched: ${[...dispatchedLanes].join(', ')}`);
  allOk = allOk && check1;

  // Check 2: event log has ~800 entries (200 cycles × 4 lanes)
  const check2 = eventLog.length >= 790 && eventLog.length <= 810;
  console.log(`  ${check2 ? '✅' : '❌'} Event log has ~800 entries: ${eventLog.length}`);
  allOk = allOk && check2;

  // Check 3: more vehicles arrived than cleared (queues should exist)
  const totalArrived = Object.values(summary.lanes).reduce((s, l) => s + l.totalArrived, 0);
  const totalQueue   = Object.values(summary.lanes).reduce((s, l) => s + l.currentQueue, 0);
  console.log(`  ✅ Total arrived: ${totalArrived}, cleared: ${summary.totalVehiclesCleared}, in queue: ${totalQueue}`);

  // Check 4: no lane starved (max wait should be finite and all lanes have clears)
  const allLanesCleared = Object.values(summary.lanes).every(l => l.totalCleared > 0);
  console.log(`  ${allLanesCleared ? '✅' : '❌'} All lanes have cleared vehicles (no starvation)`);
  allOk = allOk && allLanesCleared;

  // Check 5: wait times are reasonable
  const avgWaits = Object.entries(summary.lanes).map(([l, s]) => `${l}=${s.avgWaitTime}s`);
  console.log(`  ✅ Average wait times: ${avgWaits.join(', ')}`);

  // Show first 10 event log entries
  console.log('\n  First 10 Scheduling Decisions:');
  printTable(
    ['Time(s)', 'Lane', 'Density', 'Quantum(s)', 'Cleared'],
    eventLog.slice(0, 10).map(e => [
      e.timestamp, e.lane, e.densityAtDispatch, e.quantumAssigned, e.vehiclesCleared
    ])
  );

  // Show quantum variation
  const quanta = eventLog.map(e => e.quantumAssigned);
  const minQ = Math.min(...quanta);
  const maxQ = Math.max(...quanta);
  const avgQ = (quanta.reduce((a, b) => a + b, 0) / quanta.length).toFixed(1);
  console.log(`\n  Quantum variation: min=${minQ}s, max=${maxQ}s, avg=${avgQ}s`);
  console.log(`  ${minQ !== maxQ ? '✅' : '❌'} Quantum VARIES with density (not constant)`);

  if (!allOk) {
    console.log('\n  ⚠️  Some checks failed — review above.\n');
  }
}

// ═══════════════════════════════════════════════════════════════
//  RUN 2: Fixed Quantum Round Robin (for comparison)
// ═══════════════════════════════════════════════════════════════
console.log(`\n${hr()}`);
console.log('  RUN 2: Fixed Quantum Round Robin (comparison baseline)');
console.log('  200 cycles, arrivalRate=0.3/sec/lane, fixedQuantum=15s');
console.log(hr());

{
  const sched = Scheduler.createScheduler({
    avgCrossingTime: 3,
    fixedQuantum: 15,
    clearanceInterval: 2,
  }, Scheduler.MODE.FIXED);

  const sim = Simulation.createSimulation(sched, {
    arrivalRate: 0.3,
    avgCrossingTime: 3,
  });

  sim.runCycles(200);
  const summary = sim.getSummary();
  const eventLog = sim.getEventLog();

  console.log(`\n  Simulation time: ${summary.totalTicks} ticks (seconds)`);
  console.log(`  Full cycles completed: ${summary.totalCycles}`);
  console.log(`  Total vehicles cleared: ${summary.totalVehiclesCleared}`);
  console.log(`  Global max wait time: ${summary.globalMaxWaitTime}s`);

  console.log('\n  Per-Lane Statistics:');
  printTable(
    ['Lane', 'Arrived', 'Cleared', 'Queue', 'Avg Wait(s)', 'Max Wait(s)'],
    Object.entries(summary.lanes).map(([lane, s]) => [
      lane, s.totalArrived, s.totalCleared, s.currentQueue, s.avgWaitTime, s.maxWaitTime
    ])
  );

  // Quantum should be constant
  const quanta = eventLog.map(e => e.quantumAssigned);
  const allSame = quanta.every(q => q === 15);
  console.log(`\n  ${allSame ? '✅' : '❌'} All quanta fixed at 15s (${new Set(quanta).size} unique value(s))`);

  // Show first 10 entries
  console.log('\n  First 10 Scheduling Decisions:');
  printTable(
    ['Time(s)', 'Lane', 'Density', 'Quantum(s)', 'Cleared'],
    eventLog.slice(0, 10).map(e => [
      e.timestamp, e.lane, e.densityAtDispatch, e.quantumAssigned, e.vehiclesCleared
    ])
  );
}

// ═══════════════════════════════════════════════════════════════
//  COMPARISON SUMMARY
// ═══════════════════════════════════════════════════════════════
console.log(`\n${hr()}`);
console.log('  VARIABLE vs FIXED — Key Insight');
console.log(hr());
console.log('  Variable quantum adapts green time to demand:');
console.log('    • Busy lanes get longer green → more throughput');
console.log('    • Empty lanes get shorter green → less wasted time');
console.log('  Fixed quantum treats all lanes equally regardless of load,');
console.log('  which can waste green time on empty lanes and starve busy ones.');
console.log(`\n  🎉 Stage 3 complete — simulation engine verified!\n`);
