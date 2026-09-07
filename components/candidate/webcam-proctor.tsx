"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  loadCocoModel,
  analyzeVideoFrame,
  renderVisionOverlay,
  VisionAnalysisResult,
  FacePose,
  DetectedObject,
} from "@/lib/vision-proctor";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Spatial Central Region of Interest */
const ANALYSIS_W = 160;
const ANALYSIS_H = 120;

/** Cooldown for proctoring events (ms) */
const EVENT_COOLDOWN_MS: Record<string, number> = {
  OBJECT_PHONE_DETECTED: 8_000,
  PROHIBITED_BOOK_DETECTED: 8_000,
  PROHIBITED_SCREEN_DETECTED: 8_000,
  PROHIBITED_AUDIO_DEVICE_DETECTED: 8_000,
  PROHIBITED_OBJECT_DETECTED: 8_000,
  UNAUTHORIZED_PERSON_DETECTED: 10_000,
  FACE_LOOKING_AWAY: 8_000,
  MULTIPLE_FACES_DETECTED: 10_000,
  FACE_EXCESSIVE_MOVEMENT: 12_000,
  WEBCAM_FEED_BLOCKED: 10_000,
  WEBCAM_NO_FACE_DETECTED: 10_000,
  WEBCAM_EXCESSIVE_MOTION: 10_000,
  WEBCAM_BACKGROUND_MOTION: 15_000,
  MIC_LOUD_AUDIO_DETECTED: 12_000,
  MIC_NO_INPUT_DETECTED: 60_000,
};

/** Mic: RMS amplitude (0-1) threshold */
const MIC_LOUD_THRESHOLD = 0.15;
const MIC_LOUD_CONSECUTIVE = 3;
const MIC_SILENT_THRESHOLD = 0.001;
const MIC_SILENT_SECONDS = 30;

/** Snapshots & AI Analysis Intervals */
const SNAPSHOT_INTERVAL_MS = 60_000;
const AI_ANALYSIS_INTERVAL_MS = 600; // Fast AI scan (600ms)

// ─── Component ────────────────────────────────────────────────────────────────

