import { StepDetector } from './step_detector.js';

document.addEventListener('DOMContentLoaded', async () => {
  // UI Elements
  const tabVideo = document.getElementById('tab-video');
  const tabWebcam = document.getElementById('tab-webcam');
  const fileDropzone = document.getElementById('file-dropzone');
  const fileInput = document.getElementById('file-input');
  const btnBrowseFile = document.getElementById('btn-browse-file');

  const videoElement = document.getElementById('video-element');
  const canvasElement = document.getElementById('skeleton-canvas');
  const ctx = canvasElement.getContext('2d');

  const statusText = document.getElementById('status-text');
  const motionBadge = document.getElementById('motion-state-badge');
  const videoControlBar = document.getElementById('video-control-bar');
  const webcamControlBar = document.getElementById('webcam-controls-bar');
  const cameraSelect = document.getElementById('camera-select');
  const btnToggleWebcam = document.getElementById('btn-toggle-webcam');

  const btnPlayPause = document.getElementById('btn-play-pause');
  const btnOpenDropzone = document.getElementById('btn-open-dropzone');
  const timelineSlider = document.getElementById('timeline-slider');
  const timeDisplay = document.getElementById('time-display');
  const btnAudioToggle = document.getElementById('btn-audio-toggle');
  const btnReset = document.getElementById('btn-reset');
  const btnExportCsv = document.getElementById('btn-export-csv');

  // Sliders & Checkboxes
  const sensitivitySlider = document.getElementById('sensitivity-slider');
  const sensitivityVal = document.getElementById('sensitivity-val');
  const cooldownSlider = document.getElementById('cooldown-slider');
  const cooldownVal = document.getElementById('cooldown-val');

  const chkSkeleton = document.getElementById('chk-skeleton');
  const chkAngles = document.getElementById('chk-angles');
  const chkAlert = document.getElementById('chk-alert');
  const chkLoop = document.getElementById('chk-loop');

  // Completion Overlay Modal
  const completionOverlay = document.getElementById('completion-overlay');
  const completionStepsNum = document.getElementById('completion-steps-num');
  const btnReplayVideo = document.getElementById('btn-replay-video');
  const btnChangeVideo = document.getElementById('btn-change-video');

  // Metrics
  const valTotalSteps = document.getElementById('val-total-steps');
  const valCadence = document.getElementById('val-cadence');
  const valLeftSteps = document.getElementById('val-left-steps');
  const valLeftPct = document.getElementById('val-left-pct');
  const valRightSteps = document.getElementById('val-right-steps');
  const valRightPct = document.getElementById('val-right-pct');

  const balanceBarLeft = document.getElementById('balance-bar-left');
  const balanceBarRight = document.getElementById('balance-bar-right');
  const balanceText = document.getElementById('balance-text');

  const stepLogTbody = document.getElementById('step-log-tbody');
  const logCountBadge = document.getElementById('log-count-badge');

  // App State
  let currentMode = 'video'; // 'video' or 'webcam'
  let isWebcamActive = false;
  let webcamStream = null;
  let animationFrameId = null;
  let audioEnabled = true;

  // Initialize Detector
  statusText.textContent = "Loading MediaPipe Models...";
  const detector = new StepDetector({
    threshold: parseFloat(sensitivitySlider.value),
    cooldownTime: parseFloat(cooldownSlider.value)
  });

  const isInitialized = await detector.initialize();
  if (isInitialized) {
    statusText.textContent = "Ready - Upload Video or Start Webcam";
  } else {
    statusText.textContent = "Error loading MediaPipe models.";
  }

  // Audio Feedback Synthesizer (Web Audio API)
  let audioCtx = null;
  function playStepChime(foot) {
    if (!audioEnabled) return;
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      // Left foot higher pitch, right foot lower pitch
      osc.frequency.setValueAtTime(foot === 'LEFT' ? 660 : 520, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
      console.warn("Audio chime error:", e);
    }
  }

  // Chart.js Setup
  const chartCanvas = document.getElementById('stride-chart').getContext('2d');
  const maxChartPoints = 40;
  const chartData = {
    labels: Array(maxChartPoints).fill(''),
    datasets: [
      {
        label: 'Stride Signal (Left/Right Delta)',
        data: Array(maxChartPoints).fill(0),
        borderColor: '#00f0ff',
        backgroundColor: 'rgba(0, 240, 255, 0.1)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: 0
      },
      {
        label: 'Step Threshold',
        data: Array(maxChartPoints).fill(detector.threshold),
        borderColor: 'rgba(255, 255, 255, 0.25)',
        borderDash: [5, 5],
        borderWidth: 1,
        pointRadius: 0
      }
    ]
  };

  const strideChart = new Chart(chartCanvas, {
    type: 'line',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: { display: false },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#8b949e', font: { family: 'Space Mono', size: 10 } }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });

  function updateChart(deltaVal, thresholdVal) {
    chartData.datasets[0].data.push(deltaVal);
    chartData.datasets[0].data.shift();
    chartData.datasets[1].data.push(thresholdVal);
    chartData.datasets[1].data.shift();
    strideChart.update();
  }

  // Tab Switcher Logic
  tabVideo.addEventListener('click', () => switchTab('video'));
  tabWebcam.addEventListener('click', () => switchTab('webcam'));

  let loadedVideoFile = null;

  function switchTab(mode) {
    currentMode = mode;
    tabVideo.classList.toggle('active', mode === 'video');
    tabWebcam.classList.toggle('active', mode === 'webcam');

    if (mode === 'video') {
      stopWebcam();
      webcamControlBar.style.display = 'none';
      videoControlBar.style.display = 'flex';
      completionOverlay.style.display = 'none';

      // Restore video source if previously loaded, else show dropzone
      if (loadedVideoFile) {
        videoElement.srcObject = null;
        videoElement.src = URL.createObjectURL(loadedVideoFile);
        fileDropzone.style.display = 'none';
        statusText.textContent = `Video: ${loadedVideoFile.name}`;
      } else {
        fileDropzone.style.display = 'flex';
        statusText.textContent = "Upload a video file to begin";
      }
    } else {
      pauseVideo();
      videoElement.srcObject = null;
      completionOverlay.style.display = 'none';
      fileDropzone.style.display = 'none';
      videoControlBar.style.display = 'none';
      webcamControlBar.style.display = 'flex';
      populateCameraList();
      statusText.textContent = "Webcam mode ready";
    }
  }

  // File Upload Handlers
  btnBrowseFile.addEventListener('click', () => fileInput.click());
  if (btnOpenDropzone) {
    btnOpenDropzone.addEventListener('click', () => {
      pauseVideo();
      fileDropzone.style.display = 'flex';
      completionOverlay.style.display = 'none';
    });
  }

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      loadVideoFile(e.target.files[0]);
    }
  });

  fileDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileDropzone.classList.add('dragover');
  });

  fileDropzone.addEventListener('dragleave', () => fileDropzone.classList.remove('dragover'));

  fileDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    fileDropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      loadVideoFile(e.dataTransfer.files[0]);
    }
  });

  function loadVideoFile(file) {
    stopWebcam();
    loadedVideoFile = file;
    const fileURL = URL.createObjectURL(file);
    videoElement.srcObject = null;
    videoElement.src = fileURL;
    videoElement.style.display = 'none';
    fileDropzone.style.display = 'none';
    completionOverlay.style.display = 'none';
    detector.resetStats();
    updateUI();

    videoElement.onloadedmetadata = () => {
      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;
      statusText.textContent = `Playing: ${file.name}`;
      videoElement.play();
      btnPlayPause.innerHTML = '<i class="fa-solid fa-pause"></i>';
      startProcessingLoop();
    };
  }

  // Video Controls
  btnPlayPause.addEventListener('click', () => {
    if (videoElement.paused) {
      videoElement.play();
      btnPlayPause.innerHTML = '<i class="fa-solid fa-pause"></i>';
      startProcessingLoop();
    } else {
      pauseVideo();
    }
  });

  function pauseVideo() {
    videoElement.pause();
    btnPlayPause.innerHTML = '<i class="fa-solid fa-play"></i>';
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  videoElement.addEventListener('timeupdate', () => {
    if (videoElement.duration) {
      const pct = (videoElement.currentTime / videoElement.duration) * 100;
      timelineSlider.value = pct;
      timeDisplay.textContent = `${formatTime(videoElement.currentTime)} / ${formatTime(videoElement.duration)}`;
    }
  });

  timelineSlider.addEventListener('input', () => {
    if (videoElement.duration) {
      videoElement.currentTime = (timelineSlider.value / 100) * videoElement.duration;
    }
  });

  videoElement.addEventListener('ended', () => {
    pauseVideo();
    if (chkLoop.checked) {
      videoElement.currentTime = 0;
      videoElement.play();
      btnPlayPause.innerHTML = '<i class="fa-solid fa-pause"></i>';
      startProcessingLoop();
    } else {
      // Show Completion Overlay Modal
      completionStepsNum.textContent = detector.totalSteps;
      completionOverlay.style.display = 'flex';
      statusText.textContent = "Video Completed";
    }
  });

  btnReplayVideo.addEventListener('click', () => {
    completionOverlay.style.display = 'none';
    videoElement.currentTime = 0;
    detector.resetStats();
    updateUI();
    videoElement.play();
    btnPlayPause.innerHTML = '<i class="fa-solid fa-pause"></i>';
    startProcessingLoop();
  });

  btnChangeVideo.addEventListener('click', () => {
    completionOverlay.style.display = 'none';
    fileDropzone.style.display = 'flex';
    statusText.textContent = "Select another video file";
  });

  btnAudioToggle.addEventListener('click', () => {
    audioEnabled = !audioEnabled;
    btnAudioToggle.innerHTML = audioEnabled 
      ? '<i class="fa-solid fa-volume-high"></i>' 
      : '<i class="fa-solid fa-volume-xmark"></i>';
    btnAudioToggle.style.color = audioEnabled ? 'var(--text-main)' : 'var(--accent-orange)';
  });

  // Webcam Controls
  async function populateCameraList() {
    cameraSelect.innerHTML = '<option value="">Default Camera</option>';
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      videoDevices.forEach((device, i) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Camera ${i + 1}`;
        cameraSelect.appendChild(option);
      });
    } catch (e) {
      console.warn("Could not list video devices:", e);
    }
  }

  btnToggleWebcam.addEventListener('click', async () => {
    if (isWebcamActive) {
      stopWebcam();
    } else {
      await startWebcam();
    }
  });

  async function startWebcam() {
    const deviceId = cameraSelect.value;
    const constraints = {
      video: deviceId ? { deviceId: { exact: deviceId } } : { width: 1280, height: 720 }
    };

    try {
      webcamStream = await navigator.mediaDevices.getUserMedia(constraints);
      videoElement.srcObject = webcamStream;
      videoElement.play();
      isWebcamActive = true;

      btnToggleWebcam.innerHTML = '<i class="fa-solid fa-power-off"></i> Stop Webcam';
      btnToggleWebcam.classList.remove('btn-emerald');
      btnToggleWebcam.classList.add('btn-secondary');
      statusText.textContent = "Live Webcam Stream Running";

      videoElement.onloadedmetadata = () => {
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
        detector.resetStats();
        updateUI();
        startProcessingLoop();
      };
    } catch (err) {
      alert("Could not access camera: " + err.message);
    }
  }

  function stopWebcam() {
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
      webcamStream = null;
    }
    isWebcamActive = false;
    btnToggleWebcam.innerHTML = '<i class="fa-solid fa-power-off"></i> Start Webcam';
    btnToggleWebcam.classList.remove('btn-secondary');
    btnToggleWebcam.classList.add('btn-emerald');
    statusText.textContent = "Webcam Stopped";
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  // Processing Animation Loop
  function startProcessingLoop() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    const processFrame = () => {
      if ((currentMode === 'video' && videoElement.paused) || (currentMode === 'webcam' && !isWebcamActive)) {
        return;
      }

      ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

      if (videoElement.readyState >= 2) {
        // Draw underlying video frame onto canvas
        ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

        // Run detection
        const timestamp = performance.now();
        const result = detector.detectForVideo(videoElement, timestamp);

        if (result) {
          detector.renderSkeleton(ctx, canvasElement.width, canvasElement.height, result, {
            showSkeleton: chkSkeleton.checked,
            showAngles: chkAngles.checked,
            showAlert: chkAlert.checked
          });

          if (result.stepTriggered) {
            playStepChime(result.triggeredFoot);
          }

          updateChart(result.smoothDeltaY, detector.threshold);
          updateUI(result);
        }
      }

      animationFrameId = requestAnimationFrame(processFrame);
    };

    processFrame();
  }

  // UI Settings Sliders
  sensitivitySlider.addEventListener('input', () => {
    const val = parseFloat(sensitivitySlider.value);
    sensitivityVal.textContent = val.toFixed(2);
    detector.threshold = val;
  });

  cooldownSlider.addEventListener('input', () => {
    const val = parseFloat(cooldownSlider.value);
    cooldownVal.textContent = val.toFixed(2) + 's';
    detector.cooldownTime = val;
  });

  // Toggle Chips Styling & Click
  document.querySelectorAll('.toggle-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      const checkbox = chip.querySelector('input[type="checkbox"]');
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
      }
      chip.classList.toggle('active', checkbox.checked);
    });
  });

  btnReset.addEventListener('click', () => {
    detector.resetStats();
    updateUI();
  });

  // Export CSV
  btnExportCsv.addEventListener('click', () => {
    if (detector.stepLogs.length === 0) {
      alert("No steps recorded to export.");
      return;
    }

    let csvContent = "data:text/csv;charset=utf-8,Step Number,Timestamp,Foot,Knee Angle (deg),Cadence (SPM)\n";
    detector.stepLogs.slice().reverse().forEach(log => {
      csvContent += `${log.stepNum},${log.timeStr},${log.foot},${log.kneeAngle},${log.cadence}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `footstep_log_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // UI State Updater
  function updateUI(result = null) {
    valTotalSteps.textContent = detector.totalSteps;
    valLeftSteps.textContent = detector.leftSteps;
    valRightSteps.textContent = detector.rightSteps;

    const cadence = result ? result.cadenceSPM : 0;
    valCadence.textContent = cadence.toFixed(1);

    // Distribution calculation
    const total = detector.totalSteps;
    const leftPct = total > 0 ? Math.round((detector.leftSteps / total) * 100) : 50;
    const rightPct = total > 0 ? (100 - leftPct) : 50;

    valLeftPct.textContent = `${leftPct}% distribution`;
    valRightPct.textContent = `${rightPct}% distribution`;

    balanceBarLeft.style.width = `${leftPct}%`;
    balanceBarRight.style.width = `${rightPct}%`;
    balanceText.textContent = `${leftPct}% Left / ${rightPct}% Right`;

    // Motion state badge
    const state = detector.currentState;
    motionBadge.textContent = state.replace('_', ' ');
    motionBadge.className = 'motion-state-badge';
    if (state === 'LEFT_STEP') motionBadge.classList.add('left-step');
    if (state === 'RIGHT_STEP') motionBadge.classList.add('right-step');

    // Update Step Log Table
    renderStepLogs();
  }

  function renderStepLogs() {
    logCountBadge.textContent = `${detector.stepLogs.length} events`;

    if (detector.stepLogs.length === 0) {
      stepLogTbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="5">No steps recorded yet. Start video or webcam.</td>
        </tr>`;
      return;
    }

    stepLogTbody.innerHTML = detector.stepLogs.map(log => `
      <tr>
        <td>#${log.stepNum}</td>
        <td>${log.timeStr}</td>
        <td><span class="foot-tag ${log.foot.toLowerCase()}">${log.foot}</span></td>
        <td>${log.kneeAngle}°</td>
        <td>${log.cadence} SPM</td>
      </tr>
    `).join('');
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
});
