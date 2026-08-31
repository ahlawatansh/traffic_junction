/**
 * scheduler.test.js — Unit tests for the Round Robin Scheduler
 *
 * Run with:  node tests/scheduler.test.js
 *
 * Tests cover:
 *   1. Variable quantum formula correctness (clamp behavior)
 *   2. Fixed quantum ignores density
 *   3. Cyclic dispatch order (E → S → W → N)
 *   4. No-starvation guarantee: every lane dispatched at least once per 4 dispatches
 *   5. Clearance interval is always applied
 *   6. Edge cases: zero density, very high density
 *   7. Mode switching mid-run
 *   8. Multiple full cycles with varying densities
 */

const Scheduler = require('../js/scheduler.js');

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, testName, detail = '') {
  if (condition) {
    passed++;
    results.push({ status: '✅ PASS', testName });
  } else {
    failed++;
    results.push({ status: '❌ FAIL', testName, detail });
    console.error(`  ❌ FAIL: ${testName}${detail ? ' — ' + detail : ''}`);
  }
}

function section(title) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

// ─────────────────────────────────────────────────────────────
section('TEST 1: Variable Quantum Formula');
// ─────────────────────────────────────────────────────────────
{
  // With defaults: avgCross=3, minGreen=5, maxGreen=50

  // density=0 → raw=0, clamped to minGreen=5
  const g0 = Scheduler.computeGreenTime(0, {}, Scheduler.MODE.VARIABLE);
  assert(g0 === 5, 'density=0 → green=minGreen(5)', `got ${g0}`);

  // density=1 → raw=3, clamped to minGreen=5
  const g1 = Scheduler.computeGreenTime(1, {}, Scheduler.MODE.VARIABLE);
  assert(g1 === 5, 'density=1 → raw=3, clamped to minGreen(5)', `got ${g1}`);

  // density=2 → raw=6, within range → 6
  const g2 = Scheduler.computeGreenTime(2, {}, Scheduler.MODE.VARIABLE);
  assert(g2 === 6, 'density=2 → green=6', `got ${g2}`);

  // density=10 → raw=30 → 30
  const g10 = Scheduler.computeGreenTime(10, {}, Scheduler.MODE.VARIABLE);
  assert(g10 === 30, 'density=10 → green=30', `got ${g10}`);

  // density=20 → raw=60, clamped to maxGreen=50
  const g20 = Scheduler.computeGreenTime(20, {}, Scheduler.MODE.VARIABLE);
  assert(g20 === 50, 'density=20 → raw=60, clamped to maxGreen(50)', `got ${g20}`);

  // density=50 → raw=150, clamped to maxGreen=50
  const g50 = Scheduler.computeGreenTime(50, {}, Scheduler.MODE.VARIABLE);
  assert(g50 === 50, 'density=50 → raw=150, clamped to maxGreen(50)', `got ${g50}`);

  // Custom params: avgCross=2, minGreen=10, maxGreen=40
  const gCustom = Scheduler.computeGreenTime(15, {
    avgCrossingTime: 2, minGreen: 10, maxGreen: 40
  }, Scheduler.MODE.VARIABLE);
  assert(gCustom === 30, 'custom params: density=15, avg=2 → raw=30 (within 10–40)', `got ${gCustom}`);

  const gCustomClamped = Scheduler.computeGreenTime(25, {
    avgCrossingTime: 2, minGreen: 10, maxGreen: 40
  }, Scheduler.MODE.VARIABLE);
  assert(gCustomClamped === 40, 'custom params: density=25, avg=2 → raw=50, clamped to 40', `got ${gCustomClamped}`);
}

// ─────────────────────────────────────────────────────────────
section('TEST 2: Fixed Quantum Ignores Density');
// ─────────────────────────────────────────────────────────────
{
  const densities = [0, 1, 5, 10, 50, 100];
  let allSame = true;
  for (const d of densities) {
    const g = Scheduler.computeGreenTime(d, { fixedQuantum: 15 }, Scheduler.MODE.FIXED);
    if (g !== 15) allSame = false;
  }
  assert(allSame, 'Fixed mode: all densities produce fixedQuantum=15');

  // Custom fixed quantum
  const g = Scheduler.computeGreenTime(999, { fixedQuantum: 22 }, Scheduler.MODE.FIXED);
  assert(g === 22, 'Fixed mode: custom fixedQuantum=22 used regardless of density=999', `got ${g}`);
}

