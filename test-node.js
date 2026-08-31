const fs = require('fs');
const vm = require('vm');

const context = {
  document: {
    addEventListener: () => {},
    getElementById: () => ({ addEventListener: () => {}, style: {}, classList: { toggle: () => {}, remove: () => {}, add: () => {} }, setAttribute: () => {} }),
    createElement: () => ({ style: {}, appendChild: () => {}, classList: { toggle: () => {}, remove: () => {}, add: () => {} } })
  },
  window: {
    requestAnimationFrame: () => {}
  },
  performance: {
    now: () => Date.now()
  },
  Math, Object, console, parseFloat, isNaN
};
vm.createContext(context);

function loadFile(file) {
  const code = fs.readFileSync(file, 'utf8');
  vm.runInContext(code, context);
}

loadFile('js/scheduler.js');
loadFile('js/simulation.js');
loadFile('js/visualization.js');
loadFile('js/gantt.js');
loadFile('js/stats.js');
loadFile('js/controls.js');
loadFile('js/app.js');

try {
  vm.runInContext('App.init()', context);
  console.log("No syntax/reference errors found on init or start!");
} catch (e) {
  console.error("ERROR:", e);
}
