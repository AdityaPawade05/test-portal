/**
 * AI Computer Vision & Multi-Object Detection Engine for Webcam Proctoring
 * Supports real-time detection & warnings for:
 * - Mobile phones & smart devices (phones, tablets, smart watches, remotes)
 * - Books, notebooks, open documents & cheat sheets
 * - Secondary screens, laptops & external monitors
 * - Audio devices, headphones, headsets & earphones
 * - Multiple people / unauthorized background persons
 * - Face presence, head pose (looking left/right/down/away), and motion tracking
 */

export type ProhibitedCategory =
  | "PHONE"
  | "BOOK_NOTES"
  | "SECONDARY_SCREEN"
  | "AUDIO_DEVICE"
  | "MULTIPLE_PEOPLE"
  | "SUSPICIOUS_OBJECT";

export type DetectedObject = {
  label: string;
  category?: ProhibitedCategory;
  confidence: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
  isProhibited: boolean;
};

export type FacePose =
  | "CENTERED"
  | "LOOKING_LEFT"
  | "LOOKING_RIGHT"
  | "LOOKING_DOWN"
  | "LOOKING_UP"
  | "OUT_OF_FRAME"
  | "MULTIPLE_FACES";

export type VisionAnalysisResult = {
  faceCount: number;
  facePose: FacePose;
  faceBbox: [number, number, number, number] | null;
  phoneDetected: boolean;
  phoneConfidence: number;
  bookDetected: boolean;
  screenDetected: boolean;
  audioDeviceDetected: boolean;
  multiplePeopleDetected: boolean;
  otherObjectDetected: boolean;
  prohibitedObjects: DetectedObject[];
  detectedObjects: DetectedObject[];
  movementDelta: number;
  lightingStatus: "GOOD" | "LOW_LIGHT" | "BLOCKED";
  warnings: string[];
};

// Global TF & Model cache
let cocoModelPromise: Promise<any> | null = null;

/**
 * Dynamically loads TensorFlow.js & COCO-SSD from trusted CDN with caching
 */
export async function loadCocoModel(): Promise<any> {
  if (typeof window === "undefined") return null;

  const win = window as any;
  if (win.cocoSsdModel) return win.cocoSsdModel;
  if (cocoModelPromise) return cocoModelPromise;

  cocoModelPromise = new Promise(async (resolve) => {
    try {
      if (!win.tf) {
        await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js");
      }
      if (!win.cocoSsd) {
        await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js");
      }

      if (win.cocoSsd) {
        const model = await win.cocoSsd.load({ base: "lite_mobilenet_v2" });
        win.cocoSsdModel = model;
        resolve(model);
        return;
      }
    } catch (err) {
      console.warn("[VisionProctor] Deep learning model load warning, using optical fallback:", err);
    }
    resolve(null);
  });

  return cocoModelPromise;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = (e) => reject(e);
    document.head.appendChild(script);
  });
}

/**
 * Advanced Optical Face & Head Pose Tracking using skin cluster & spatial luminance gradients
 */
