# Multi-Deck Visual eStim-ulator: Sequencer & Video Sync Reference

The **Video Sequencer & Beat Sync Engine** transforms the dashboard from a manual live-performance tool into a fully automated, audio-reactive workstation. It allows you to choreograph complex hardware transitions to a video file and automatically sync the speed of your hardware to the media's tempo.

---

## 1. The DAW Timeline Sequencer

The Sequencer uses an "Event-Based" parameter automation model (similar to Ableton or Logic). It allows you to drag-and-drop saved hardware states (Presets) onto a video timeline to create automated performances.

### ⏱️ Timeline UI & Navigation
The timeline is wrapped in a collapsible accordion and sits directly below the video player.
*   **Playhead:** The red vertical line indicates the current timestamp of the video.
*   **Dynamic Time Ruler:** The top bar displays time intervals (minutes/seconds). It dynamically scales based on your zoom level.
*   **Zoom Controls:** Use the Zoom slider or hover over the track and press **`Shift + MouseWheel`** to zoom in for precise editing or zoom out to see the entire video length.

### 🧱 Sequence Blocks (The Transition Model)
A block on the timeline represents an **Entrance Fade** (a transition), not the total duration a preset plays. 
*   **Start Time (Left Edge):** The exact moment the hardware begins moving toward the new preset's values.
*   **Fade Duration (Block Width):** How long the transition takes. A wide block creates a slow, creeping morph into the new state. A narrow block (0s fade) snaps the hardware instantly.
*   **Hold Time (Empty Space):** Once the playhead passes the right edge of a block, the transition is complete. The deck will simply hold that state indefinitely across the empty space until it hits the next block.

### 🖱️ Drag-and-Drop Workflow
1. **Load a Video:** The timeline requires a loaded video to establish the maximum track duration.
2. **Create Presets:** Dial in your desired hardware settings on the active deck and click **➕ Save Current State** in the Local Preset Bank.
3. **Place Events:** Click and drag a preset from the bank down onto the timeline track.
4. **Adjust Timing:** 
    *   **Move:** Click and drag the center of the block to slide it left or right to change its start time. (It will magnetically snap to adjacent blocks to prevent overlaps).
    *   **Resize:** Click and drag the lighter right-hand edge to stretch or compress the fade duration.
5. **Delete:** Right-click any block to instantly remove it from the track.

### 💾 Saving & Loading Tracks
Because sequences are built using the *names* of your local presets, you must ensure your Preset Bank is loaded before loading a track.
*   **Save Track:** Exports your timeline arrangement as a lightweight `.json` file.
*   **Load Track:** Imports a sequence onto the timeline. *(Note: If the preset names in the file do not match the presets in your Local Bank, the transitions will not fire).*

---

## 2. Advanced Video Beat Sync

While the Sequencer automates *what* settings change, the **Beat Sync Engine** automates the *Speed* (Hz) of the deck based on the media.

### 🎛️ Detection Modes
The engine analyzes the active video to extract a BPM (Beats Per Minute) tempo, translating it directly to the deck's AM Speed or Sequence Speed.

1.  **Energy (Audio):** Listens for low-frequency power (kicks, heavy bass). Best for EDM or rhythmic music tracks.
2.  **Transient (Audio):** Listens for sharp, sudden spikes in audio (claps, snares, clicks). Best for spoken word or erratic, punchy audio.
3.  **Visual (Pixel Tracking):** Ignores audio entirely. It tracks rapid changes in brightness. A small, draggable target box appears over the video player; move this box over a flashing light, strobe, or moving object in the video to extract a rhythm from visual cues alone.

### 📈 Ramping & Smoothing Controls
Raw tempo detection can often be erratic, spiking up and down wildly. The **Ramping** controls act as a physical suspension system to smooth out these changes before they hit your hardware.

*   **Ramp Up Time:** How quickly the hardware is allowed to accelerate to match a newly detected fast tempo.
*   **Ramp Down Time:** How slowly the hardware decelerates when the detected tempo drops. 
*   **Why use it?** If the audio has a sudden, 1-second blast of noise, a high Ramp Time will prevent the hardware from violently jerking to maximum speed, instead creating a smooth, rolling wave of acceleration.

### 🔗 Linking Sync to the Deck
To apply the detected tempo to your hardware:
1. Turn on the Beat Sync Engine and select a Detection Mode.
2. Scroll down to your active 3-Phase or 4-Phase deck.
3. Locate the **Speed (Hz)** slider.
4. Check the **Sync** box next to the slider. The hardware's speed will now dynamically lock to the Beat Sync Engine's output.