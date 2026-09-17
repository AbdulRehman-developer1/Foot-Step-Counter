"""
Foot Step Counter using MediaPipe Pose Estimation
Supports live webcam stream or video file input.
"""

import cv2
import numpy as np
import mediapipe as mp
import time
import argparse
import os
import urllib.request

MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task"
MODEL_PATH = "pose_landmarker_full.task"

def ensure_model_exists():
    """Download MediaPipe pose landmarker model if not present."""
    if not os.path.exists(MODEL_PATH):
        print(f"[INFO] MediaPipe model task file not found. Downloading from {MODEL_URL}...")
        try:
            urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
            print(f"[INFO] Model downloaded successfully ({os.path.getsize(MODEL_PATH)} bytes).")
        except Exception as e:
            print(f"[ERROR] Failed to download model: {e}")
            raise

def calculate_angle(a, b, c):
    """
    Calculate angle at point b given 2D points a, b, c in degrees.
    a, b, c are tuples (x, y) or arrays.
    """
    a = np.array(a)
    b = np.array(b)
    c = np.array(c)
    
    ba = a - b
    bc = c - b
    
    cosine_angle = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-6)
    cosine_angle = np.clip(cosine_angle, -1.0, 1.0)
    angle = np.arccos(cosine_angle)
    return np.degrees(angle)

class FootStepDetector:
    def __init__(self, threshold=0.15, cooldown_time=0.25):
        self.threshold = threshold
        self.cooldown_time = cooldown_time  # Minimum seconds between consecutive steps
        
        self.total_steps = 0
        self.left_steps = 0
        self.right_steps = 0
        
        self.current_state = "NEUTRAL"
        self.last_step_time = 0.0
        self.step_timestamps = []
        
        # Exponential moving average filter for ankle delta
        self.smooth_delta_y = 0.0
        self.smooth_delta_x = 0.0
        self.alpha = 0.3  # smoothing factor
        
    def process_landmarks(self, landmarks, frame_timestamp):
        """
        Process pose landmarks and update step counter.
        Landmarks: list of 33 normalized landmarks from MediaPipe Pose.
        Indices:
          23: Left Hip, 24: Right Hip
          25: Left Knee, 26: Right Knee
          27: Left Ankle, 28: Right Ankle
          29: Left Heel, 30: Right Heel
          31: Left Foot Index, 32: Right Foot Index
        """
        if not landmarks or len(landmarks) < 33:
            return
        
        l_hip = [landmarks[23].x, landmarks[23].y]
        r_hip = [landmarks[24].x, landmarks[24].y]
        
        l_knee = [landmarks[25].x, landmarks[25].y]
        r_knee = [landmarks[26].x, landmarks[26].y]
        
        l_ankle = [landmarks[27].x, landmarks[27].y]
        r_ankle = [landmarks[28].x, landmarks[28].y]
        
        # Hip width reference for scale normalization
        hip_width = np.linalg.norm(np.array(l_hip) - np.array(r_hip))
        if hip_width < 0.01:
            hip_width = 0.1  # Fallback
            
        # Knee angles
        l_knee_angle = calculate_angle(l_hip, l_knee, l_ankle)
        r_knee_angle = calculate_angle(r_hip, r_knee, r_ankle)
        
        # Relative ankle position (Left vs Right) normalized by hip width
        raw_delta_y = (l_ankle[1] - r_ankle[1]) / hip_width
        raw_delta_x = (l_ankle[0] - r_ankle[0]) / hip_width
        
        # Smooth signal
        self.smooth_delta_y = self.alpha * raw_delta_y + (1 - self.alpha) * self.smooth_delta_y
        self.smooth_delta_x = self.alpha * raw_delta_x + (1 - self.alpha) * self.smooth_delta_x
        
        # Stride magnitude
        stride_dist = np.sqrt(self.smooth_delta_x**2 + self.smooth_delta_y**2)
        
        time_since_last = frame_timestamp - self.last_step_time
        
        # Step Detection Hysteresis State Machine
        # Left foot step: Left ankle moves significantly relative to right ankle
        if time_since_last >= self.cooldown_time:
            if self.smooth_delta_y > self.threshold or (raw_delta_y > self.threshold * 0.8 and l_knee_angle < 165):
                if self.current_state != "LEFT_STEP":
                    self.current_state = "LEFT_STEP"
                    self.left_steps += 1
                    self.total_steps += 1
                    self.last_step_time = frame_timestamp
                    self.step_timestamps.append(frame_timestamp)
            elif self.smooth_delta_y < -self.threshold or (raw_delta_y < -self.threshold * 0.8 and r_knee_angle < 165):
                if self.current_state != "RIGHT_STEP":
                    self.current_state = "RIGHT_STEP"
                    self.right_steps += 1
                    self.total_steps += 1
                    self.last_step_time = frame_timestamp
                    self.step_timestamps.append(frame_timestamp)
            elif abs(self.smooth_delta_y) < self.threshold * 0.5:
                self.current_state = "NEUTRAL"
                
        # Clean up old timestamps (keep last 60s for SPM calculation)
        self.step_timestamps = [t for t in self.step_timestamps if frame_timestamp - t <= 60.0]
        
        return {
            'l_knee_angle': l_knee_angle,
            'r_knee_angle': r_knee_angle,
            'delta_y': self.smooth_delta_y,
            'stride_dist': stride_dist,
            'state': self.current_state
        }
        
    def get_cadence_spm(self, current_time):
        """Calculate steps per minute (SPM) based on recent steps."""
        recent = [t for t in self.step_timestamps if current_time - t <= 10.0]
        if len(recent) < 2:
            return 0.0
        time_span = current_time - recent[0]
        if time_span <= 0:
            return 0.0
        spm = (len(recent) - 1) / time_span * 60.0
        return round(spm, 1)

