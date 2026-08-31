/**
 * controls.js — Full Control Panel
 *
 * Manages:
 *   - Scheduling mode toggle (Fixed vs Variable quantum)
 *   - Parameter sliders (arrival rate, avg crossing time, min/max green, fixed quantum)
 *   - Wiring between UI controls and Scheduler / Simulation config
 */

const Controls = (() => {

  let scheduler = null;
  let simulation = null;
  let onModeChange = null;   // callback when mode switches

  // ── Slider definitions ────────────────────────────────────
  const SLIDER_DEFS = {
    arrivalRate:     { min: 0.05, max: 2.0,  step: 0.05, default: 0.15, label: 'Arrival Rate',       unit: 'veh/s/lane', target: 'sim',   key: 'arrivalRate' },
    avgCrossingTime: { min: 0.5,    max: 10,   step: 0.5,  default: 1.5,    label: 'Avg Crossing Time',  unit: 's/vehicle',  target: 'both',  key: 'avgCrossingTime' },
    minGreen:        { min: 2,    max: 30,   step: 1,    default: 5,    label: 'Min Green',          unit: 'sec',        target: 'sched', key: 'minGreen',  mode: 'variable' },
    maxGreen:        { min: 10,   max: 50,   step: 5,    default: 30,   label: 'Max Green',          unit: 'sec',        target: 'sched', key: 'maxGreen',  mode: 'variable' },
    fixedQuantum:    { min: 3,    max: 60,   step: 1,    default: 15,   label: 'Fixed Quantum',      unit: 'sec',        target: 'sched', key: 'fixedQuantum', mode: 'fixed' },
    clearance:       { min: 1,    max: 5,    step: 1,    default: 2,    label: 'Clearance Interval', unit: 'sec',        target: 'sched', key: 'clearanceInterval' },
  };

  // ── Initialize ────────────────────────────────────────────
  function init(sched, sim, modeChangeCallback) {
    scheduler  = sched;
    simulation = sim;
    onModeChange = modeChangeCallback;

    wireSliders();
    wireModeToggle();
    updateModeVisibility(scheduler.getMode());
  }

  // ── Wire parameter sliders ────────────────────────────────
  function wireSliders() {
    for (const [id, def] of Object.entries(SLIDER_DEFS)) {
      const slider = document.getElementById(`slider-${id}`);
      const valueEl = document.getElementById(`val-${id}`);
      if (!slider || !valueEl) continue;

      // Set initial value
      slider.min  = def.min;
      slider.max  = def.max;
      slider.step = def.step;
      slider.value = def.default;
      valueEl.textContent = formatValue(def.default, def);

      // Listen for changes
      slider.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        valueEl.textContent = formatValue(val, def);
        applyValue(def, val);
      });
    }

    // Wire the duplicate avgCrossingTime slider in Fixed mode section
    const fixedCrossSlider = document.getElementById('slider-avgCrossingTime-fixed');
    const fixedCrossVal = document.getElementById('val-avgCrossingTime-fixed');
    if (fixedCrossSlider && fixedCrossVal) {
      fixedCrossSlider.addEventListener('input', () => {
        const val = parseFloat(fixedCrossSlider.value);
        fixedCrossVal.textContent = `${val} s/vehicle`;
        scheduler.updateConfig({ avgCrossingTime: val });
        simulation.updateConfig({ avgCrossingTime: val });
        // Sync the variable mode slider too
        const varSlider = document.getElementById('slider-avgCrossingTime');
        const varVal = document.getElementById('val-avgCrossingTime');
        if (varSlider) varSlider.value = val;
        if (varVal) varVal.textContent = `${val} s/vehicle`;
      });
    }
  }

  function formatValue(val, def) {
    if (def.step < 1) return `${val.toFixed(2)} ${def.unit}`;
    return `${val} ${def.unit}`;
  }

  function applyValue(def, val) {
    if (def.target === 'sched' || def.target === 'both') {
      scheduler.updateConfig({ [def.key]: val });
    }
    if (def.target === 'sim' || def.target === 'both') {
      simulation.updateConfig({ [def.key]: val });
    }
  }

  // ── Wire scheduling mode toggle ───────────────────────────
  function wireModeToggle() {
    const btnVariable = document.getElementById('mode-variable');
    const btnFixed    = document.getElementById('mode-fixed');
    if (!btnVariable || !btnFixed) return;

    btnVariable.addEventListener('click', () => setMode('variable'));
    btnFixed.addEventListener('click',    () => setMode('fixed'));
  }

  function setMode(mode) {
    scheduler.setMode(mode);
    updateModeVisibility(mode);
    if (onModeChange) onModeChange(mode);
  }

  function updateModeVisibility(mode) {
    const btnVariable = document.getElementById('mode-variable');
    const btnFixed    = document.getElementById('mode-fixed');
    const varParams   = document.getElementById('params-variable');
    const fixParams   = document.getElementById('params-fixed');
    const sliderPill  = document.getElementById('mode-slider-pill');

    if (btnVariable) btnVariable.classList.toggle('mode-active', mode === 'variable');
    if (btnFixed)    btnFixed.classList.toggle('mode-active', mode === 'fixed');
    
    if (sliderPill) {
      sliderPill.style.transform = mode === 'variable' ? 'translateX(0)' : 'translateX(100%)';
    }

    if (varParams)   varParams.style.display = mode === 'variable' ? 'block' : 'none';
    if (fixParams)   fixParams.style.display = mode === 'fixed' ? 'block' : 'none';
  }

  // ── Refresh (after reset, re-bind to new instances) ───────
  function refresh(sched, sim) {
    scheduler  = sched;
    simulation = sim;

    // Re-apply current slider values to new instances
    for (const [id, def] of Object.entries(SLIDER_DEFS)) {
      const slider = document.getElementById(`slider-${id}`);
      if (!slider) continue;
      const val = parseFloat(slider.value);
      applyValue(def, val);
    }

    updateModeVisibility(scheduler.getMode());
  }

  // ── Get current mode ──────────────────────────────────────
  function getMode() {
    return scheduler ? scheduler.getMode() : 'variable';
  }

  return { init, refresh, getMode, setMode };

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Controls;
}
