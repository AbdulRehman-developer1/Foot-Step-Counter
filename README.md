# FootStep AI - MediaPipe Foot Step Counter

A real-time foot step counter and gait analysis application powered by **MediaPipe Pose Estimation**. It calculates foot steps, cadence (steps/min), left vs. right leg balance, knee angles, and gait cycles from either **uploaded video files** or a **live webcam feed**.

---

## 🌟 Features

- **Dual Interfaces**:
  1. **Web Dashboard**: Modern, glassmorphism web app with real-time Chart.js signal graphs, canvas pose rendering, step audio feedback, sensitivity sliders, and CSV data export.
  2. **Python Standalone CLI/Script (`foot_counter.py`)**: High-performance OpenCV + MediaPipe Python tool with HUD overlays.
- **Accurate Gait Detection**:
  - Hysteresis state machine tracking leg extension and knee angle flexion.
  - Hip-width spatial normalization to adapt to different camera distances and zoom levels.
  - Refractory cooldown timer & Exponential Moving Average (EMA) signal filtering to prevent duplicate counts.
- **Real-Time Analytics**:
  - Total step count, Left vs Right leg step distribution.
  - Cadence (SPM - Steps per Minute).
  - Knee angle degree indicators.
  - Interactive CSV log export.

---

## 🚀 Quick Start Guide

### 1. Web Dashboard (Interactive Web App)

You can run the web dashboard using Python's built-in HTTP server:

```bash
# Navigate to project directory
cd foot_counter

# Start local web server
python -m http.server 8000
```

Open your browser and navigate to:
👉 **`http://localhost:8000`**

- Select **Video File** mode to drag and drop your walking/running video file.
- Select **Live Webcam** mode to run step detection live from your camera.

---

### 2. Python CLI & OpenCV Script (`foot_counter.py`)

#### Prerequisites & Installation

Install dependencies:
```bash
pip install -r requirements.txt
```

#### Usage Options

1. **Process Live Webcam Feed**:
```bash
python foot_counter.py --source 0
```

2. **Process a Video File**:
```bash
python foot_counter.py --source path/to/walking_video.mp4
```

3. **Save Processed Video with HUD to File**:
```bash
python foot_counter.py --source walking_video.mp4 --output output_annotated.mp4
```

4. **Adjust Sensitivity Threshold**:
```bash
python foot_counter.py --source 0 --threshold 0.18
```

#### CLI Options Summary
- `--source`: Camera index (`0`, `1`) or path to input video file.
- `--threshold`: Step sensitivity threshold (default: `0.15`).
- `--output`: Path to save processed output video file (`.mp4`).
- `--no-display`: Run headlessly without popping up the OpenCV window.

---

## 📁 Project Structure

```
foot_counter/
├── index.html              # Main Web Application UI
├── style.css               # Glassmorphism & Responsive Dark Mode CSS
├── app.js                  # Web Dashboard Controller & Audio Synth
├── step_detector.js        # MediaPipe Tasks Vision JS Wrapper & State Machine
├── foot_counter.py         # Python Standalone OpenCV + MediaPipe Script
├── requirements.txt        # Python dependencies list
├── pose_landmarker_full.task# Pre-trained MediaPipe Pose Model (auto-downloaded)
└── README.md               # Documentation
```

---

## 📊 How Step Counting Works

1. **Pose Keypoints**: Extracts 33 body landmarks (Hips #23, 24, Knees #25, 26, Ankles #27, 28, Heels #29, 30, Toes #31, 32).
2. **Knee Angle Calculation**: Computes joint angle $\theta = \arccos\left(\frac{\mathbf{a} \cdot \mathbf{b}}{\|\mathbf{a}\| \|\mathbf{b}\|}\right)$ at the knee joint.
3. **Normalized Stride Delta**: Calculates vertical/horizontal separation between ankles normalized by hip width $\Delta S = (Y_{\text{left\_ankle}} - Y_{\text{right\_ankle}}) / W_{\text{hip}}$.
4. **Hysteresis State Machine**:
   - `LEFT_STEP`: Triggered when Left Ankle extends forward beyond threshold with knee flexion.
   - `RIGHT_STEP`: Triggered when Right Ankle extends forward beyond threshold with knee flexion.
   - `NEUTRAL`: Neutral recovery state between steps.
5. **Cadence Calculation**: Moving time window calculation of Steps Per Minute (SPM).
