import { PoseLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

export class StepDetector {
  constructor(options = {}) {
    this.threshold = options.threshold || 0.15;
    this.cooldownTime = options.cooldownTime || 0.25; // seconds
    
    this.totalSteps = 0;
    this.leftSteps = 0;
    this.rightSteps = 0;
    
    this.currentState = "NEUTRAL";
    this.lastStepTime = 0.0;
    this.stepTimestamps = [];
    this.stepLogs = [];
    
    this.smoothDeltaY = 0.0;
    this.alpha = 0.3; // EMA factor
    
    this.poseLandmarker = null;
    this.isReady = false;
    this.stepPulseAnimation = 0; // for canvas alert effect
  }

  async initialize() {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task`,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numPoses: 1
      });
      this.isReady = true;
      console.log("[StepDetector] MediaPipe PoseLandmarker initialized successfully!");
      return true;
    } catch (err) {
      console.error("[StepDetector] Failed to initialize MediaPipe PoseLandmarker:", err);
      // Try CPU fallback if GPU fails
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task`,
            delegate: "CPU"
          },
          runningMode: "VIDEO",
          numPoses: 1
        });
        this.isReady = true;
        console.log("[StepDetector] MediaPipe PoseLandmarker (CPU) initialized.");
        return true;
      } catch (err2) {
        console.error("[StepDetector] CPU Fallback also failed:", err2);
        return false;
      }
    }
  }

  resetStats() {
    this.totalSteps = 0;
    this.leftSteps = 0;
    this.rightSteps = 0;
    this.currentState = "NEUTRAL";
    this.lastStepTime = 0.0;
    this.stepTimestamps = [];
    this.stepLogs = [];
    this.smoothDeltaY = 0.0;
  }

  calculateAngle(a, b, c) {
    const ba = [a.x - b.x, a.y - b.y];
    const bc = [c.x - b.x, c.y - b.y];
    
    const dot = ba[0] * bc[0] + ba[1] * bc[1];
    const magA = Math.sqrt(ba[0] * ba[0] + ba[1] * ba[1]);
    const magB = Math.sqrt(bc[0] * bc[0] + bc[1] * bc[1]);
    
    if (magA * magB === 0) return 180;
    let cosAngle = dot / (magA * magB);
    cosAngle = Math.max(-1.0, Math.min(1.0, cosAngle));
    return (Math.acos(cosAngle) * 180.0) / Math.PI;
  }

  detectForVideo(videoElement, timestamp) {
    if (!this.isReady || !this.poseLandmarker) return null;
    const result = this.poseLandmarker.detectForVideo(videoElement, timestamp);
    if (!result || !result.landmarks || result.landmarks.length === 0) return null;

    const landmarks = result.landmarks[0];
    return this.processLandmarks(landmarks, timestamp / 1000.0);
  }

  processLandmarks(landmarks, timestampSeconds) {
    if (!landmarks || landmarks.length < 33) return null;

    const lHip = landmarks[23];
    const rHip = landmarks[24];
    const lKnee = landmarks[25];
    const rKnee = landmarks[26];
    const lAnkle = landmarks[27];
    const rAnkle = landmarks[28];

    // Hip width reference
    const dxHip = lHip.x - rHip.x;
    const dyHip = lHip.y - rHip.y;
    let hipWidth = Math.sqrt(dxHip * dxHip + dyHip * dyHip);
    if (hipWidth < 0.01) hipWidth = 0.1;

    // Knee angles
    const lKneeAngle = this.calculateAngle(lHip, lKnee, lAnkle);
    const rKneeAngle = this.calculateAngle(rHip, rKnee, rAnkle);

    // Relative ankle vertical delta (Left vs Right) normalized by hip width
    const rawDeltaY = (lAnkle.y - rAnkle.y) / hipWidth;
    this.smoothDeltaY = this.alpha * rawDeltaY + (1 - this.alpha) * this.smoothDeltaY;

    const timeSinceLast = timestampSeconds - this.lastStepTime;
    let stepTriggered = false;
    let triggeredFoot = null;

    // State Machine Detection
    if (timeSinceLast >= this.cooldownTime) {
      if (this.smoothDeltaY > this.threshold || (rawDeltaY > this.threshold * 0.8 && lKneeAngle < 165)) {
        if (this.currentState !== "LEFT_STEP") {
          this.currentState = "LEFT_STEP";
          this.leftSteps++;
          this.totalSteps++;
          this.lastStepTime = timestampSeconds;
          this.stepTimestamps.push(timestampSeconds);
          stepTriggered = true;
          triggeredFoot = "LEFT";

          this.logStep(timestampSeconds, "LEFT", lKneeAngle);
          this.stepPulseAnimation = 1.0;
        }
      } else if (this.smoothDeltaY < -this.threshold || (rawDeltaY < -this.threshold * 0.8 && rKneeAngle < 165)) {
        if (this.currentState !== "RIGHT_STEP") {
          this.currentState = "RIGHT_STEP";
          this.rightSteps++;
          this.totalSteps++;
          this.lastStepTime = timestampSeconds;
          this.stepTimestamps.push(timestampSeconds);
          stepTriggered = true;
          triggeredFoot = "RIGHT";

          this.logStep(timestampSeconds, "RIGHT", rKneeAngle);
          this.stepPulseAnimation = 1.0;
        }
      } else if (Math.abs(this.smoothDeltaY) < this.threshold * 0.5) {
        this.currentState = "NEUTRAL";
      }
    }

    // Clean up timestamps older than 60s
    this.stepTimestamps = this.stepTimestamps.filter(t => timestampSeconds - t <= 60.0);

    const cadenceSPM = this.getCadenceSPM(timestampSeconds);

    return {
      landmarks,
      lKneeAngle,
      rKneeAngle,
      smoothDeltaY: this.smoothDeltaY,
      state: this.currentState,
      stepTriggered,
      triggeredFoot,
      cadenceSPM
    };
  }

  logStep(timestampSeconds, foot, kneeAngle) {
    const formatTime = (sec) => {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      const ms = Math.floor((sec % 1) * 10);
      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
    };

    const event = {
      stepNum: this.totalSteps,
      timeStr: formatTime(timestampSeconds),
      timestamp: timestampSeconds,
      foot,
      kneeAngle: Math.round(kneeAngle),
      cadence: this.getCadenceSPM(timestampSeconds)
    };

    this.stepLogs.unshift(event); // newest first
    if (this.stepLogs.length > 100) this.stepLogs.pop();
  }

  getCadenceSPM(currentTimeSeconds) {
    const recent = this.stepTimestamps.filter(t => currentTimeSeconds - t <= 10.0);
    if (recent.length < 2) return 0.0;
    const timeSpan = currentTimeSeconds - recent[0];
    if (timeSpan <= 0) return 0.0;
    return Math.round(((recent.length - 1) / timeSpan) * 60.0 * 10) / 10;
  }

  renderSkeleton(ctx, width, height, result, options = {}) {
    if (!result || !result.landmarks) return;

    ctx.save();
    const landmarks = result.landmarks;

    const pt = (idx) => ({
      x: landmarks[idx].x * width,
      y: landmarks[idx].y * height,
      visibility: landmarks[idx].visibility || 1.0
    });

    const drawLine = (idx1, idx2, color, lineWidth = 4) => {
      const p1 = pt(idx1);
      const p2 = pt(idx2);
      if (p1.visibility < 0.3 || p2.visibility < 0.3) return;

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.stroke();
    };

    if (options.showSkeleton !== false) {
      // Torso Connections
      drawLine(11, 12, "#9d4edd", 4);
      drawLine(11, 23, "#9d4edd", 4);
      drawLine(12, 24, "#9d4edd", 4);
      drawLine(23, 24, "#9d4edd", 4);

      // Left Leg Connections (Cyan)
      drawLine(23, 25, "#00f0ff", 5);
      drawLine(25, 27, "#00f0ff", 5);
      drawLine(27, 29, "#00f0ff", 5);
      drawLine(29, 31, "#00f0ff", 5);
      drawLine(27, 31, "#00f0ff", 5);

      // Right Leg Connections (Orange)
      drawLine(24, 26, "#ff8c00", 5);
      drawLine(26, 28, "#ff8c00", 5);
      drawLine(28, 30, "#ff8c00", 5);
      drawLine(30, 32, "#ff8c00", 5);
      drawLine(28, 32, "#ff8c00", 5);

      // Draw Key Joints
      const joints = [23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
      joints.forEach(idx => {
        const p = pt(idx);
        if (p.visibility < 0.3) return;

        ctx.beginPath();
        ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = idx % 2 === 1 ? "#00f0ff" : "#ff8c00";
        ctx.fill();
      });
    }

    // Knee Angle Callouts
    if (options.showAngles !== false) {
      ctx.font = "bold 13px 'Space Mono', monospace";
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
      ctx.shadowBlur = 4;

      const pLKnee = pt(25);
      if (pLKnee.visibility > 0.3) {
        ctx.fillText(`${Math.round(result.lKneeAngle)}°`, pLKnee.x - 45, pLKnee.y);
      }

      const pRKnee = pt(26);
      if (pRKnee.visibility > 0.3) {
        ctx.fillText(`${Math.round(result.rKneeAngle)}°`, pRKnee.x + 15, pRKnee.y);
      }
    }

    // Pulse Alert Ring on Step
    if (this.stepPulseAnimation > 0) {
      ctx.lineWidth = 8 * this.stepPulseAnimation;
      ctx.strokeStyle = this.currentState === "LEFT_STEP" ? "rgba(0, 240, 255, " + this.stepPulseAnimation + ")" : "rgba(255, 140, 0, " + this.stepPulseAnimation + ")";
      ctx.strokeRect(10, 10, width - 20, height - 20);
      this.stepPulseAnimation -= 0.08;
      if (this.stepPulseAnimation < 0) this.stepPulseAnimation = 0;
    }

    ctx.restore();
  }
}
