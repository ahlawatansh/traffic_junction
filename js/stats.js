/**
 * stats.js — Live Stats Dashboard & Event Log
 *
 * Displays:
 *   - Global stats: total cleared, max wait, cycles, simulation time
 *   - Per-lane stats: queue length, arrived, cleared, avg wait, max wait
 *   - Scrollable event log table of every scheduling decision
 *   - CSV export of the full event log
 */

const StatsPanel = (() => {

  const LANES = ['East', 'South', 'West', 'North'];
  const LANE_COLORS = {
    East:  '#4285f4',
    South: '#ea4335',
    West:  '#a142f4',
    North: '#34a853',
  };

  // ── DOM references ────────────────────────────────────────
  let globalStats = {};    // { totalCleared, maxWait, cycles, simTime }
  let laneCards = {};      // { lane: { queue, arrived, cleared, avgWait, maxWait } }
  let logTbody = null;
  let logRenderedCount = 0;

  // ── Initialize Stats Dashboard ────────────────────────────
  function initStats(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    // Global stats row
    const globalRow = document.createElement('div');
    globalRow.className = 'flex items-center gap-24 mb-8 pb-6 border-b border-border';
    container.appendChild(globalRow);

    const globalDefs = [
      { key: 'simTime',      label: 'Sim Time' },
      { key: 'cycles',       label: 'Cycles' },
      { key: 'totalCleared', label: 'Total Cleared' },
      { key: 'maxWait',      label: 'Max Wait' },
    ];

    for (const def of globalDefs) {
      const card = document.createElement('div');
      card.className = 'flex flex-col';
      card.innerHTML = `
        <span class="text-[10px] text-on-surface-variant uppercase tracking-wider">${def.label}</span>
        <span class="text-sm font-semibold text-on-surface" id="stat-${def.key}">—</span>
      `;
      globalRow.appendChild(card);
      globalStats[def.key] = card.querySelector('.stat-value, [id^="stat-"]');
    }

    // Per-lane stats Table
    const tableWrap = document.createElement('div');
    tableWrap.className = 'w-full overflow-x-auto';
    container.appendChild(tableWrap);

    const table = document.createElement('table');
    table.className = 'w-full text-left border-collapse';
    tableWrap.appendChild(table);

    table.innerHTML = `
      <thead>
        <tr class="border-b border-border/50 text-[10px] text-on-surface-variant uppercase tracking-wider">
          <th class="pb-3 font-medium">Lane</th>
          <th class="pb-3 font-medium">Queue</th>
          <th class="pb-3 font-medium">Arrived</th>
          <th class="pb-3 font-medium">Cleared</th>
          <th class="pb-3 font-medium">Avg Wait</th>
          <th class="pb-3 font-medium">Max Wait</th>
        </tr>
      </thead>
      <tbody id="lane-stats-tbody">
      </tbody>
    `;

    const tbody = table.querySelector('#lane-stats-tbody');

    for (const lane of LANES) {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-border/50 last:border-0';
      tr.innerHTML = `
        <td class="py-3">
          <div class="text-[11px] font-bold uppercase tracking-widest flex items-center gap-2" style="color:${LANE_COLORS[lane]}">
            <span class="w-2 h-2 rounded-full" style="background:${LANE_COLORS[lane]}"></span>
            ${lane}
          </div>
        </td>
        <td class="py-3 text-xs font-semibold" data-field="queue">0</td>
        <td class="py-3 text-xs font-semibold" data-field="arrived">0</td>
        <td class="py-3 text-xs font-semibold" data-field="cleared">0</td>
        <td class="py-3 text-xs font-semibold" data-field="avgWait">—</td>
        <td class="py-3 text-xs font-semibold" data-field="maxWait">0s</td>
      `;
      tbody.appendChild(tr);

      laneCards[lane] = {
        queue:   tr.querySelector('[data-field="queue"]'),
        arrived: tr.querySelector('[data-field="arrived"]'),
        cleared: tr.querySelector('[data-field="cleared"]'),
        avgWait: tr.querySelector('[data-field="avgWait"]'),
        maxWait: tr.querySelector('[data-field="maxWait"]'),
      };
    }
  }

  // ── Initialize Event Log ──────────────────────────────────
  function initLog(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    // Table
    const tableWrap = document.createElement('div');
    tableWrap.className = 'log-table-wrap';
    container.appendChild(tableWrap);

    const table = document.createElement('table');
    table.className = 'log-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Time(s)</th>
          <th>Lane</th>
          <th>Density</th>
          <th>Quantum(s)</th>
          <th>Cleared</th>
          <th>Mode</th>
        </tr>
      </thead>
    `;
    tableWrap.appendChild(table);

    logTbody = document.createElement('tbody');
    table.appendChild(logTbody);
  }

  // ── Update Stats Dashboard ────────────────────────────────
  function updateStats(snapshot) {
    if (!globalStats.simTime) return;

    const t = snapshot.tick;
    const mins = Math.floor(t / 60);
    const secs = t % 60;

    globalStats.simTime.textContent = `${mins}m ${secs}s`;
    globalStats.cycles.textContent = snapshot.cycleCount;
    globalStats.totalCleared.textContent = snapshot.totalVehiclesCleared;
    globalStats.maxWait.textContent = snapshot.globalMaxWaitTime + 's';

    // Per-lane
    for (const lane of LANES) {
      const card = laneCards[lane];
      const ls = snapshot.laneStats[lane];
      if (!card || !ls) continue;

      card.queue.textContent = snapshot.densities[lane] || 0;
      card.arrived.textContent = ls.totalArrived;
      card.cleared.textContent = ls.totalCleared;
      card.avgWait.textContent = ls.totalCleared > 0
        ? (ls.totalWaitTime / ls.totalCleared).toFixed(1) + 's'
        : '—';
      card.maxWait.textContent = ls.maxWaitTime + 's';
    }
  }

  // ── Update Event Log ──────────────────────────────────────
  function updateLog(eventLog) {
    if (!logTbody) return;

    // Only add new entries
    for (let i = logRenderedCount; i < eventLog.length; i++) {
      const e = eventLog[i];
      const row = document.createElement('tr');
      row.style.color = LANE_COLORS[e.lane] || '#ccc';
      row.innerHTML = `
        <td>${e.timestamp}</td>
        <td>${e.lane}</td>
        <td>${e.densityAtDispatch}</td>
        <td>${e.quantumAssigned}</td>
        <td>${e.vehiclesCleared}</td>
        <td>${e.mode === 'variable' ? 'Var' : 'Fix'}</td>
      `;
      logTbody.appendChild(row);
    }
    logRenderedCount = eventLog.length;

    // Auto-scroll to bottom
    const wrap = logTbody.closest('.log-table-wrap');
    if (wrap) wrap.scrollTop = wrap.scrollHeight;

    // Update count
    const countEl = document.getElementById('log-count');
    if (countEl) countEl.textContent = `${eventLog.length} entries`;
  }

  // ── Export CSV ────────────────────────────────────────────
  function exportCSV(eventLog) {
    const headers = ['Timestamp(s)', 'Lane', 'DensityAtDispatch', 'QuantumAssigned(s)', 'VehiclesCleared', 'Mode'];
    const csvRows = [headers.join(',')];

    for (const e of eventLog) {
      csvRows.push([
        e.timestamp,
        e.lane,
        e.densityAtDispatch,
        e.quantumAssigned,
        e.vehiclesCleared,
        e.mode,
      ].join(','));
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `traffic_sim_log_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Reset ─────────────────────────────────────────────────
  function reset() {
    logRenderedCount = 0;
    if (logTbody) logTbody.innerHTML = '';

    for (const key of Object.keys(globalStats)) {
      if (globalStats[key]) globalStats[key].textContent = '—';
    }
    for (const lane of LANES) {
      const card = laneCards[lane];
      if (!card) continue;
      card.queue.textContent = '0';
      card.arrived.textContent = '0';
      card.cleared.textContent = '0';
      card.avgWait.textContent = '—';
      card.maxWait.textContent = '0s';
    }

    const countEl = document.getElementById('log-count');
    if (countEl) countEl.textContent = '0 entries';
  }

  return { initStats, initLog, updateStats, updateLog, exportCSV, reset };

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StatsPanel;
}
