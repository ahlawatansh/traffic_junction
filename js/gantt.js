/**
 * gantt.js — Scheduling Gantt Chart Timeline
 *
 * Renders a horizontal timeline showing each lane's green phases
 * with their actual durations — like a CPU scheduling Gantt chart.
 *
 * Layout:
 *   Fixed lane labels (left) | Scrollable timeline with colored blocks (right)
 *
 * Each green phase → colored block, each clearance → thin gray/yellow block.
 * Auto-scrolls to show the most recent activity.
 */

const GanttChart = (() => {

  const LANES = ['East', 'South', 'West', 'North'];
  const LANE_COLORS = {
    East:  '#4285f4',
    South: '#ea4335',
    West:  '#a142f4',
    North: '#34a853',
  };
  const CLEARANCE_COLOR = '#f9ab00';
  const ROW_HEIGHT = 32;          // Taller rows for minimalism and clarity
  const SCALE = 10;               // Pixels per second — zoomed in for clarity
  const LEFT_PAD = 30;            // Left padding so the '0s' label is fully visible
  const TIME_AXIS_H = 22;

  let wrapper, labelsDiv, scrollDiv, timelineDiv, rows = {};
  let timeAxisDiv;
  let renderedCount = 0;          // how many event log entries we've already rendered
  let currentWidth = 0;

  // ── Initialize ────────────────────────────────────────────
  function init(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    // Wrapper
    wrapper = document.createElement('div');
    wrapper.className = 'gantt-wrapper';
    container.appendChild(wrapper);

    // Lane labels (fixed left column)
    labelsDiv = document.createElement('div');
    labelsDiv.className = 'gantt-labels';
    wrapper.appendChild(labelsDiv);

    for (const lane of LANES) {
      const lbl = document.createElement('div');
      lbl.className = 'gantt-label';
      lbl.style.height = ROW_HEIGHT + 'px';
      lbl.style.color = LANE_COLORS[lane];
      lbl.textContent = lane;
      labelsDiv.appendChild(lbl);
    }
    // Spacer for time axis
    const spacer = document.createElement('div');
    spacer.className = 'gantt-label';
    spacer.style.height = TIME_AXIS_H + 'px';
    spacer.style.fontSize = '9px';
    spacer.style.color = '#666';
    spacer.textContent = 'time→';
    labelsDiv.appendChild(spacer);

    // Scrollable timeline
    scrollDiv = document.createElement('div');
    scrollDiv.className = 'gantt-scroll';
    wrapper.appendChild(scrollDiv);

    timelineDiv = document.createElement('div');
    timelineDiv.className = 'gantt-timeline';
    timelineDiv.style.height = (LANES.length * ROW_HEIGHT + TIME_AXIS_H) + 'px';
    scrollDiv.appendChild(timelineDiv);

    // Lane rows
    for (let i = 0; i < LANES.length; i++) {
      const row = document.createElement('div');
      row.className = 'gantt-row';
      row.style.top = (i * ROW_HEIGHT) + 'px';
      row.style.height = ROW_HEIGHT + 'px';
      timelineDiv.appendChild(row);
      rows[LANES[i]] = row;
    }

    // Time axis row
    timeAxisDiv = document.createElement('div');
    timeAxisDiv.className = 'gantt-time-axis';
    timeAxisDiv.style.top = (LANES.length * ROW_HEIGHT) + 'px';
    timeAxisDiv.style.height = TIME_AXIS_H + 'px';
    timelineDiv.appendChild(timeAxisDiv);
  }

  // ── Update (called each render frame) ─────────────────────
  function update(eventLog, currentTick, clearanceInterval) {
    if (!timelineDiv) return;

    // Only render new entries
    for (let i = renderedCount; i < eventLog.length; i++) {
      const entry = eventLog[i];
      addBlock(entry, clearanceInterval);
    }
    renderedCount = eventLog.length;

    // Update timeline width
    const newWidth = Math.max(LEFT_PAD + currentTick * SCALE + 100, scrollDiv.clientWidth);
    if (newWidth > currentWidth) {
      currentWidth = newWidth;
      timelineDiv.style.width = newWidth + 'px';
      updateTimeMarkers(currentTick);
    }

    // Auto-scroll to the right
    scrollDiv.scrollLeft = scrollDiv.scrollWidth - scrollDiv.clientWidth;
  }

  // ── Add a phase block + clearance block ───────────────────
  function addBlock(entry, clearanceInterval) {
    const lane = entry.lane;
    const row = rows[lane];
    if (!row) return;

    const greenStart = entry.timestamp - entry.quantumAssigned;
    const greenDuration = entry.quantumAssigned;

    // Green phase block
    const greenBlock = document.createElement('div');
    greenBlock.className = 'gantt-block';
    greenBlock.style.left = (LEFT_PAD + greenStart * SCALE) + 'px';
    greenBlock.style.width = Math.max(greenDuration * SCALE - 1, 2) + 'px';
    greenBlock.style.background = '#22c55e'; // Static Tailwind green-500 for all lanes
    greenBlock.style.height = (ROW_HEIGHT - 6) + 'px';
    greenBlock.style.top = '3px';
    greenBlock.title = `${lane}: ${greenDuration}s green, ${entry.vehiclesCleared} cleared (density=${entry.densityAtDispatch})`;

    // Show duration text if block is wide enough
    if (greenDuration * SCALE > 30) {
      greenBlock.textContent = `${greenDuration}s`;
    }

    row.appendChild(greenBlock);

    // Clearance block (thin, after green)
    if (clearanceInterval > 0) {
      const clearBlock = document.createElement('div');
      clearBlock.className = 'gantt-block gantt-clearance';
      clearBlock.style.left = (LEFT_PAD + entry.timestamp * SCALE) + 'px';
      clearBlock.style.width = Math.max(clearanceInterval * SCALE - 1, 2) + 'px';
      clearBlock.style.background = CLEARANCE_COLOR;
      clearBlock.style.height = (ROW_HEIGHT - 10) + 'px';
      clearBlock.style.top = '5px';
      clearBlock.style.opacity = '0.6';
      clearBlock.title = `Clearance: ${clearanceInterval}s`;
      row.appendChild(clearBlock);
    }
  }

  // ── Time markers on the axis ──────────────────────────────
  function updateTimeMarkers(currentTick) {
    // Use tighter intervals since the timeline is zoomed in
    timeAxisDiv.innerHTML = '';
    const interval = currentTick < 120 ? 10 : currentTick < 300 ? 20 : 30;

    for (let t = 0; t <= currentTick + interval; t += interval) {
      const marker = document.createElement('div');
      marker.className = 'gantt-time-marker';
      marker.style.left = (LEFT_PAD + t * SCALE) + 'px';
      marker.textContent = t < 60 ? `${t}s` : `${Math.floor(t / 60)}m${t % 60 ? t % 60 + 's' : ''}`;
      timeAxisDiv.appendChild(marker);
    }
  }

  // ── Reset ─────────────────────────────────────────────────
  function reset() {
    renderedCount = 0;
    currentWidth = 0;
    for (const lane of LANES) {
      if (rows[lane]) rows[lane].innerHTML = '';
    }
    if (timeAxisDiv) timeAxisDiv.innerHTML = '';
    if (timelineDiv) timelineDiv.style.width = '100%';
  }

  return { init, update, reset };

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GanttChart;
}