export function analyzeFaceGeometry(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  prevFaceCenter: { x: number; y: number } | null
): {
  faceCount: number;
  facePose: FacePose;
  faceBbox: [number, number, number, number] | null;
  faceCenter: { x: number; y: number } | null;
  movementDelta: number;
  lightingStatus: "GOOD" | "LOW_LIGHT" | "BLOCKED";
} {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  let totalLum = 0;
  const skinPixels: { x: number; y: number; lum: number }[] = [];

  // Skin tone & facial region filter in YCbCr / HSV color space
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      totalLum += lum;

      // Normalized skin-tone heuristic
      const isSkin =
        r > 60 &&
        g > 40 &&
        b > 20 &&
        r > g &&
        r > b &&
        Math.abs(r - g) > 12 &&
        r - g < 110 &&
        r / (g || 1) > 1.08;

      if (isSkin) {
        skinPixels.push({ x, y, lum });
      }
    }
  }

  const sampleCount = (width * height) / 4;
  const avgBrightness = totalLum / (sampleCount || 1);

  let lightingStatus: "GOOD" | "LOW_LIGHT" | "BLOCKED" = "GOOD";
  if (avgBrightness < 12) lightingStatus = "BLOCKED";
  else if (avgBrightness < 35) lightingStatus = "LOW_LIGHT";

  if (skinPixels.length < 30) {
    return {
      faceCount: 0,
      facePose: "OUT_OF_FRAME",
      faceBbox: null,
      faceCenter: null,
      movementDelta: 0,
      lightingStatus,
    };
  }

  // Cluster spatial skin pixels
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  let sumX = 0;
  let sumY = 0;

  for (const p of skinPixels) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    sumX += p.x;
    sumY += p.y;
  }

  const count = skinPixels.length;
  const centerX = sumX / count;
  const centerY = sumY / count;

  // Multi-face check (bimodal spatial split on X axis)
  let leftCount = 0;
  let rightCount = 0;
  const midX = (minX + maxX) / 2;
  const spanX = maxX - minX;

  for (const p of skinPixels) {
    if (p.x < midX - spanX * 0.25) leftCount++;
    if (p.x > midX + spanX * 0.25) rightCount++;
  }

  const isMultiFace =
    spanX > width * 0.65 && leftCount > count * 0.25 && rightCount > count * 0.25;

  // Head pose estimation via asymmetry of facial center vs bounding box
  const normalizedCenterX = centerX / width;
  const normalizedCenterY = centerY / height;
  const bboxWidth = Math.max(20, maxX - minX);
  const bboxHeight = Math.max(25, maxY - minY);

  // Compute movement delta
  let movementDelta = 0;
  if (prevFaceCenter) {
    const dx = centerX - prevFaceCenter.x;
    const dy = centerY - prevFaceCenter.y;
    movementDelta = Math.sqrt(dx * dx + dy * dy);
  }

  let facePose: FacePose = "CENTERED";
  if (isMultiFace) {
    facePose = "MULTIPLE_FACES";
  } else if (normalizedCenterX < 0.32) {
    facePose = "LOOKING_RIGHT"; // Camera mirror invert
  } else if (normalizedCenterX > 0.68) {
    facePose = "LOOKING_LEFT";
  } else if (normalizedCenterY > 0.72) {
    facePose = "LOOKING_DOWN";
  } else if (normalizedCenterY < 0.25) {
    facePose = "LOOKING_UP";
  }

  // Expanded bounding box with padding
  const padX = bboxWidth * 0.15;
  const padY = bboxHeight * 0.2;
  const faceBbox: [number, number, number, number] = [
    Math.max(0, minX - padX),
    Math.max(0, minY - padY),
    Math.min(width - minX, bboxWidth + padX * 2),
    Math.min(height - minY, bboxHeight + padY * 2),
  ];

  return {
    faceCount: isMultiFace ? 2 : 1,
    facePose,
    faceBbox,
    faceCenter: { x: centerX, y: centerY },
    movementDelta,
    lightingStatus,
  };
}

/**
 * Optical Device & Phone Screen Heuristic Detector
 * Detects rectangular high-contrast phone screen / bezel objects in the lower/side perimeter
 */
export function detectPhoneHeuristic(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  faceBbox: [number, number, number, number] | null
): DetectedObject[] {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const objects: DetectedObject[] = [];

  const scanStartY = Math.floor(height * 0.35);
  let bestCandidate: { x: number; y: number; w: number; h: number; score: number } | null = null;

  const cellW = 16;
  const cellH = 24;

  for (let y = scanStartY; y < height - cellH; y += 8) {
    for (let x = 4; x < width - cellW; x += 8) {
      if (faceBbox) {
        const [fx, fy, fw, fh] = faceBbox;
        if (x >= fx && x <= fx + fw && y >= fy && y <= fy + fh) continue;
      }

      let lumSum = 0;
      let edgeCount = 0;

      for (let cy = 0; cy < cellH; cy += 2) {
        for (let cx = 0; cx < cellW; cx += 2) {
          const idx = ((y + cy) * width + (x + cx)) * 4;
          const lum = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          lumSum += lum;

          if (cx < cellW - 2) {
            const nextLum = (data[idx + 8] + data[idx + 9] + data[idx + 10]) / 3;
            if (Math.abs(lum - nextLum) > 40) edgeCount++;
          }
        }
      }

      const meanLum = lumSum / ((cellW * cellH) / 4);
      if (edgeCount > 18 && (meanLum > 180 || meanLum < 30)) {
        const score = edgeCount / 40;
        if (score > 0.65 && (!bestCandidate || score > bestCandidate.score)) {
          bestCandidate = {
            x,
            y,
            w: cellW * 2,
            h: cellH * 2,
            score: Math.min(0.95, score),
          };
        }
      }
    }
  }

  if (bestCandidate) {
    objects.push({
      label: "cell phone",
      category: "PHONE",
      confidence: bestCandidate.score,
      bbox: [bestCandidate.x, bestCandidate.y, bestCandidate.w, bestCandidate.h],
      isProhibited: true,
    });
  }

  return objects;
}