def draw_pose_skeleton(frame, landmarks, stats_info):
    """Draw custom styled pose landmarks and annotations on the frame."""
    h, w, _ = frame.shape
    
    def pt(lm_idx):
        return int(landmarks[lm_idx].x * w), int(landmarks[lm_idx].y * h)

    # Connections to draw
    connections = [
        # Torso
        (11, 12, (180, 100, 255)), (11, 23, (180, 100, 255)),
        (12, 24, (180, 100, 255)), (23, 24, (180, 100, 255)),
        # Left Leg (Cyan)
        (23, 25, (255, 240, 0)), (25, 27, (255, 240, 0)),
        (27, 29, (255, 240, 0)), (29, 31, (255, 240, 0)), (27, 31, (255, 240, 0)),
        # Right Leg (Orange/Yellow)
        (24, 26, (0, 165, 255)), (26, 28, (0, 165, 255)),
        (28, 30, (0, 165, 255)), (30, 32, (0, 165, 255)), (28, 32, (0, 165, 255))
    ]
    
    for idx1, idx2, color in connections:
        if landmarks[idx1].visibility > 0.4 and landmarks[idx2].visibility > 0.4:
            cv2.line(frame, pt(idx1), pt(idx2), color, 3, cv2.LINE_AA)
            
    # Draw landmark joints
    joint_indices = [23, 24, 25, 26, 27, 28, 29, 30, 31, 32]
    for idx in joint_indices:
        if landmarks[idx].visibility > 0.4:
            cv2.circle(frame, pt(idx), 6, (255, 255, 255), -1, cv2.LINE_AA)
            cv2.circle(frame, pt(idx), 4, (0, 200, 255), -1, cv2.LINE_AA)
            
    # Draw Knee Angle labels
    if stats_info:
        l_knee_pt = pt(25)
        r_knee_pt = pt(26)
        cv2.putText(frame, f"{int(stats_info['l_knee_angle'])}deg", (l_knee_pt[0] - 50, l_knee_pt[1]),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2, cv2.LINE_AA)
        cv2.putText(frame, f"{int(stats_info['r_knee_angle'])}deg", (r_knee_pt[0] + 10, r_knee_pt[1]),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2, cv2.LINE_AA)

def draw_hud(frame, detector, current_time, stats_info):
    """Draw interactive stats dashboard on top of frame."""
    h, w, _ = frame.shape
    
    # Overlay panel (Semi-transparent dark box)
    panel_w, panel_h = 320, 180
    overlay = frame.copy()
    cv2.rectangle(overlay, (20, 20), (20 + panel_w, 20 + panel_h), (20, 24, 33), -1)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)
    cv2.rectangle(frame, (20, 20), (20 + panel_w, 20 + panel_h), (0, 230, 200), 2, cv2.LINE_AA)
    
    # Header Title
    cv2.putText(frame, "FOOT STEP COUNTER", (35, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 230, 200), 2, cv2.LINE_AA)
    
    # Total Steps Big Text
    cv2.putText(frame, f"STEPS: {detector.total_steps}", (35, 90), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (255, 255, 255), 3, cv2.LINE_AA)
    
    # Breakdown: Left / Right Steps
    cv2.putText(frame, f"L: {detector.left_steps} | R: {detector.right_steps}", (35, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 220, 255), 1, cv2.LINE_AA)
    
    # Cadence (SPM)
    spm = detector.get_cadence_spm(current_time)
    cv2.putText(frame, f"Cadence: {spm} SPM", (35, 145), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 150), 1, cv2.LINE_AA)
    
    # State Badge
    state = detector.current_state
    badge_color = (0, 255, 255) if state == "LEFT_STEP" else ((0, 165, 255) if state == "RIGHT_STEP" else (150, 150, 150))
    cv2.putText(frame, f"State: {state}", (35, 172), cv2.FONT_HERSHEY_SIMPLEX, 0.55, badge_color, 2, cv2.LINE_AA)

