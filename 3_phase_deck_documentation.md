# Multi-Deck Visual eStim-ulator: 3-Phase Deck Reference

The **3-Phase Deck** is designed to drive tri-phase e-stim setups using a Cartesian coordinate system. Unlike the 4-Phase deck which calculates intensities for 4 discrete points, the 3-Phase deck operates on a 2D joystick plane. It translates motion into T-Code commands that manipulate Alpha (X-axis), Beta (Y-axis), and a global Carrier Frequency to steer the sensation.

## 1. ReStim Interface & Setup

The dashboard communicates with your hardware by streaming standard T-Code over a local WebSocket connection to the ReStim application.

### Connecting to ReStim
1. **Launch ReStim** and ensure its WebSocket server is active (typically on port `12349` or `12350`).
2. On the dashboard, locate the **📡 Connection** panel at the top left of the deck.
3. Select your target from the dropdown (e.g., `Local ReStim (Port 12349)`) or manually enter the WebSocket address.
4. Click **Connect Bridge**. The status will change to "Connected" when the handshake is successful.
5. Click **▶ Start Deck** to begin calculating math and streaming T-Code.

### T-Code Channel Mapping
The 3-Phase deck continuously outputs the following T-Code channels:
*   **`L0` (Alpha):** The horizontal (X) position of the power dot.
*   **`L1` (Beta):** The vertical (Y) position of the power dot.
*   **`C0` (Carrier Freq):** The pitch/frequency of the electrical signal.
*   **`V0` (Volume):** Master intensity, modulated by the Master Volume slider and Tremolo engines.
*   **`P0` / `P1` (Pulse):** Tapping/thumping modifiers (Frequency and Width).

---

## 2. Core Movement (AM Engine)

The physical sensation of movement is created by Amplitude Modulation (AM). The deck uses internal oscillators to push the power dot around the grid.

### Orbit Radius & Rotation
*   **Orbit Radius (%):** Acts as a global boundary. At 100%, the dot can reach the absolute edges of the `L0`/`L1` ranges (maximum sensation shift). Lowering this confines the dot closer to the center neutral point.
*   **Split Axes:** Unchecking "Sync both axes" allows you to set different horizontal (H-Radius) and vertical (V-Radius) limits, creating oval or linear motion paths.
*   **Rotation Angle:** Tilts the mathematical grid. If horizontal motion on the screen feels diagonal on your body, use this to digitally align the axes with your physical electrode placement.

### Orbit Speed / AM Freq
This section controls *how* the dot moves.

*   **Link Channels (Lissajous Shapes):** When checked, the Left (Alpha) and Right (Beta) channels are mathematically locked. 
    *   **Base Channel:** Choose whether Left or Right is the master clock.
    *   **Base Speed:** Sets the fundamental cycle time (e.g., 1.00 Hz = one loop per second).
    *   **Multiplier:** Forces the opposite channel to run at an exact multiple of the base speed. Setting the Base to 1x and Multiplier to 2x creates a perfect "Figure-8" (infinity) sensation.
*   **Unlinked Channels:** Unchecking "Link Channels" allows you to set the Left and Right AM Frequencies entirely independently. This results in chaotic, unpredictable, DVD-logo-bouncing movement rather than repeating geometric shapes.
*   **AM Waveform:** By default, motion uses a smooth `Sine` wave. Changing this to `Square` forces the dot to jump instantly between extremes without passing through the center.

---

## 3. The "Feel" (FM Engine & Pulse)

While the AM Engine moves the sensation around, the FM Engine dictates what that sensation feels like at any given location. Access these under **⚡ Global Freq and Pulse**.

### Frequency Modulation (FM)
The 3-Phase deck allows the electrical pitch (`C0`) to dynamically shift based on the dot's position.

*   **Link L/R Freqs:** When checked, the entire grid operates at one static frequency (e.g., a solid 600 Hz hum).
*   **Unlinked (Positional Audio):** Unchecking this allows you to define a **Left Frequency** and a **Right Frequency**. If Left is 500 Hz and Right is 2000 Hz, the sensation will be a deep rumble when the dot swings left, and morph into a sharp, stinging buzz as it sweeps right.
*   **FM Depth & FM Freq:** This adds a localized "warble" (siren effect) to the pitch. *FM Depth* determines how wide the pitch swings, and *FM Freq* dictates how fast it warbles.

### Global Pulse
Overrides the continuous hum with a rhythmic tapping sensation.
*   **Pulse Freq (P0):** How many taps occur per second.
*   **Pulse Width (P1):** The duration of each tap. A low width feels like a quick needle prick; a higher width feels like a heavier, solid push.

---

## 4. Advanced Automation

### 🌊 V0 Dual Tremolo
Tremolo modulates the Master Volume (`V0`) automatically, creating rhythmic fading and swelling sensations independent of where the dot is moving.
*   **Dual Oscillators:** You can run two separate volume waves (Alpha and Beta) simultaneously at different depths and speeds.
*   **Mix Method:** `Average` blends the two waves softly. `Multiply` forcefully cuts the volume, creating harsh rhythmic gating if depths are set high.

### 🔄 Spatial Auto-Motion
This engine moves the *entire grid's center point* over time, allowing for compound movements.
*   **Power Dot Motion (Pendulum):** Overrides continuous circular motion with a "windshield wiper" sweep. You can adjust the sweep speed, the arc (e.g., 180° for a half-circle), and add an *End Pause* to make the sensation hold at the edges before sweeping back.
*   **Auto (Anchor) Drift:** Activates a slow Low-Frequency Oscillator (LFO) that physically drags the center point of the grid around. If you combine a tight circular AM orbit with a slow Anchor Drift, you create a spinning vortex that slowly roams across your body.

---

## 5. Visualizer Interface
*   **Joystick Canvas:** The visual representation of the `L0` (X-axis) and `L1` (Y-axis) coordinates. 
*   **Manual Control:** If Spatial Auto-Motion is set to *Manual*, you can click and drag the dot on the canvas to manually steer the sensation.
*   **Reset to Center:** Instantly snaps all motion back to the exact middle of the grid (neutral point).