/**
 * Optical Book / Notes / Paper Sheet Heuristic Detector
 * Detects large, high-luminance rectangular horizontal regions in the lower perimeter
 */
export function detectBookOrNotesHeuristic(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  faceBbox: [number, number, number, number] | null
): DetectedObject[] {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const objects: DetectedObject[] = [];

  // Look for wide, high-contrast white paper areas in the bottom half
  const startY = Math.floor(height * 0.55);
  let whitePixelCount = 0;
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;

  for (let y = startY; y < height - 4; y += 4) {
    for (let x = 8; x < width - 8; x += 4) {
      if (faceBbox) {
        const [fx, fy, fw, fh] = faceBbox;
        if (x >= fx && x <= fx + fw && y >= fy && y <= fy + fh) continue;
      }

      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      // High brightness & low saturation (paper / note sheet)
      const isWhitePaper = lum > 210 && Math.abs(r - g) < 15 && Math.abs(r - b) < 15;
      if (isWhitePaper) {
        whitePixelCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const paperAreaWidth = maxX - minX;
  const paperAreaHeight = maxY - minY;

  // If a significant dense white rectangular paper region is detected
  if (whitePixelCount > 45 && paperAreaWidth > width * 0.35 && paperAreaHeight > 18) {
    objects.push({
      label: "book / notes",
      category: "BOOK_NOTES",
      confidence: Math.min(0.88, 0.5 + whitePixelCount / 100),
      bbox: [minX, minY, paperAreaWidth, paperAreaHeight],
      isProhibited: true,
    });
  }

  return objects;
}

/**
 * Optical Over-Ear / Headphone Heuristic Detector
 * Detects dark or contrasting ear-covering clusters flanking the face bounding box
 */
export function detectHeadphonesHeuristic(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  faceBbox: [number, number, number, number] | null
): DetectedObject[] {
  if (!faceBbox) return [];

  const [fx, fy, fw, fh] = faceBbox;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Sample left ear & right ear perimeter regions
  const earRegionW = Math.max(10, Math.floor(fw * 0.22));
  const earRegionH = Math.max(15, Math.floor(fh * 0.35));
  const earY = Math.floor(fy + fh * 0.25);

  const leftEarX = Math.max(0, Math.floor(fx - earRegionW * 0.8));
  const rightEarX = Math.min(width - earRegionW, Math.floor(fx + fw - earRegionW * 0.2));

  let leftDark = 0;
  let rightDark = 0;
  const totalSamples = (earRegionW * earRegionH) / 4;

  for (let y = 0; y < earRegionH; y += 2) {
    for (let x = 0; x < earRegionW; x += 2) {
      const idxL = ((earY + y) * width + (leftEarX + x)) * 4;
      const idxR = ((earY + y) * width + (rightEarX + x)) * 4;

      const lumL = (data[idxL] + data[idxL + 1] + data[idxL + 2]) / 3;
      const lumR = (data[idxR] + data[idxR + 1] + data[idxR + 2]) / 3;

      if (lumL < 45) leftDark++;
      if (lumR < 45) rightDark++;
    }
  }

  const leftDarkRatio = leftDark / (totalSamples || 1);
  const rightDarkRatio = rightDark / (totalSamples || 1);

  if (leftDarkRatio > 0.65 && rightDarkRatio > 0.65) {
    return [
      {
        label: "headphones",
        category: "AUDIO_DEVICE",
        confidence: 0.76,
        bbox: [
          leftEarX,
          earY,
          rightEarX + earRegionW - leftEarX,
          earRegionH,
        ],
        isProhibited: true,
      },
    ];
  }

  return [];
}

/**
 * High-performance full vision proctoring analyzer with Multi-Object Detection
 */
export async function analyzeVideoFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  prevFaceCenter: { x: number; y: number } | null
): Promise<VisionAnalysisResult> {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx || video.readyState < 2) {
    return {
      faceCount: 0,
      facePose: "OUT_OF_FRAME",
      faceBbox: null,
      phoneDetected: false,
      phoneConfidence: 0,
      bookDetected: false,
      screenDetected: false,
      audioDeviceDetected: false,
      multiplePeopleDetected: false,
      otherObjectDetected: false,
      prohibitedObjects: [],
      detectedObjects: [],
      movementDelta: 0,
      lightingStatus: "GOOD",
      warnings: [],
    };
  }

  ctx.drawImage(video, 0, 0, width, height);

  // 1. Face & Head Pose Analysis
  const faceRes = analyzeFaceGeometry(ctx, width, height, prevFaceCenter);

  // 2. Object & Device Detection (COCO-SSD with Optical Fallback)
  const detectedObjects: DetectedObject[] = [];
  const prohibitedObjects: DetectedObject[] = [];

  let phoneDetected = false;
  let phoneConfidence = 0;
  let bookDetected = false;
  let screenDetected = false;
  let audioDeviceDetected = false;
  let multiplePeopleDetected = faceRes.faceCount > 1 || faceRes.facePose === "MULTIPLE_FACES";
  let otherObjectDetected = false;

  let personCount = 0;

  const win = (typeof window !== "undefined" ? window : {}) as any;
  if (win.cocoSsdModel) {
    try {
      const predictions = await win.cocoSsdModel.detect(video);
      for (const pred of predictions) {
        const [x, y, w, h] = pred.bbox;
        const normBbox: [number, number, number, number] = [
          (x / (video.videoWidth || width)) * width,
          (y / (video.videoHeight || height)) * height,
          (w / (video.videoWidth || width)) * width,
          (h / (video.videoHeight || height)) * height,
        ];

        const label = pred.class.toLowerCase();
        let isProhibited = false;
        let category: ProhibitedCategory = "SUSPICIOUS_OBJECT";

        // 1. Phone / Smart Mobile Device
        if (
          label === "cell phone" ||
          label === "remote" ||
          label === "tablet" ||
          label === "smart watch" ||
          label === "phone"
        ) {
          isProhibited = true;
          category = "PHONE";
          if (pred.score > 0.40) {
            phoneDetected = true;
            phoneConfidence = Math.max(phoneConfidence, pred.score);
          }
        }
        // 2. Books / Notes / Papers / Documents
        else if (
          label === "book" ||
          label === "notebook" ||
          label === "paper" ||
          label === "binder" ||
          label === "magazine"
        ) {
          isProhibited = true;
          category = "BOOK_NOTES";
          if (pred.score > 0.42) {
            bookDetected = true;
          }
        }
        // 3. Secondary Screens / Laptops / External Displays
        else if (
          label === "laptop" ||
          label === "tv" ||
          label === "monitor" ||
          label === "screen" ||
          label === "display"
        ) {
          isProhibited = true;
          category = "SECONDARY_SCREEN";
          if (pred.score > 0.42) {
            screenDetected = true;
          }
        }
        // 4. Audio Devices / Headphones / Earphones
        else if (
          label === "headphones" ||
          label === "earphones" ||
          label === "headset" ||
          label === "earbuds"
        ) {
          isProhibited = true;
          category = "AUDIO_DEVICE";
          if (pred.score > 0.42) {
            audioDeviceDetected = true;
          }
        }
        // 5. Persons & Secondary Body Detection
        else if (label === "person") {
          personCount++;
          // First person centered in frame is candidate; secondary person or body in periphery is unauthorized
          const isSecondaryBody =
            personCount > 1 ||
            (faceRes.faceBbox &&
              Math.abs(normBbox[0] + normBbox[2] / 2 - (faceRes.faceBbox[0] + faceRes.faceBbox[2] / 2)) >
                width * 0.28);

          if (isSecondaryBody && pred.score > 0.45) {
            multiplePeopleDetected = true;
            isProhibited = true;
            category = "MULTIPLE_PEOPLE";
          }
        }
        // 6. Other Suspicious Hardware (e.g. external input, calculator, camera)
        else if (
          label === "mouse" ||
          label === "keyboard" ||
          label === "calculator" ||
          label === "camera" ||
          label === "usb"
        ) {
          isProhibited = true;
          category = "SUSPICIOUS_OBJECT";
          if (pred.score > 0.48) {
            otherObjectDetected = true;
          }
        }

        const objItem: DetectedObject = {
          label: pred.class,
          category,
          confidence: pred.score,
          bbox: normBbox,
          isProhibited,
        };

        detectedObjects.push(objItem);
        if (isProhibited && pred.score > 0.40) {
          prohibitedObjects.push(objItem);
        }
      }
    } catch (e) {
      console.warn("[VisionProctor] TF detection pass skipped:", e);
    }
  }

  // Fallback 1: Optical Heuristic for Phone / Device
  if (!phoneDetected) {
    const opticalPhones = detectPhoneHeuristic(ctx, width, height, faceRes.faceBbox);
    for (const obj of opticalPhones) {
      phoneDetected = true;
      phoneConfidence = obj.confidence;
      detectedObjects.push(obj);
      prohibitedObjects.push(obj);
    }
  }

  // Fallback 2: Optical Heuristic for Books / Notes
  if (!bookDetected) {
    const opticalBooks = detectBookOrNotesHeuristic(ctx, width, height, faceRes.faceBbox);
    for (const obj of opticalBooks) {
      bookDetected = true;
      detectedObjects.push(obj);
      prohibitedObjects.push(obj);
    }
  }

  // Fallback 3: Optical Heuristic for Headphones
  if (!audioDeviceDetected) {
    const opticalHeadphones = detectHeadphonesHeuristic(ctx, width, height, faceRes.faceBbox);
    for (const obj of opticalHeadphones) {
      audioDeviceDetected = true;
      detectedObjects.push(obj);
      prohibitedObjects.push(obj);
    }
  }

  // 3. Assemble Warnings for Candidate Feed
  const warnings: string[] = [];
  if (phoneDetected) {
    warnings.push("📱 Mobile phone or unauthorized smart device detected");
  }
  if (bookDetected) {
    warnings.push("📚 Notes, book, or paper study material detected");
  }
  if (screenDetected) {
    warnings.push("💻 Secondary screen or laptop detected in camera feed");
  }
  if (audioDeviceDetected) {
    warnings.push("🎧 Headphones or audio device detected");
  }
  if (multiplePeopleDetected) {
    warnings.push("👥 Multiple people detected in camera feed");
  }
  if (otherObjectDetected) {
    warnings.push("⚠️ Prohibited electronic object detected");
  }

  if (faceRes.facePose === "LOOKING_LEFT" || faceRes.facePose === "LOOKING_RIGHT") {
    warnings.push("👀 Looking away from the screen detected");
  } else if (faceRes.facePose === "LOOKING_DOWN") {
    warnings.push("👀 Looking down detected — please keep eyes on the screen");
  } else if (faceRes.facePose === "OUT_OF_FRAME") {
    warnings.push("👤 Face not detected in camera frame");
  }

  return {
    faceCount: multiplePeopleDetected ? Math.max(2, faceRes.faceCount) : faceRes.faceCount,
    facePose: multiplePeopleDetected ? "MULTIPLE_FACES" : faceRes.facePose,
    faceBbox: faceRes.faceBbox,
    phoneDetected,
    phoneConfidence,
    bookDetected,
    screenDetected,
    audioDeviceDetected,
    multiplePeopleDetected,
    otherObjectDetected,
    prohibitedObjects,
    detectedObjects,
    movementDelta: faceRes.movementDelta,
    lightingStatus: faceRes.lightingStatus,
    warnings,
  };
}

/**
 * Renders Futuristic Proctoring HUD & Bounding Boxes on Overlay Canvas
 */
export function renderVisionOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  result: VisionAnalysisResult
) {
  ctx.clearRect(0, 0, width, height);

  // 1. Draw Face Bounding Box & HUD
  if (result.faceBbox) {
    const [x, y, w, h] = result.faceBbox;
    const isGoodPose = result.facePose === "CENTERED";
    const strokeColor =
      result.facePose === "MULTIPLE_FACES"
        ? "#ef4444"
        : isGoodPose
        ? "#22c55e"
        : "#f59e0b";

    // Glowing Target Box
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(x, y, w, h);

    // Corner Accents
    ctx.setLineDash([]);
    ctx.lineWidth = 3;
    const cornerLen = Math.min(12, w * 0.2);

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(x, y + cornerLen);
    ctx.lineTo(x, y);
    ctx.lineTo(x + cornerLen, y);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(x + w - cornerLen, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + cornerLen);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(x, y + h - cornerLen);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + cornerLen, y + h);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(x + w - cornerLen, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y + h - cornerLen);
    ctx.stroke();

    // Pose Status Badge
    ctx.fillStyle = strokeColor;
    const poseLabel =
      result.facePose === "CENTERED"
        ? "👤 FACE: CENTERED"
        : result.facePose === "LOOKING_LEFT"
        ? "👀 LOOKING LEFT"
        : result.facePose === "LOOKING_RIGHT"
        ? "👀 LOOKING RIGHT"
        : result.facePose === "LOOKING_DOWN"
        ? "👀 LOOKING DOWN"
        : result.facePose === "MULTIPLE_FACES"
        ? "⚠️ MULTIPLE PEOPLE"
        : "👤 FACE";

    ctx.font = "bold 9px monospace";
    const textWidth = ctx.measureText(poseLabel).width;
    ctx.fillRect(x, Math.max(0, y - 14), textWidth + 8, 14);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(poseLabel, x + 4, Math.max(10, y - 3));
    ctx.restore();
  }

  // 2. Draw Object & Device Detections with category-specific colors and badges
  for (const obj of result.detectedObjects) {
    if (!obj.isProhibited) continue;

    const [x, y, w, h] = obj.bbox;
    let strokeColor = "#ef4444";
    let badgeText = `⚠️ ${obj.label.toUpperCase()} (${Math.round(obj.confidence * 100)}%)`;

    if (obj.category === "PHONE" || obj.label.toLowerCase().includes("phone")) {
      strokeColor = "#ef4444"; // Neon Red
      badgeText = `📱 PHONE (${Math.round(obj.confidence * 100)}%)`;
    } else if (obj.category === "BOOK_NOTES" || obj.label.toLowerCase().includes("book") || obj.label.toLowerCase().includes("note")) {
      strokeColor = "#f59e0b"; // Vivid Amber
      badgeText = `📚 NOTES/BOOK (${Math.round(obj.confidence * 100)}%)`;
    } else if (obj.category === "SECONDARY_SCREEN" || obj.label.toLowerCase().includes("laptop") || obj.label.toLowerCase().includes("tv")) {
      strokeColor = "#e11d48"; // Rose
      badgeText = `💻 2ND SCREEN (${Math.round(obj.confidence * 100)}%)`;
    } else if (obj.category === "AUDIO_DEVICE" || obj.label.toLowerCase().includes("headphone")) {
      strokeColor = "#a855f7"; // Purple
      badgeText = `🎧 AUDIO DEVICE (${Math.round(obj.confidence * 100)}%)`;
    } else if (obj.category === "MULTIPLE_PEOPLE") {
      strokeColor = "#dc2626"; // Crimson
      badgeText = `👥 2ND PERSON (${Math.round(obj.confidence * 100)}%)`;
    }

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 2]);
    ctx.strokeRect(x, y, w, h);

    // Warning Badge
    ctx.fillStyle = strokeColor;
    ctx.font = "bold 9px monospace";
    const tw = ctx.measureText(badgeText).width;
    ctx.fillRect(x, Math.max(0, y - 14), tw + 8, 14);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(badgeText, x + 4, Math.max(10, y - 3));
    ctx.restore();
  }
}