def main():
    parser = argparse.ArgumentParser(description="MediaPipe Foot Step Counter")
    parser.add_argument("--source", type=str, default="0", help="Video source: camera index (0, 1) or path to video file")
    parser.add_argument("--threshold", type=float, default=0.15, help="Step sensitivity threshold (default: 0.15)")
    parser.add_argument("--output", type=str, default="", help="Optional output video file path")
    parser.add_argument("--no-display", action="store_true", help="Run without opening display window")
    args = parser.parse_args()
    
    ensure_model_exists()
    
    # Parse source argument
    source = args.source
    if source.isdigit():
        source = int(source)
        
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print(f"[ERROR] Could not open video source: {args.source}")
        return

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or np.isnan(fps):
        fps = 30.0
        
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    writer = None
    if args.output:
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(args.output, fourcc, fps, (width, height))
        print(f"[INFO] Saving processed video to: {args.output}")

    detector = FootStepDetector(threshold=args.threshold)
    
    # Initialize MediaPipe PoseLandmarker
    BaseOptions = mp.tasks.BaseOptions
    PoseLandmarker = mp.tasks.vision.PoseLandmarker
    PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
    VisionRunningMode = mp.tasks.vision.RunningMode

    options = PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=VisionRunningMode.VIDEO
    )

    landmarker = PoseLandmarker.create_from_options(options)
    
    print("[INFO] Starting Foot Step Counter. Press 'q' or ESC in display window to quit.")
    
    frame_count = 0
    start_time = time.time()
    
    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                if isinstance(source, str) and not args.no_display:
                    # Video ended: display replay prompt overlay
                    overlay = frame.copy() if 'frame' in locals() and frame is not None else np.zeros((height, width, 3), dtype=np.uint8)
                    cv2.rectangle(overlay, (width//4, height//3), (3*width//4, 2*height//3), (20, 24, 33), -1)
                    cv2.rectangle(overlay, (width//4, height//3), (3*width//4, 2*height//3), (0, 230, 200), 2)
                    cv2.putText(overlay, "VIDEO COMPLETED!", (width//4 + 30, height//3 + 50),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 200), 2, cv2.LINE_AA)
                    cv2.putText(overlay, f"Total Steps: {detector.total_steps}", (width//4 + 30, height//3 + 90),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
                    cv2.putText(overlay, "Press 'R' to Replay | Press 'Q' or ESC to Exit", (width//4 + 20, height//3 + 130),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 220, 255), 1, cv2.LINE_AA)
                    cv2.imshow("MediaPipe Foot Step Counter", overlay)
                    
                    key = cv2.waitKey(0) & 0xFF
                    if key == ord('r') or key == ord('R'):
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        frame_count = 0
                        detector = FootStepDetector(threshold=args.threshold)
                        continue
                    else:
                        break
                else:
                    break
                
            frame_count += 1
            timestamp_ms = int((frame_count / fps) * 1000)
            current_time = frame_count / fps
            
            # Convert BGR to RGB for MediaPipe
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
            
            # Run detection
            result = landmarker.detect_for_video(mp_image, timestamp_ms)
            
            stats_info = None
            if result and result.pose_landmarks and len(result.pose_landmarks) > 0:
                landmarks = result.pose_landmarks[0]
                stats_info = detector.process_landmarks(landmarks, current_time)
                draw_pose_skeleton(frame, landmarks, stats_info)
                
            draw_hud(frame, detector, current_time, stats_info)
            
            if writer:
                writer.write(frame)
                
            if not args.no_display:
                cv2.imshow("MediaPipe Foot Step Counter", frame)
                key = cv2.waitKey(1) & 0xFF
                if key == ord('q') or key == 27:  # ESC or q
                    break
    finally:
        landmarker.close()
        cap.release()
        if writer:
            writer.release()
        cv2.destroyAllWindows()
        
    total_elapsed = time.time() - start_time
    print("\n" + "="*45)
    print("      FOOT STEP COUNTER SUMMARY REPORT      ")
    print("="*45)
    print(f" Total Steps Tracked : {detector.total_steps}")
    print(f" Left Leg Steps     : {detector.left_steps}")
    print(f" Right Leg Steps    : {detector.right_steps}")
    print(f" Frames Processed   : {frame_count}")
    print(f" Elapsed Time       : {total_elapsed:.2f} seconds")
    print(f" Average Cadence    : {detector.get_cadence_spm(frame_count / fps)} SPM")
    print("="*45)

if __name__ == "__main__":
    main()
