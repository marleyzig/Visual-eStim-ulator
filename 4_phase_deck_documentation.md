# Multi-Deck Visual eStim-ulator: 4-Phase Deck Reference

The **4-Phase Deck** utilizes a fundamentally different architecture than the 3-Phase deck. Instead of outputting Cartesian coordinates (X/Y) to drive a joystick-based hardware engine, the 4-Phase deck acts as an intensity distributor. It calculates and outputs independent power levels for 4 separate channels based on the position of a power dot within a geometric grid.

## 1. ReStim Interface & Setup

Like the 3-Phase deck, this module streams standard T-Code over a local WebSocket to ReStim. 

### Connecting to ReStim
1. Locate the **📡 Connection** panel at the top left.
2. Select your target WebSocket (e.g., `Local ReStim (Port 12349)`).
3. Click **Connect**. 
4. Click **▶ Start Deck** to activate the internal sequencer.

### Output Mapping (The 4 Nodes)
The deck calculates proximity to four distinct nodes, outputting intensity percentages for each:
*   **A (Red):** Top / Channel 1
*   **B (Blue):** Right / Channel 2
*   **C (Yellow):** Bottom / Channel 3
*   **D (Green):** Left / Channel 4

---

## 2. Core Sequencing & Motion

Instead of using raw oscillators (AM/FM) to move the dot, the 4-Phase deck relies on a **Pattern / Macro Selector** that acts like a step-sequencer.

### Patterns (Sequences) vs. Macros
*   **Sequences:** These are moving paths. Selecting "Round Robin" will mathematically orbit the dot through A -> B -> C -> D, creating a swirling sensation. "Ping-Pong" patterns will bounce back and forth between opposite sides.
*   **Macros:** These are static, hard-coded power states. Selecting a Macro (like "Toggle B/C") completely stops the dot's motion and locks the signal into a specific on/off configuration, instantly focusing power to those specific channels.

### Motion Modifiers
*   **Speed (Hz):** Dictates how fast a Sequence completes one full cycle. Can be synced to the global Video Beat Sync engine.
*   **Orbit Radius (%):** Controls how far the dot travels from the center. At 100%, the dot hits the outer edges (maximum isolation of single channels). At lower percentages, the dot stays near the middle, diffusing power softly across all 4 channels simultaneously.
    *   *X/Y Split:* Unchecking "Sync Axes" allows you to set different horizontal and vertical limits, squishing a circular orbit into an oval.
*   **Sweep Arc & End Pause:** Specifically modifies "Pendulum" patterns. The *Arc* limits how wide the pendulum swings (e.g., a 180° half-circle). The *End Pause* tells the sequence to briefly stop and hold at the edges (measured in milliseconds) before swinging back.
*   **Rotation Angle:** Tilts the entire mathematical grid. Use this to physically align the software's A/B/C/D nodes with the actual rotation of the electrodes on your body.

---

## 3. Advanced Grid & Engine Math

The 4-Phase deck allows you to change the underlying math that translates the dot's X/Y position into output power.

### Grid Modes (Top Right View Mode)
*   **Diamond (Geometric):** A standard 4-point cross layout. The math calculates intensities based on distance from the four cardinal compass points.
*   **Tessellation (Barycentric):** A more advanced layout where the space is divided into triangles. The math uses Barycentric coordinates to ensure perfectly smooth transitions across diagonal boundaries, preventing "dead zones" between nodes.

### Engine Mode (⚙️ Tab)
*   **Geometric Axis:** Raw and literal. If the dot is perfectly centered between Node A and Node B, both channels receive exactly 50% power.
*   **Intensity Modulated:** Applies an algorithmic smoothing curve. As the dot moves away from a node, the power falls off on a curve rather than a straight line, resulting in a softer, more blended physical sensation.

---

## 4. Advanced Automation & LFOs

### ⚙️ LFO (Auto-Motion)
The LFO (Low-Frequency Oscillator) is an invisible "hand" that slowly pushes the center anchor point of your sequence around the grid.
*   If you set up a fast, tight "Round Robin" circle in the center of the grid, applying a slow Horizontal LFO will cause that entire spinning circle to slowly drift from the Left (D) to the Right (B) and back again.
*   You can set independent Width and Speed for both Horizontal and Vertical axes, creating highly unpredictable, wandering sensations.

### 📍 Snap To Grid (Tessellation Mode)
When manually dragging the power dot with your mouse, the Snap menu allows you to magnetically lock the dot to specific mathematical points:
*   **Centers:** Locks exactly to Node A, B, C, or D.
*   **Edges:** Locks the dot perfectly between two nodes (e.g., A/B), ensuring a flawless 50/50 power split.

---

## 5. ReStim Modifiers (The "Feel")

While the primary controls dictate *where* the power goes (E1-E4 intensities), the **⚡ ReStim Modifiers** tab dictates the electrical shape of that power.

*   **C0 (Carrier Freq):** The fundamental pitch of the signal (e.g., 2000 Hz). Higher frequencies feel sharper/stingier; lower frequencies feel like a deep hum.
*   **P0 (Pulse Freq):** Overrides the hum with a tapping sensation. Dictates taps per second.
*   **P1 (Pulse Width):** Dictates how long each tap lasts.
*   **P2 (Interval Random):** Introduces chaos/jitter to the pulse timing, making the tapping feel erratic rather than perfectly rhythmic.
*   **P3 (Pulse Rise Time):** Softens the attack of each pulse, changing a sharp "smack" into a softer "push."

---

## 6. Visual Interface
*   **Primary Canvas:** Displays the grid, the nodes, and the moving power dot (trace path). 
*   **Water Levels (Intensity Bars):** A secondary view that shows the exact real-time output percentages (0-100%) for channels A, B, C, and D as vertical moving bars.
*   **Reset Anchor Ring:** If you have manually dragged the center point of the pattern off-center, this instantly snaps it back to the exact middle of the grid.