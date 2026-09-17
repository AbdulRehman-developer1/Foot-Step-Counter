<div align="center">

# 🦶 FootStep AI
### Real-Time Foot Step Counter & Gait Analysis powered by MediaPipe

[![Python](https://img.shields.io/badge/Python-3.9%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Pose%20Landmarker-00A98F?style=for-the-badge&logo=google&logoColor=white)](https://developers.google.com/mediapipe)
[![OpenCV](https://img.shields.io/badge/OpenCV-4.8%2B-5C3EE8?style=for-the-badge&logo=opencv&logoColor=white)](https://opencv.org/)
[![Chart.js](https://img.shields.io/badge/Chart.js-Realtime%20Graphs-FF6384?style=for-the-badge&logo=chartdotjs&logoColor=white)](https://www.chartjs.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

[![Repo Size](https://img.shields.io/github/repo-size/AbdulRehman-developer1/foot-step-counter?style=flat-square&color=informational)](https://github.com/AbdulRehman-developer1/foot-step-counter)
[![Last Commit](https://img.shields.io/github/last-commit/AbdulRehman-developer1/foot-step-counter?style=flat-square&color=success)](https://github.com/AbdulRehman-developer1/foot-step-counter/commits/main)
[![Open Issues](https://img.shields.io/github/issues/AbdulRehman-developer1/foot-step-counter?style=flat-square&color=yellow)](https://github.com/AbdulRehman-developer1/foot-step-counter/issues)
[![Stars](https://img.shields.io/github/stars/AbdulRehman-developer1/foot-step-counter?style=flat-square&color=orange)](https://github.com/AbdulRehman-developer1/foot-step-counter/stargazers)

A real-time foot step counter and gait analysis application powered by **MediaPipe Pose Estimation**.
It calculates step count, cadence (steps/min), left vs. right leg balance, knee angles, and gait cycles — from either an **uploaded video file** or a **live webcam feed**.

<p>
  <a href="#-quick-start-guide"><img src="https://img.shields.io/badge/🚀_Get_Started-4CAF50?style=for-the-badge" alt="Get Started"></a>
  <a href="https://github.com/AbdulRehman-developer1/foot-step-counter/issues/new"><img src="https://img.shields.io/badge/🐞_Report_Bug-D32F2F?style=for-the-badge" alt="Report Bug"></a>
  <a href="https://github.com/AbdulRehman-developer1/foot-step-counter/issues/new"><img src="https://img.shields.io/badge/💡_Request_Feature-1976D2?style=for-the-badge" alt="Request Feature"></a>
  <a href="https://github.com/AbdulRehman-developer1/foot-step-counter/fork"><img src="https://img.shields.io/badge/🍴_Fork_Repo-6A1B9A?style=for-the-badge" alt="Fork Repo"></a>
</p>

</div>

---

## 🌟 Features

- **Dual Interfaces**
  1. **Web Dashboard** — modern glassmorphism UI with real-time Chart.js signal graphs, canvas pose overlay, step audio feedback, sensitivity sliders, and CSV data export.
  2. **Python CLI Script** (`foot_counter.py`) — high-performance OpenCV + MediaPipe tool with on-screen HUD overlays.
- **Accurate Gait Detection**
  - Hysteresis state machine tracking leg extension and knee angle flexion.
  - Hip-width spatial normalization to adapt to different camera distances/zoom levels.
  - Refractory cooldown timer + Exponential Moving Average (EMA) filtering to prevent duplicate counts.
- **Real-Time Analytics**
  - Total step count, left vs. right leg step distribution.
  - Cadence (SPM — Steps Per Minute).
  - Knee angle degree indicators.
  - Interactive CSV log export.

---

## 🚀 Quick Start Guide

### 1. Web Dashboard (Interactive Web App)

Run it using Python's built-in HTTP server:

```bash
# Navigate to the project directory
cd foot-step-counter

# Start a local web server
python -m http.server 8000
```

Then open your browser at:

<p>
  <a href="http://localhost:8000"><img src="https://img.shields.io/badge/🌐_Open_Web_App-http://localhost:8000-2196F3?style=for-the-badge" alt="Open Web App"></a>
</p>

- Select **Video File** mode to drag and drop a walking/running video.
- Select **Live Webcam** mode to run step detection live from your camera.

### 2. Python CLI Script (`foot_counter.py`)

**Install dependencies:**

```bash
pip install -r requirements.txt
```

**Usage:**

```bash
# Process a live webcam feed
python foot_counter.py --source 0

# Process a video file
python foot_counter.py --source path/to/walking_video.mp4

# Save the processed, annotated video to a file
python foot_counter.py --source walking_video.mp4 --output output_annotated.mp4

# Adjust the step-sensitivity threshold
python foot_counter.py --source 0 --threshold 0.18

# Run headlessly (no OpenCV display window)
python foot_counter.py --source walking_video.mp4 --no-display
```

**CLI options**

| Flag | Description | Default |
|---|---|---|
| `--source` | Camera index (`0`, `1`, ...) or path to an input video file | `0` |
| `--threshold` | Step sensitivity threshold | `0.15` |
| `--output` | Path to save the processed output video (`.mp4`) | *(none)* |
| `--no-display` | Run headlessly without opening the OpenCV window | `False` |

> ℹ️ The MediaPipe pose landmarker model (`pose_landmarker_full.task`) is auto-downloaded on first run of `foot_counter.py` if it isn't already present in the project folder.

---

## 📁 Project Structure

```
foot-step-counter/
├── index.html                  # Main web application UI
├── style.css                   # Glassmorphism & responsive dark-mode CSS
├── app.js                      # Web dashboard controller & audio synth
├── step_detector.js            # MediaPipe Tasks Vision JS wrapper & state machine
├── foot_counter.py             # Python standalone OpenCV + MediaPipe script
├── requirements.txt            # Python dependencies
├── pose_landmarker_full.task   # Pre-trained MediaPipe pose model (auto-downloaded)
└── README.md                   # Documentation
```

---

## 📊 How Step Counting Works

1. **Pose Keypoints** — extracts 33 body landmarks (hips #23/24, knees #25/26, ankles #27/28, heels #29/30, toes #31/32).
2. **Knee Angle Calculation** — computes the joint angle at the knee using the arccos of the normalized dot product of the thigh and shin vectors.
3. **Normalized Stride Delta** — vertical/horizontal separation between ankles, normalized by hip width, to stay consistent across camera distances.
4. **Hysteresis State Machine**
   - `LEFT_STEP` — triggered when the left ankle extends forward past the threshold with knee flexion.
   - `RIGHT_STEP` — triggered when the right ankle extends forward past the threshold with knee flexion.
   - `NEUTRAL` — recovery state between steps.
5. **Cadence Calculation** — a moving time window is used to compute Steps Per Minute (SPM).

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Pose Estimation | MediaPipe Pose Landmarker (Tasks Vision, Full model) |
| Web Frontend | HTML5, CSS3 (glassmorphism), vanilla JavaScript |
| Web Charts | Chart.js |
| Python Backend | OpenCV, MediaPipe, NumPy, Matplotlib |

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

<p>
  <a href="https://github.com/AbdulRehman-developer1/foot-step-counter/fork"><img src="https://img.shields.io/badge/Fork_this_repo-181717?style=for-the-badge&logo=github&logoColor=white" alt="Fork"></a>
  <a href="https://github.com/AbdulRehman-developer1/foot-step-counter/issues"><img src="https://img.shields.io/badge/Open_an_Issue-181717?style=for-the-badge&logo=github&logoColor=white" alt="Issues"></a>
  <a href="https://github.com/AbdulRehman-developer1/foot-step-counter/pulls"><img src="https://img.shields.io/badge/Submit_a_PR-181717?style=for-the-badge&logo=github&logoColor=white" alt="Pull Requests"></a>
</p>

1. Fork the project
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

<div align="center">

Made with ❤️ using MediaPipe · If this project helped you, consider giving it a ⭐

</div>
