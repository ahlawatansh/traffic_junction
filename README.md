# 🚦 Traffic Junction Simulator — Operating Systems Course Project
> **Variable Quantum Round Robin CPU Scheduling Applied to a 4-Way Traffic Junction**

A browser-based, zero-backend interactive simulator that models and visualizes **CPU Process Scheduling** using a **4-way traffic junction metaphor**, featuring an adaptive **Variable Time Quantum** algorithm alongside classic **Fixed Time Quantum Round Robin**.

Built with **pure HTML5, CSS3, and Vanilla JavaScript** — runs locally in any web browser without build steps, servers, or external libraries.

---

## 📑 Table of Contents
1. [Operating Systems ↔ Traffic Domain Mapping](#-operating-systems--traffic-domain-mapping)
2. [Scheduling Algorithms & Mathematical Model](#-scheduling-algorithms--mathematical-model)
3. [Architecture & Project Structure](#-architecture--project-structure)
4. [Key Features & User Interface](#-key-features--user-interface)
5. [Automated Test Suite & Verification](#-automated-test-suite--verification)
6. [Comparative Analysis: Fixed RR vs. Variable RR](#-comparative-analysis-fixed-rr-vs-variable-rr)
7. [Getting Started & Usage](#-getting-started--usage)

---

## 🎓 Operating Systems ↔ Traffic Domain Mapping

In modern multitasking operating systems, the CPU scheduler must allocate processor time to competing ready processes in a way that balances **throughput**, **fairness**, **response time**, and **context-switching overhead**.

This simulator establishes a 1-to-1 isomorphism between CPU scheduling principles and traffic signal engineering:

| Operating System Concept | Traffic Junction Equivalent | Role & Technical Significance |
| :--- | :--- | :--- |
| **CPU Core (Processor)** | **4-Way Intersection Area** | A shared, mutually exclusive resource. Only one process/lane can execute inside it at a time without conflict (deadlock/collision). |
| **Processes / Tasks ($P_1, P_2, P_3, P_4$)** | **4 Directional Approaches ($E, S, W, N$)** | Four concurrent workloads competing for the shared resource. |
| **Ready Queue (Circular FIFO)** | **Fixed Cyclic Dispatch Order** | Cyclic round-robin order: $\text{East} \to \text{South} \to \text{West} \to \text{North} \to \text{East} \dots$ |
| **CPU Burst Time ($BT$)** | **Vehicle Queue Length / Density ($d_i$)** | The outstanding computational demand of lane $i$ at the time of scheduling. |
| **Time Quantum ($q$)** | **Green Light Duration ($t_{\text{green}}$)** | Maximum continuous time slice granted to a lane before preemptive context switch. |
| **Context Switch Overhead ($\delta$)** | **Yellow / Clearance Interval** | $2$-second dead interval where no vehicle crosses while lights transition safely. |
| **Instruction Execution** | **Vehicle Departure** | Consumes $t_{\text{crossing}}$ seconds per unit of work cleared from the queue. |
| **Process Inter-Arrival Time** | **Poisson Vehicle Arrivals** | Stochastic arrival rate $\lambda$ (vehicles/second) continuously feeding queues. |
| **Starvation Prevention** | **Bounded Cycle Guarantee** | Max wait time before dispatch is bounded by $4 \times (q_{\max} + \delta)$. |

---

## 📐 Scheduling Algorithms & Mathematical Model

### 1. Variable (Density-Based) Round Robin
In classical Round Robin, a fixed quantum fails to adjust when workload distribution is heavily skewed. In **Variable Round Robin**, the quantum $q_i$ assigned to lane $i$ at dispatch is dynamically calculated based on its instantaneous queue density $d_i$:

$$q_i = \text{clamp}\left(t_{\text{cross}} \times d_i,\, q_{\min},\, q_{\max}\right) = \max\left(q_{\min},\, \min\left(t_{\text{cross}} \times d_i,\, q_{\max}\right)\right)$$

- **$t_{\text{cross}}$ (Avg Crossing Time):** Seconds required for 1 vehicle to cross (default: $3\,\text{s}$).
- **$q_{\min}$ (Min Green):** Lower bound preventing excessively frequent context switches on light traffic (default: $5\,\text{s}$).
- **$q_{\max}$ (Max Green):** Upper bound preventing high-density lanes from monopolizing the intersection (default: $90\,\text{s}$).

### 2. Fixed Quantum Round Robin (Textbook Baseline)
Every lane receives an identical time slice regardless of queue length:

$$q_i = q_{\text{fixed}} \quad (\text{default: } 15\,\text{s})$$

### 3. Context Switch Overhead ($\delta$)
Between consecutive dispatches, a fixed clearance interval $\delta = 2\,\text{s}$ is enforced. The total phase time for lane $i$ is:

$$T_{\text{phase}} = q_i + \delta$$

### 4. Vehicle Arrival Model (Poisson Process)
At each discrete second $t$, vehicles arrive according to a Poisson distribution with parameter $\lambda$:

$$\mathbb{P}(k \text{ arrivals}) = \frac{\lambda^k e^{-\lambda}}{k!}$$

Arrivals are generated continuously for all 4 lanes simultaneously, simulating an active, non-terminating real-time queue.

### 5. Proof of No-Starvation
Let $N = 4$ be the number of lanes. Because the dispatcher follows a strict circular round-robin sequence without skipping, the maximum turnaround duration of any full scheduling cycle $T_{\text{cycle}}$ is strictly bounded:

$$T_{\text{cycle}} \le \sum_{i=1}^{N} (q_{\max} + \delta) = 4 \times (90\,\text{s} + 2\,\text{s}) = 368\,\text{s}$$

Therefore, **no lane can wait longer than 368 seconds without receiving a green phase**, formally proving starvation-freedom ($O(1)$ bounded waiting).

---

## 🏛️ Architecture & Project Structure

The project follows a clean, modular MVC-inspired architecture with zero external dependencies:

```
Traffic management system/
├── index.html              # Main single-page application layout & modal theory dialog
├── README.md               # Comprehensive OS course documentation (this file)
├── css/
│   └── styles.css          # Dark-mode UI styling, responsive layout, CSS animations
├── js/
│   ├── scheduler.js        # Standalone Round Robin scheduling logic (Fixed & Variable)
│   ├── simulation.js       # Discrete-time simulation engine (Poisson arrivals & departures)
│   ├── visualization.js    # Animated SVG junction, traffic lights & vehicle motion
│   ├── gantt.js            # Real-time horizontal CPU scheduling Gantt chart timeline
│   ├── stats.js            # Live metrics dashboard (averages, max wait, CSV export)
│   ├── controls.js         # Parameter sliders & Fixed/Variable mode switching
│   └── app.js              # Application entry point, main animation loop & event wiring
└── tests/
    ├── scheduler.test.js   # 31 unit tests verifying formula, bounds & starvation guarantee
    └── simulation.test.js  # Headless 200-cycle comparative benchmark runner
```

---

## 🌟 Key Features & User Interface

1. **Animated Top-Down SVG Junction View**:
   - Smooth vehicle queue visualization stacking up on each approach (East=Blue, South=Coral, West=Purple, North=Mint).
   - Dynamic 3-aspect traffic signals (Red, Yellow, Green) with active pulse/glow effects.
   - Animated vehicle departures sliding through intersection crosswalks during green lights.
   - Real-time status heads-up display (HUD).

2. **Full Interactive Control Panel**:
   - Playback controls: **Start (▶)**, **Pause (⏸)**, **Reset (↺)**, and **Step Cycle (⏭)**.
   - Simulation speed slider ($1\times$ to $50\times$).
   - Algorithm mode switch: **Variable RR** vs. **Fixed RR**.
   - Sliders for $\lambda$ (Arrival Rate), $t_{\text{cross}}$, $q_{\min}$, $q_{\max}$, $q_{\text{fixed}}$, and $\delta$ (Clearance).

3. **CPU Scheduling Gantt Chart**:
   - Real-time auto-scrolling horizontal timeline showing green phases with exact durations.
   - Visual yellow blocks for context-switch overhead ($\delta$).
   - Time-axis markers and hover tooltips showing density, duration, and clearance metrics.

4. **Live Statistics Dashboard**:
   - Global KPIs: Total Simulation Time, Cycles Completed, Total Cleared, Global Max Wait.
   - Per-lane metric cards: Current Queue, Total Arrived, Total Cleared, Running Average Wait Time, Max Wait Time.

5. **Scheduling Decision Event Log & CSV Export**:
   - Chronological audit table recording every dispatch event.
   - One-click **📥 Export CSV** button for empirical data analysis in Excel / Python.

6. **In-App OS Theory & Mapping Panel**:
   - Integrated reference cards and comparison table explaining the CPU scheduling mapping.
   - Keyboard accessible modal dialog (`Esc` or button click).

---

## 🧪 Automated Test Suite & Verification

The project includes an automated test suite runnable in Node.js:

### 1. Scheduler Unit Tests (31/31 Passing)
```bash
node tests/scheduler.test.js
```
**Tests Covered:**
- Variable quantum clamping formula ($d=0 \to q_{\min}$, $d=50 \to q_{\max}$, linear intermediate scaling).
- Fixed quantum invariance across varying densities.
- Cyclic dispatch order ($E \to S \to W \to N \to E$).
- Starvation-freedom proof across 80 randomized dispatches.
- Clearance interval application and mode switching mid-run.

### 2. Headless 200-Cycle Simulation Benchmark
```bash
node tests/simulation.test.js
```
Runs both algorithms headlessly for 200 cycles ($\approx 800$ dispatches) and outputs side-by-side performance summaries.

---

## 📊 Comparative Analysis: Fixed RR vs. Variable RR

| Metric (200 Cycles Benchmark) | Variable Quantum RR | Fixed Quantum RR ($q=15\text{s}$) | Performance Insight |
| :--- | :--- | :--- | :--- |
| **Total Vehicles Cleared** | **~23,765 vehicles** | **~3,978 vehicles** | **~6× higher throughput** under heavy arrival rate. |
| **Quantum Range** | **$5\text{s} - 90\text{s}$ (Adaptive)** | **$15\text{s}$ (Static)** | Adapts time slice to burst length without wasting green time on empty queues. |
| **Context Switch Overhead** | Lower ratio ($\approx 2.2\%$ of time) | Higher ratio ($\approx 11.8\%$ of time) | Variable RR minimizes context switches when lanes have heavy backlog. |
| **Starvation Behavior** | Zero starvation (fair cyclic order) | Zero starvation | Both algorithms guarantee bounded waiting. |

---

## 🚀 Getting Started & Usage

### Running Locally
No installation or build step is required. Simply open `index.html` in any modern web browser:

```bash
# macOS
open index.html

# Linux
xdg-open index.html

# Windows
start index.html
```

Or serve via any static HTTP server:
```bash
npx serve .
# or
python3 -m http.server 8000
```

---

## 📜 License & Academic Integrity
Developed as an educational submission for an **Operating Systems Course Project**. Feel free to use, explore, and adapt for OS scheduling algorithm study.