// ─────────────────────────────────────────────────────────────
section('TEST 3: Cyclic Dispatch Order (E → S → W → N)');
// ─────────────────────────────────────────────────────────────
{
  const sched = Scheduler.createScheduler();
  const densities = { East: 5, South: 8, West: 3, North: 10 };
  const expectedOrder = ['East', 'South', 'West', 'North', 'East', 'South', 'West', 'North'];
  const actualOrder = [];

  for (let i = 0; i < 8; i++) {
    const rec = sched.dispatch(densities);
    actualOrder.push(rec.lane);
  }

  assert(
    JSON.stringify(actualOrder) === JSON.stringify(expectedOrder),
    'Dispatch order over 2 cycles: E→S→W→N→E→S→W→N',
    `got ${actualOrder.join('→')}`
  );
}

// ─────────────────────────────────────────────────────────────
section('TEST 4: No-Starvation Guarantee');
// ─────────────────────────────────────────────────────────────
{
  // Run 20 cycles (80 dispatches) with wildly varying densities.
  // Every lane must appear at least once in every window of 4 consecutive dispatches.
  const sched = Scheduler.createScheduler();
  const history = [];

  for (let i = 0; i < 80; i++) {
    // Random densities each dispatch
    const densities = {
      East:  Math.floor(Math.random() * 50),
      South: Math.floor(Math.random() * 50),
      West:  Math.floor(Math.random() * 50),
      North: Math.floor(Math.random() * 50),
    };
    history.push(sched.dispatch(densities).lane);
  }

  let starvationDetected = false;
  for (let i = 0; i <= history.length - 4; i += 4) {
    const window = history.slice(i, i + 4);
    const unique = new Set(window);
    if (unique.size < 4) {
      starvationDetected = true;
      break;
    }
  }

  assert(!starvationDetected,
    'No starvation: every lane appears exactly once in every 4-dispatch window (20 cycles)');

  // Additional: check total counts are equal
  const counts = {};
  for (const lane of history) counts[lane] = (counts[lane] || 0) + 1;
  const allEqual = Object.values(counts).every(c => c === 20);
  assert(allEqual,
    'Equal dispatch count: each lane dispatched exactly 20 times in 80 dispatches',
    `counts: ${JSON.stringify(counts)}`);
}

// ─────────────────────────────────────────────────────────────
section('TEST 5: Clearance Interval Always Applied');
// ─────────────────────────────────────────────────────────────
{
  const sched = Scheduler.createScheduler({ clearanceInterval: 2 });
  const densities = { East: 5, South: 0, West: 20, North: 1 };
  let allHaveClearance = true;

  for (let i = 0; i < 8; i++) {
    const rec = sched.dispatch(densities);
    if (rec.clearanceTime !== 2) allHaveClearance = false;
    if (rec.totalPhaseTime !== rec.greenTime + 2) allHaveClearance = false;
  }

  assert(allHaveClearance,
    'Every dispatch includes clearanceInterval=2 and totalPhaseTime = green + clearance');
}

// ─────────────────────────────────────────────────────────────
section('TEST 6: Edge Cases');
// ─────────────────────────────────────────────────────────────
{
  // Zero density on all lanes (no vehicles — still dispatches with minGreen)
  const sched = Scheduler.createScheduler();
  const zeroDensities = { East: 0, South: 0, West: 0, North: 0 };
  const records = sched.runFullCycle(zeroDensities);

  const allMinGreen = records.every(r => r.greenTime === 5);
  assert(allMinGreen,
    'Zero density: all lanes get minGreen=5 (not zero)',
    `greens: ${records.map(r => r.greenTime)}`);

  // Very high density
  const sched2 = Scheduler.createScheduler();
  const highDensities = { East: 1000, South: 500, West: 200, North: 999 };
  const records2 = sched2.runFullCycle(highDensities);

  const allCappedAtMax = records2.every(r => r.greenTime === 50);
  assert(allCappedAtMax,
    'Very high density: all lanes capped at maxGreen=50',
    `greens: ${records2.map(r => r.greenTime)}`);
}