export function WebcamProctor({
  attemptId,
  verified: externalVerified,
  onVerified,
  onStartTest,
  onViolation,
}: {
  attemptId: string;
  verified?: boolean;
  onVerified?: () => void;
  onStartTest?: () => void;
  onViolation?: (reason: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapshotCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasSetupRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasPipRef = useRef<HTMLCanvasElement | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Vision state refs
  const prevFaceCenterRef = useRef<{ x: number; y: number } | null>(null);
  const lastEventTimeRef = useRef<Record<string, number>>({});
  const lookingAwayCountRef = useRef(0);
  const phoneConsecutiveRef = useRef(0);
  const bookConsecutiveRef = useRef(0);
  const screenConsecutiveRef = useRef(0);
  const audioConsecutiveRef = useRef(0);
  const otherObjConsecutiveRef = useRef(0);
  const micLoudConsecutiveRef = useRef(0);
  const micSilentSecondsRef = useRef(0);
  const micEverActiveRef = useRef(false);

  // UI state
  const [streamActive, setStreamActive] = useState(false);
  const [internalVerified, setInternalVerified] = useState(false);
  const verified = externalVerified ?? internalVerified;
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micWarning, setMicWarning] = useState(false);
  const [aiModelReady, setAiModelReady] = useState(false);

  // AI & Computer Vision Real-time Multi-Object State
  const [phoneDetected, setPhoneDetected] = useState(false);
  const [bookDetected, setBookDetected] = useState(false);
  const [screenDetected, setScreenDetected] = useState(false);
  const [audioDeviceDetected, setAudioDeviceDetected] = useState(false);
  const [otherObjectDetected, setOtherObjectDetected] = useState(false);
  const [multiplePeopleDetected, setMultiplePeopleDetected] = useState(false);
  const [facePose, setFacePose] = useState<FacePose>("CENTERED");
  const [faceCount, setFaceCount] = useState(1);
  const [activeWarnings, setActiveWarnings] = useState<string[]>([]);
  const [lightingStatus, setLightingStatus] = useState<"GOOD" | "LOW_LIGHT" | "BLOCKED">("GOOD");

  // Device selection
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");

  // Warning acknowledgment state
  const [dismissedWarnings, setDismissedWarnings] = useState<Record<string, number>>({});

  const dismissWarning = useCallback((key: string) => {
    setDismissedWarnings((prev) => ({
      ...prev,
      [key]: Date.now() + 12_000,
    }));
  }, []);

  const isDismissed = (key: string) => {
    const expiresAt = dismissedWarnings[key];
    return Boolean(expiresAt && Date.now() < expiresAt);
  };

  // ── Event logging with cooldown ──────────────────────────────────────────

  const logEvent = useCallback(
    async (type: string, payload?: unknown, violationReason?: string) => {
      const now = Date.now();
      const cooldown = EVENT_COOLDOWN_MS[type] ?? 5_000;
      const lastFired = lastEventTimeRef.current[type] ?? 0;
      if (now - lastFired < cooldown) return false;
      lastEventTimeRef.current[type] = now;

      try {
        await fetch(`/api/attempt/${attemptId}/event`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, payload }),
        });
        if (violationReason && onViolation) {
          onViolation(violationReason);
        }
        return true;
      } catch (e) {
        console.error("[WebcamProctor] Failed to log proctoring event:", e);
        return false;
      }
    },
    [attemptId, onViolation]
  );

  // ── Snapshot Capture & Upload Engine ──────────────────────────────────────

  const captureAndUploadSnapshot = useCallback(
    async (reason: string = "PERIODIC_SNAPSHOT", metadata?: Record<string, unknown>) => {
      if (!videoRef.current || !snapshotCanvasRef.current) return;
      try {
        const canvas = snapshotCanvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(videoRef.current, 0, 0, 320, 240);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.65);

        await fetch(`/api/attempt/${attemptId}/snapshot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: dataUrl,
            reason,
            metadata,
          }),
        });
      } catch (err) {
        console.warn("[WebcamProctor] Snapshot upload error:", err);
      }
    },
    [attemptId]
  );

  // ── Video Stream Binding ──────────────────────────────────────────────────

  const bindStream = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node && streamRef.current) {
      if (node.srcObject !== streamRef.current) {
        node.srcObject = streamRef.current;
      }
      node.play().catch((err) => {
        console.warn("[WebcamProctor] Auto-play interrupted:", err);
      });
    }
  }, []);

  useEffect(() => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [verified, streamActive]);

  // ── Initialize AI Models in Background ────────────────────────────────────

  useEffect(() => {
    loadCocoModel().then((model) => {
      if (model) setAiModelReady(true);
    });
  }, []);

  // ── Real-time AI Vision & Multi-Object Detection Loop ──────────────────────

  const runAiVisionScan = useCallback(async () => {
    const video = videoRef.current;
    const analysisCanvas = analysisCanvasRef.current;
    if (!video || !analysisCanvas || video.readyState < 2) return;

    try {
      const result: VisionAnalysisResult = await analyzeVideoFrame(
        video,
        analysisCanvas,
        prevFaceCenterRef.current
      );

      setPhoneDetected(result.phoneDetected);
      setBookDetected(result.bookDetected);
      setScreenDetected(result.screenDetected);
      setAudioDeviceDetected(result.audioDeviceDetected);
      setMultiplePeopleDetected(result.multiplePeopleDetected);
      setOtherObjectDetected(result.otherObjectDetected);
      setFacePose(result.facePose);
      setFaceCount(result.faceCount);
      setLightingStatus(result.lightingStatus);
      setActiveWarnings(result.warnings);

      // Render overlay on setup modal or PiP
      const targetOverlay = verified
        ? overlayCanvasPipRef.current
        : overlayCanvasSetupRef.current;

      if (targetOverlay) {
        const ctx = targetOverlay.getContext("2d");
        if (ctx) {
          renderVisionOverlay(ctx, targetOverlay.width, targetOverlay.height, result);
        }
      }

      // ── Event Triggers & Violations ──

      // 1. Phone / Prohibited Mobile Device Detection
      if (result.phoneDetected) {
        phoneConsecutiveRef.current++;
        if (phoneConsecutiveRef.current >= 1) {
          logEvent(
            "OBJECT_PHONE_DETECTED",
            {
              confidence: result.phoneConfidence,
              objects: result.prohibitedObjects.filter((o) => o.category === "PHONE"),
            },
            "Mobile phone or unauthorized device detected"
          );
          captureAndUploadSnapshot("OBJECT_PHONE_DETECTED", {
            objects: result.prohibitedObjects.filter((o) => o.category === "PHONE"),
          });
        }
      } else {
        phoneConsecutiveRef.current = 0;
      }

      // 2. Book / Notes / Cheat Sheet Detection
      if (result.bookDetected) {
        bookConsecutiveRef.current++;
        if (bookConsecutiveRef.current >= 1) {
          logEvent(
            "PROHIBITED_BOOK_DETECTED",
            {
              objects: result.prohibitedObjects.filter((o) => o.category === "BOOK_NOTES"),
            },
            "Study material, book, or notes detected"
          );
          captureAndUploadSnapshot("PROHIBITED_BOOK_DETECTED", {
            objects: result.prohibitedObjects.filter((o) => o.category === "BOOK_NOTES"),
          });
        }
      } else {
        bookConsecutiveRef.current = 0;
      }

      // 3. Secondary Screen / Laptop Detection
      if (result.screenDetected) {
        screenConsecutiveRef.current++;
        if (screenConsecutiveRef.current >= 1) {
          logEvent(
            "PROHIBITED_SCREEN_DETECTED",
            {
              objects: result.prohibitedObjects.filter((o) => o.category === "SECONDARY_SCREEN"),
            },
            "Secondary screen or external display detected"
          );
          captureAndUploadSnapshot("PROHIBITED_SCREEN_DETECTED", {
            objects: result.prohibitedObjects.filter((o) => o.category === "SECONDARY_SCREEN"),
          });
        }
      } else {
        screenConsecutiveRef.current = 0;
      }

      // 4. Audio Device / Headphones Detection
      if (result.audioDeviceDetected) {
        audioConsecutiveRef.current++;
        if (audioConsecutiveRef.current >= 1) {
          logEvent(
            "PROHIBITED_AUDIO_DEVICE_DETECTED",
            {
              objects: result.prohibitedObjects.filter((o) => o.category === "AUDIO_DEVICE"),
            },
            "Headphones or audio device detected"
          );
          captureAndUploadSnapshot("PROHIBITED_AUDIO_DEVICE_DETECTED", {
            objects: result.prohibitedObjects.filter((o) => o.category === "AUDIO_DEVICE"),
          });
        }
      } else {
        audioConsecutiveRef.current = 0;
      }

      // 5. Multiple Faces & Unauthorized Person / Body Detection
      if (result.multiplePeopleDetected || result.faceCount > 1 || result.facePose === "MULTIPLE_FACES") {
        logEvent(
          "UNAUTHORIZED_PERSON_DETECTED",
          {
            faceCount: result.faceCount,
            objects: result.prohibitedObjects.filter((o) => o.category === "MULTIPLE_PEOPLE"),
          },
          "Multiple people / unauthorized person detected in webcam frame"
        );
        captureAndUploadSnapshot("UNAUTHORIZED_PERSON_DETECTED", {
          faceCount: result.faceCount,
          objects: result.prohibitedObjects.filter((o) => o.category === "MULTIPLE_PEOPLE"),
        });
      }

      // 6. Other Prohibited Objects
      if (result.otherObjectDetected) {
        otherObjConsecutiveRef.current++;
        if (otherObjConsecutiveRef.current >= 1) {
          logEvent(
            "PROHIBITED_OBJECT_DETECTED",
            {
              objects: result.prohibitedObjects.filter((o) => o.category === "SUSPICIOUS_OBJECT"),
            },
            "Prohibited electronic object detected"
          );
          captureAndUploadSnapshot("PROHIBITED_OBJECT_DETECTED", {
            objects: result.prohibitedObjects.filter((o) => o.category === "SUSPICIOUS_OBJECT"),
          });
        }
      } else {
        otherObjConsecutiveRef.current = 0;
      }

      // 7. Looking Away / Head Pose Anomaly
      if (
        result.facePose === "LOOKING_LEFT" ||
        result.facePose === "LOOKING_RIGHT" ||
        result.facePose === "LOOKING_DOWN"
      ) {
        lookingAwayCountRef.current++;
        if (lookingAwayCountRef.current >= 2) {
          logEvent(
            "FACE_LOOKING_AWAY",
            { pose: result.facePose, consecutiveScans: lookingAwayCountRef.current },
            `Looking away detected: ${result.facePose.replace("_", " ")}`
          );
        }
      } else {
        lookingAwayCountRef.current = 0;
      }

      // 8. Face Missing / Out of Frame
      if (result.facePose === "OUT_OF_FRAME") {
        logEvent(
          "WEBCAM_NO_FACE_DETECTED",
          { lighting: result.lightingStatus },
          "Candidate face not visible in camera frame"
        );
      }

      // 9. Excessive Face Movement / Fidgeting
      if (result.movementDelta > 35) {
        logEvent(
          "FACE_EXCESSIVE_MOVEMENT",
          { delta: Math.round(result.movementDelta) },
          "Excessive face or head movement detected"
        );
      }

      // 10. Camera Feed Blocked
      if (result.lightingStatus === "BLOCKED") {
        logEvent(
          "WEBCAM_FEED_BLOCKED",
          { lighting: result.lightingStatus },
          "Webcam feed appears blocked or obscured"
        );
      }
    } catch (err) {
      console.warn("[WebcamProctor] AI Vision scan error:", err);
    }
  }, [verified, logEvent]);

  // ── Mic Audio Analysis ───────────────────────────────────────────────────

  const analyzeMic = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const bufferLength = analyser.fftSize;
    const timeData = new Float32Array(bufferLength);
    analyser.getFloatTimeDomainData(timeData);

    let sumSq = 0;
    for (let i = 0; i < timeData.length; i++) {
      sumSq += timeData[i] * timeData[i];
    }
    const rms = Math.sqrt(sumSq / timeData.length);
    setMicLevel(Math.min(1, rms * 6));

    if (rms > MIC_LOUD_THRESHOLD) {
      micEverActiveRef.current = true;
      micSilentSecondsRef.current = 0;
      micLoudConsecutiveRef.current++;
      if (micLoudConsecutiveRef.current >= MIC_LOUD_CONSECUTIVE) {
        setMicWarning(true);
        logEvent(
          "MIC_LOUD_AUDIO_DETECTED",
          { rms: rms.toFixed(4) },
          "Sustained loud audio or voice detected"
        );
        micLoudConsecutiveRef.current = 0;
      }
    } else {
      micLoudConsecutiveRef.current = 0;
      if (rms < MIC_SILENT_THRESHOLD) {
        if (micEverActiveRef.current) {
          micSilentSecondsRef.current++;
          if (micSilentSecondsRef.current >= MIC_SILENT_SECONDS) {
            logEvent("MIC_NO_INPUT_DETECTED", { silentSeconds: micSilentSecondsRef.current });
            micSilentSecondsRef.current = 0;
          }
        }
      } else {
        micEverActiveRef.current = true;
        micSilentSecondsRef.current = 0;
      }
      if (rms < MIC_LOUD_THRESHOLD * 0.5) setMicWarning(false);
    }
  }, [logEvent]);

  // ── Camera + Mic Initialization ───────────────────────────────────────────

  const startCamera = async (targetDeviceId?: string) => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = allDevices.filter((d) => d.kind === "videoinput");
      setDevices(videoInputs);
    } catch {}

    const deviceConstraint = targetDeviceId ? { exact: targetDeviceId } : undefined;

    const constraintStages: MediaStreamConstraints[] = [
      {
        video: {
          deviceId: deviceConstraint,
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
        audio: true,
      },
      {
        video: deviceConstraint ? { deviceId: deviceConstraint } : true,
        audio: true,
      },
      {
        video: deviceConstraint ? { deviceId: deviceConstraint } : true,
        audio: false,
      },
    ];

    let stream: MediaStream | null = null;
    let lastErr: unknown = null;

    for (const constraints of constraintStages) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (stream) break;
      } catch (err) {
        lastErr = err;
      }
    }

    if (!stream) {
      console.warn("[WebcamProctor] Camera/mic access denied:", lastErr);
      setPermissionDenied(true);
      logEvent("PROCTORING_CAMERA_DENIED", { error: String(lastErr) });
      return;
    }

    streamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }

    if (stream.getAudioTracks().length > 0) {
      try {
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        audioCtxRef.current = audioCtx;
        analyserRef.current = analyser;
      } catch (audioErr) {
        console.warn("[WebcamProctor] Audio analyser setup failed:", audioErr);
      }
    }

    setStreamActive(true);
    setPermissionDenied(false);
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Verification Snapshots ────────────────────────────────────────────────

  const verifyIdentity = () => {
    if (videoRef.current && snapshotCanvasRef.current) {
      const context = snapshotCanvasRef.current.getContext("2d");
      if (context) {
        context.drawImage(videoRef.current, 0, 0, 320, 240);
      }
    }
    logEvent("WEBCAM_VERIFICATION_INITIAL", { verifiedAt: new Date().toISOString() });
    setInternalVerified(true);
    if (onVerified) onVerified();
    if (onStartTest) onStartTest();
  };

  const bypassIdentity = () => {
    logEvent("PROCTORING_CAMERA_DENIED_BYPASS", { bypassedAt: new Date().toISOString() });
    setInternalVerified(true);
    if (onVerified) onVerified();
    if (onStartTest) onStartTest();
  };

  // ── Active Anomaly Detection & AI Scan Intervals ──────────────────────────

  useEffect(() => {
    if (!streamActive) return;

    const aiInterval = setInterval(runAiVisionScan, AI_ANALYSIS_INTERVAL_MS);
    const micInterval = setInterval(analyzeMic, 1_000);

    return () => {
      clearInterval(aiInterval);
      clearInterval(micInterval);
    };
  }, [streamActive, runAiVisionScan, analyzeMic]);

  // Periodic Snapshot Engine
  useEffect(() => {
    if (!streamActive || !verified) return;

    const snapshotInterval = setInterval(() => {
      captureAndUploadSnapshot("PERIODIC_SNAPSHOT", { timestamp: new Date().toISOString() });
    }, SNAPSHOT_INTERVAL_MS);

    return () => clearInterval(snapshotInterval);
  }, [streamActive, verified, captureAndUploadSnapshot]);

  // Computed state for any active prohibited object
  const anyProhibitedObject =
    phoneDetected || bookDetected || screenDetected || audioDeviceDetected || otherObjectDetected;

  // Active object badge label for PiP
  const activeObjectLabel = phoneDetected
    ? "📱 PHONE DETECTED"
    : bookDetected
    ? "📚 BOOK/NOTES DETECTED"
    : screenDetected
    ? "💻 2ND SCREEN DETECTED"
    : audioDeviceDetected
    ? "🎧 HEADPHONES DETECTED"
    : multiplePeopleDetected
    ? "👥 2ND PERSON DETECTED"
    : otherObjectDetected
    ? "⚠️ OBJECT DETECTED"
    : null;

  return (
    <>
      {/* Hidden canvases for frame analysis */}
      <canvas ref={analysisCanvasRef} width={ANALYSIS_W} height={ANALYSIS_H} className="hidden" />
      <canvas ref={snapshotCanvasRef} width={320} height={240} className="hidden" />

      {/* Stage 1 Modal: Initial Identity Verification & AI Multi-Object Setup */}
      {!verified && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4">
          <Card className="w-full max-w-lg p-6 text-center bg-white shadow-2xl rounded-2xl border border-slate-100">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 font-bold text-2xl shadow-inner">
              🤖
            </div>
            <h2 className="mt-3 text-xl font-bold text-slate-900">
              AI Proctoring &amp; Multi-Object Detection
            </h2>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Real-time object detection is active for <strong>mobile phones</strong>, <strong>books/notes</strong>, <strong>secondary screens</strong>, and <strong>headphones</strong>.
              Keep your face centered and remove prohibited items from view.
            </p>

            {/* Video Preview with Real-time AI Bounding Box Canvas Overlay */}
            <div className="mt-4 relative overflow-hidden rounded-2xl bg-slate-950 aspect-video flex items-center justify-center shadow-lg border border-slate-800">
              <video
                ref={bindStream}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover transform -scale-x-100"
              />

              {/* AI Detection Bounding Boxes Overlay */}
              <canvas
                ref={overlayCanvasSetupRef}
                width={ANALYSIS_W}
                height={ANALYSIS_H}
                className="absolute inset-0 w-full h-full pointer-events-none transform -scale-x-100"
              />

              {/* Real-time AI HUD Overlay in top corner */}
              <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-slate-950/85 px-2.5 py-1 text-[10px] font-bold text-white border border-slate-700/60 backdrop-blur-md shadow">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>AI VISION PROCTOR {aiModelReady ? "⚡ MULTI-OBJECT DL" : "👁️ CV ACTIVE"}</span>
              </div>

              {/* Prohibited Alert Badge if any object detected during setup */}
              {activeObjectLabel && (
                <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-1 text-[10px] font-extrabold text-white animate-bounce shadow-lg">
                  <span>{activeObjectLabel}</span>
                </div>
              )}

              {/* Permission Denied Banner */}
              {permissionDenied && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-slate-950/95 text-white text-xs text-center">
                  <p className="font-bold text-rose-400 text-sm">Camera &amp; Mic Permission Required</p>
                  <p className="mt-1.5 text-slate-300 max-w-xs">
                    Please grant webcam access to proceed with the assessment.
                  </p>
                </div>
              )}
            </div>

            {/* Live AI Status Indicators Grid (4 items) */}
            {streamActive && (
              <div className="mt-3 grid grid-cols-4 gap-2 text-[11px]">
                {/* Phone Status */}
                <div
                  className={`p-1.5 rounded-xl border flex flex-col items-center font-semibold ${
                    phoneDetected
                      ? "bg-rose-50 border-rose-300 text-rose-700 animate-pulse"
                      : "bg-emerald-50 border-emerald-200 text-emerald-700"
                  }`}
                >
                  <span className="text-xs">{phoneDetected ? "📱 FLAG" : "📱 Clear"}</span>
                  <span className="text-[9px] font-normal text-slate-500">Phone</span>
                </div>

                {/* Books / Notes Status */}
                <div
                  className={`p-1.5 rounded-xl border flex flex-col items-center font-semibold ${
                    bookDetected || screenDetected || audioDeviceDetected
                      ? "bg-rose-50 border-rose-300 text-rose-700 animate-pulse"
                      : "bg-emerald-50 border-emerald-200 text-emerald-700"
                  }`}
                >
                  <span className="text-xs">
                    {bookDetected ? "📚 Book" : screenDetected ? "💻 Screen" : audioDeviceDetected ? "🎧 Audio" : "📦 Clear"}
                  </span>
                  <span className="text-[9px] font-normal text-slate-500">Objects</span>
                </div>

                {/* Face & Pose */}
                <div
                  className={`p-1.5 rounded-xl border flex flex-col items-center font-semibold ${
                    facePose === "CENTERED"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : facePose === "OUT_OF_FRAME" || facePose === "MULTIPLE_FACES"
                      ? "bg-rose-50 border-rose-300 text-rose-700"
                      : "bg-amber-50 border-amber-300 text-amber-700"
                  }`}
                >
                  <span className="text-xs">
                    {facePose === "CENTERED"
                      ? "👤 Center"
                      : facePose === "LOOKING_LEFT"
                      ? "👀 Left"
                      : facePose === "LOOKING_RIGHT"
                      ? "👀 Right"
                      : facePose === "LOOKING_DOWN"
                      ? "👀 Down"
                      : facePose === "MULTIPLE_FACES"
                      ? "👥 Multi"
                      : "👤 No Face"}
                  </span>
                  <span className="text-[9px] font-normal text-slate-500">Gaze</span>
                </div>

                {/* Lighting */}
                <div
                  className={`p-1.5 rounded-xl border flex flex-col items-center font-semibold ${
                    lightingStatus === "GOOD"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : "bg-amber-50 border-amber-200 text-amber-700"
                  }`}
                >
                  <span className="text-xs">
                    {lightingStatus === "GOOD" ? "💡 Optimal" : "💡 Light"}
                  </span>
                  <span className="text-[9px] font-normal text-slate-500">Lighting</span>
                </div>
              </div>
            )}

            {/* Mic Level Bar */}
            {streamActive && analyserRef.current && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-slate-400 shrink-0">🎤 Mic</span>
                <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{
                      width: `${micLevel * 100}%`,
                      backgroundColor:
                        micLevel > 0.6 ? "#ef4444" : micLevel > 0.3 ? "#f59e0b" : "#22c55e",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Camera Select Dropdown */}
            {devices.length > 1 && (
              <div className="mt-2 text-left">
                <select
                  value={selectedDeviceId}
                  onChange={(e) => {
                    setSelectedDeviceId(e.target.value);
                    startCamera(e.target.value);
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
                >
                  {devices.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="mt-5 flex flex-col gap-2">
              <Button
                onClick={verifyIdentity}
                disabled={!streamActive}
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-md transition-all"
              >
                {streamActive ? "Verify & Begin Assessment →" : "Initializing Camera & AI…"}
              </Button>
              {permissionDenied && (
                <Button
                  variant="secondary"
                  onClick={bypassIdentity}
                  className="w-full h-10 text-xs text-slate-700 border-slate-300 hover:bg-slate-50"
                >
                  Proceed Without Camera →
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Top Floating PIP: Proctoring Camera with Live AI Vision Overlay & Multi-Object HUD */}
      {verified && (
        <div className="fixed top-3 right-4 z-50 flex flex-col gap-1.5 items-end">
          <div className="flex items-center gap-2 rounded-2xl bg-slate-900/95 p-1.5 shadow-2xl border border-slate-700/60 backdrop-blur-md transition-all duration-300">
            {/* Camera Feed with AI Bounding Box Canvas */}
            <div className="relative h-24 w-36 overflow-hidden rounded-xl bg-slate-950 shadow-inner">
              <video
                ref={bindStream}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover transform -scale-x-100"
              />

              {/* Real-time Bounding Boxes Overlay */}
              <canvas
                ref={overlayCanvasPipRef}
                width={ANALYSIS_W}
                height={ANALYSIS_H}
                className="absolute inset-0 w-full h-full pointer-events-none transform -scale-x-100"
              />

              {/* REC Badge */}
              <div className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full bg-slate-950/80 px-1.5 py-0.5 text-[9px] font-extrabold text-rose-500 border border-rose-500/20 shadow-sm backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />
                <span>REC</span>
              </div>

              {/* Prohibited Alert Badge on PiP */}
              {activeObjectLabel && (
                <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-center gap-1 rounded-md bg-rose-600/90 py-0.5 text-[8px] font-bold text-white animate-pulse backdrop-blur-sm">
                  <span>{activeObjectLabel}</span>
                </div>
              )}
            </div>

            {/* Status Indicators Column */}
            <div className="flex flex-col gap-1.5 pr-1.5 min-w-[76px]">
              {/* Objects Status Indicator */}
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-slate-400">Object:</span>
                <span
                  className={`font-bold px-1 rounded ${
                    anyProhibitedObject
                      ? "bg-rose-500 text-white animate-pulse"
                      : "text-emerald-400"
                  }`}
                >
                  {anyProhibitedObject ? "⚠️ FLAG" : "Clear"}
                </span>
              </div>

              {/* Head Pose / Gaze Indicator */}
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-slate-400">Gaze:</span>
                <span
                  className={`font-semibold ${
                    facePose === "CENTERED"
                      ? "text-emerald-400"
                      : facePose === "LOOKING_LEFT" || facePose === "LOOKING_RIGHT" || facePose === "LOOKING_DOWN"
                      ? "text-amber-400"
                      : "text-rose-400"
                  }`}
                >
                  {facePose === "CENTERED"
                    ? "Center"
                    : facePose === "LOOKING_LEFT"
                    ? "Left"
                    : facePose === "LOOKING_RIGHT"
                    ? "Right"
                    : facePose === "LOOKING_DOWN"
                    ? "Down"
                    : facePose === "MULTIPLE_FACES"
                    ? "Multi"
                    : "No Face"}
                </span>
              </div>

              {/* People Count */}
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-slate-400">Person:</span>
                <span
                  className={`font-semibold ${
                    faceCount === 1 && !multiplePeopleDetected ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {faceCount === 1 && !multiplePeopleDetected ? "1 User" : "2+ Detected"}
                </span>
              </div>

              {/* Mic Level */}
              <div className="flex items-center gap-1">
                <span
                  className={`text-[9px] ${
                    micWarning ? "text-amber-400" : "text-slate-400"
                  }`}
                >
                  🎤
                </span>
                <div className="flex-1 h-1 rounded-full bg-slate-700 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{
                      width: `${micLevel * 100}%`,
                      backgroundColor:
                        micLevel > 0.6 ? "#ef4444" : micLevel > 0.3 ? "#f59e0b" : "#22c55e",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Real-time AI Multi-Object & Proctoring Violation Warning Toasts */}
          {phoneDetected && !isDismissed("phone") && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-rose-950/90 border border-rose-500/60 px-2.5 py-1.5 text-[10px] font-bold text-rose-200 backdrop-blur-sm shadow-xl animate-fade-in">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping shrink-0" />
                <span>📱 Mobile phone detected in camera feed!</span>
              </div>
              <button
                type="button"
                onClick={() => dismissWarning("phone")}
                className="rounded bg-rose-700/90 hover:bg-rose-600 text-white font-bold px-2 py-0.5 text-[9px] shadow-xs cursor-pointer transition-all shrink-0"
              >
                Okay
              </button>
            </div>
          )}

          {bookDetected && !isDismissed("book") && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-950/90 border border-amber-500/60 px-2.5 py-1.5 text-[10px] font-bold text-amber-200 backdrop-blur-sm shadow-xl animate-fade-in">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping shrink-0" />
                <span>📚 Notes, book, or paper study material detected!</span>
              </div>
              <button
                type="button"
                onClick={() => dismissWarning("book")}
                className="rounded bg-amber-700/90 hover:bg-amber-600 text-white font-bold px-2 py-0.5 text-[9px] shadow-xs cursor-pointer transition-all shrink-0"
              >
                Okay
              </button>
            </div>
          )}

          {screenDetected && !isDismissed("screen") && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-rose-950/90 border border-rose-500/60 px-2.5 py-1.5 text-[10px] font-bold text-rose-200 backdrop-blur-sm shadow-xl animate-fade-in">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping shrink-0" />
                <span>💻 Secondary screen or laptop detected!</span>
              </div>
              <button
                type="button"
                onClick={() => dismissWarning("screen")}
                className="rounded bg-rose-700/90 hover:bg-rose-600 text-white font-bold px-2 py-0.5 text-[9px] shadow-xs cursor-pointer transition-all shrink-0"
              >
                Okay
              </button>
            </div>
          )}

          {audioDeviceDetected && !isDismissed("audio") && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-purple-950/90 border border-purple-500/60 px-2.5 py-1.5 text-[10px] font-bold text-purple-200 backdrop-blur-sm shadow-xl animate-fade-in">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-purple-500 animate-ping shrink-0" />
                <span>🎧 Headphones or audio device detected!</span>
              </div>
              <button
                type="button"
                onClick={() => dismissWarning("audio")}
                className="rounded bg-purple-700/90 hover:bg-purple-600 text-white font-bold px-2 py-0.5 text-[9px] shadow-xs cursor-pointer transition-all shrink-0"
              >
                Okay
              </button>
            </div>
          )}

          {otherObjectDetected && !isDismissed("other") && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-orange-950/90 border border-orange-500/60 px-2.5 py-1.5 text-[10px] font-bold text-orange-200 backdrop-blur-sm shadow-xl animate-fade-in">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-orange-500 animate-ping shrink-0" />
                <span>⚠️ Prohibited electronic object detected!</span>
              </div>
              <button
                type="button"
                onClick={() => dismissWarning("other")}
                className="rounded bg-orange-700/90 hover:bg-orange-600 text-white font-bold px-2 py-0.5 text-[9px] shadow-xs cursor-pointer transition-all shrink-0"
              >
                Okay
              </button>
            </div>
          )}

          {(facePose === "LOOKING_LEFT" || facePose === "LOOKING_RIGHT" || facePose === "LOOKING_DOWN") && !isDismissed("gaze") && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-950/90 border border-amber-500/60 px-2.5 py-1.5 text-[10px] font-medium text-amber-200 backdrop-blur-sm shadow-xl animate-fade-in">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                <span>👀 Please look directly at the screen</span>
              </div>
              <button
                type="button"
                onClick={() => dismissWarning("gaze")}
                className="rounded bg-amber-700/90 hover:bg-amber-600 text-white font-bold px-2 py-0.5 text-[9px] shadow-xs cursor-pointer transition-all shrink-0"
              >
                Okay
              </button>
            </div>
          )}

          {multiplePeopleDetected && !isDismissed("people") && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-rose-950/90 border border-rose-500/60 px-2.5 py-1.5 text-[10px] font-bold text-rose-200 backdrop-blur-sm shadow-xl animate-fade-in">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping shrink-0" />
                <span>👥 Multiple people detected in camera!</span>
              </div>
              <button
                type="button"
                onClick={() => dismissWarning("people")}
                className="rounded bg-rose-700/90 hover:bg-rose-600 text-white font-bold px-2 py-0.5 text-[9px] shadow-xs cursor-pointer transition-all shrink-0"
              >
                Okay
              </button>
            </div>
          )}

          {facePose === "OUT_OF_FRAME" && !isDismissed("out_of_frame") && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-rose-950/90 border border-rose-500/60 px-2.5 py-1.5 text-[10px] font-medium text-rose-200 backdrop-blur-sm shadow-xl animate-fade-in">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse shrink-0" />
                <span>👤 Face not detected — adjust your camera</span>
              </div>
              <button
                type="button"
                onClick={() => dismissWarning("out_of_frame")}
                className="rounded bg-rose-700/90 hover:bg-rose-600 text-white font-bold px-2 py-0.5 text-[9px] shadow-xs cursor-pointer transition-all shrink-0"
              >
                Okay
              </button>
            </div>
          )}

          {micWarning && !isDismissed("mic") && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-purple-950/90 border border-purple-500/60 px-2.5 py-1 text-[10px] text-purple-200 backdrop-blur-sm shadow-xl animate-fade-in">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse shrink-0" />
                <span>🔊 Loud audio detected on microphone</span>
              </div>
              <button
                type="button"
                onClick={() => dismissWarning("mic")}
                className="rounded bg-purple-700/90 hover:bg-purple-600 text-white font-bold px-2 py-0.5 text-[9px] shadow-xs cursor-pointer transition-all shrink-0"
              >
                Okay
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
