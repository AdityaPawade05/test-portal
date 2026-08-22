"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function WebcamProctor({ attemptId }: { attemptId: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [streamActive, setStreamActive] = useState(false);
  const [verified, setVerified] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Initialize Camera Stream
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, frameRate: 15 },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setStreamActive(true);
      setPermissionDenied(false);
    } catch (err) {
      console.warn("[WebcamProctor] Camera access denied or unavailable:", err);
      setPermissionDenied(true);
      // Log anomaly event
      logEvent("PROCTORING_CAMERA_DENIED", { error: String(err) });
    }
  };

  const logEvent = async (type: string, payload?: unknown) => {
    try {
      await fetch(`/api/attempt/${attemptId}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, payload }),
      });
    } catch (e) {
      console.error("[WebcamProctor] Failed to log proctoring event:", e);
    }
  };

  // Stage 1: Identity Verification
  const verifyIdentity = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const context = canvasRef.current.getContext("2d");
    if (context) {
      context.drawImage(videoRef.current, 0, 0, 160, 120);
    }
    logEvent("WEBCAM_VERIFICATION_INITIAL", {
      verifiedAt: new Date().toISOString(),
    });
    setVerified(true);
  };

  // Stage 2: Periodic Background Snapshots (every 30 seconds)
  useEffect(() => {
    if (!streamActive || !verified) return;

    const interval = setInterval(() => {
      if (videoRef.current && canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, 160, 120);
        }
      }
      logEvent("WEBCAM_SNAPSHOT", {
        timestamp: new Date().toISOString(),
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [streamActive, verified]);

  useEffect(() => {
    startCamera();
  }, []);

  return (
    <>
      {/* Hidden Canvas for Frame Capturing */}
      <canvas ref={canvasRef} width={160} height={120} className="hidden" />

      {/* Stage 1 Modal: Initial Identity Verification */}
      {!verified && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md p-6 text-center bg-white shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 font-bold text-xl">
              📷
            </div>
            <h2 className="mt-3 text-lg font-semibold text-slate-900">
              Identity & Proctoring Verification
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Please align your face in the camera preview below to verify your identity before starting the assessment.
            </p>

            <div className="mt-4 relative overflow-hidden rounded-xl bg-slate-900 aspect-video flex items-center justify-center">
              <video
                ref={videoRef}
                muted
                playsInline
                className="w-full h-full object-cover transform -scale-x-100"
              />
              {permissionDenied && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-slate-900/90 text-white text-xs text-center">
                  <p className="font-semibold text-rose-400">Camera Permission Required</p>
                  <p className="mt-1 text-slate-300">
                    Please allow webcam access in your browser settings to proceed with the assessment.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <Button
                onClick={verifyIdentity}
                disabled={!streamActive}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
              >
                Verify Identity & Continue →
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Floating PIP Proctoring Thumbnail */}
      {verified && (
        <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-xl bg-slate-900/90 p-2 shadow-2xl border border-slate-700/50 backdrop-blur">
          <div className="relative h-16 w-24 overflow-hidden rounded-lg bg-slate-950">
            <video
              ref={videoRef}
              muted
              playsInline
              className="h-full w-full object-cover transform -scale-x-100"
            />
            <span className="absolute top-1 left-1 flex items-center gap-1 rounded bg-slate-900/80 px-1 py-0.5 text-[9px] font-bold text-rose-500">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
              REC
            </span>
          </div>
        </div>
      )}
    </>
  );
}