// ─────────────────────────────────────────────────────────────
section('TEST 7: Mode Switching Mid-Run');
// ─────────────────────────────────────────────────────────────
{
  const sched = Scheduler.createScheduler({}, Scheduler.MODE.VARIABLE);
  const densities = { East: 10, South: 10, West: 10, North: 10 };

  // Variable mode: density=10, avg=3 → green=30
  const r1 = sched.dispatch(densities);
  assert(r1.greenTime === 30, 'Variable mode: density=10 → green=30', `got ${r1.greenTime}`);

  // Switch to fixed mode
  sched.setMode(Scheduler.MODE.FIXED);
  const r2 = sched.dispatch(densities);
  assert(r2.greenTime === 15, 'After switch to Fixed: green=15 (fixedQuantum)', `got ${r2.greenTime}`);

  // Switch back
  sched.setMode(Scheduler.MODE.VARIABLE);
  const r3 = sched.dispatch(densities);
  assert(r3.greenTime === 30, 'After switch back to Variable: green=30', `got ${r3.greenTime}`);
}

// ─────────────────────────────────────────────────────────────
section('TEST 8: Full Cycles with Varying Densities');
// ─────────────────────────────────────────────────────────────
{
  const sched = Scheduler.createScheduler();

  // Cycle 1: varied densities
  const cycle1 = sched.runFullCycle({ East: 3, South: 7, West: 15, North: 1 });
  assert(cycle1[0].greenTime === 9,  'Cycle1 East:  density=3  → green=9',  `got ${cycle1[0].greenTime}`);
  assert(cycle1[1].greenTime === 21, 'Cycle1 South: density=7  → green=21', `got ${cycle1[1].greenTime}`);
  assert(cycle1[2].greenTime === 45, 'Cycle1 West:  density=15 → green=45', `got ${cycle1[2].greenTime}`);
  assert(cycle1[3].greenTime === 5,  'Cycle1 North: density=1  → green=5 (minGreen)', `got ${cycle1[3].greenTime}`);

  // Cycle 2: densities changed (simulating arrivals/departures)
  const cycle2 = sched.runFullCycle({ East: 20, South: 0, West: 40, North: 8 });
  assert(cycle2[0].greenTime === 50, 'Cycle2 East:  density=20 → green=50 (capped)', `got ${cycle2[0].greenTime}`);
  assert(cycle2[1].greenTime === 5,  'Cycle2 South: density=0  → green=5',  `got ${cycle2[1].greenTime}`);
  assert(cycle2[2].greenTime === 50, 'Cycle2 West:  density=40 → raw=120, capped=50', `got ${cycle2[2].greenTime}`);
  assert(cycle2[3].greenTime === 24, 'Cycle2 North: density=8  → green=24', `got ${cycle2[3].greenTime}`);

  // Verify cycle count
  assert(sched.getCycleCount() === 2, 'Cycle count = 2 after 2 full cycles', `got ${sched.getCycleCount()}`);
  assert(sched.getDispatchCount() === 8, 'Dispatch count = 8 after 2 × 4 lanes', `got ${sched.getDispatchCount()}`);
}

// ─────────────────────────────────────────────────────────────
section('TEST 9: Dispatch History Logging');
// ─────────────────────────────────────────────────────────────
{
  const sched = Scheduler.createScheduler();
  sched.runFullCycle({ East: 5, South: 10, West: 3, North: 8 });

  const history = sched.getHistory();
  assert(history.length === 4, 'History has 4 records after 1 full cycle', `got ${history.length}`);

  // Check record fields
  const rec = history[0];
  const requiredFields = ['dispatchIndex', 'lane', 'laneIndex', 'density',
                          'greenTime', 'clearanceTime', 'totalPhaseTime', 'mode', 'cycle'];
  const hasAllFields = requiredFields.every(f => f in rec);
  assert(hasAllFields, 'Dispatch records contain all required fields',
    `fields: ${Object.keys(rec).join(', ')}`);
}

// ─────────────────────────────────────────────────────────────
//  SUMMARY
// ─────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`);
console.log('  TEST SUMMARY');
console.log('═'.repeat(60));
console.log(`  Total:  ${passed + failed}`);
console.log(`  Passed: ${passed} ✅`);
console.log(`  Failed: ${failed} ❌`);
console.log('═'.repeat(60));

if (failed > 0) {
  console.log('\nFailed tests:');
  results.filter(r => r.status.includes('FAIL')).forEach(r => {
    console.log(`  • ${r.testName}${r.detail ? ': ' + r.detail : ''}`);
  });
  process.exit(1);
} else {
  console.log('\n🎉 All tests passed! The scheduler is correct.\n');
  process.exit(0);
}
