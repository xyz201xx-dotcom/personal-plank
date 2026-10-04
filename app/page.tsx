'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { BarChart3, Camera, SwitchCamera, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { addSeconds, getTodayCount } from '@/lib/squat-history';

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const SETTINGS = { targetFps: 20, minVisibility: 0.55, warningOffset: 0.065, warningFrames: 5 } as const;
type Point = { x: number; y: number; visibility?: number };
type SidePoints = { shoulder: Point; hip: Point; ankle: Point };
type Posture = 'ready' | 'good' | 'high' | 'low' | 'not-found';

function selectVisibleSide(landmarks: Point[]): SidePoints | null {
  const sides = [{ shoulder: landmarks[11], hip: landmarks[23], ankle: landmarks[27] }, { shoulder: landmarks[12], hip: landmarks[24], ankle: landmarks[28] }];
  return sides.filter((side) => side.shoulder && side.hip && side.ankle).map((side) => ({ ...side, score: ((side.shoulder.visibility ?? 0) + (side.hip.visibility ?? 0) + (side.ankle.visibility ?? 0)) / 3 })).filter((side) => side.score >= SETTINGS.minVisibility).sort((a, b) => b.score - a.score)[0] ?? null;
}
function postureFrom(side: SidePoints): Posture {
  const span = side.ankle.x - side.shoulder.x;
  if (Math.abs(span) < 0.08) return 'not-found';
  const lineY = side.shoulder.y + ((side.hip.x - side.shoulder.x) / span) * (side.ankle.y - side.shoulder.y);
  const offset = side.hip.y - lineY;
  return offset > SETTINGS.warningOffset ? 'low' : offset < -SETTINGS.warningOffset ? 'high' : 'good';
}
function drawPose(canvas: HTMLCanvasElement, video: HTMLVideoElement, side: SidePoints | null, posture: Posture) {
  const width = video.videoWidth; const height = video.videoHeight;
  if (!width || !height) return;
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.clearRect(0, 0, width, height); if (!side) return;
  const color = posture === 'good' ? '#77e7c2' : posture === 'ready' ? '#f9cf5b' : '#ff735e'; const joints = [side.shoulder, side.hip, side.ankle];
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(5, width * 0.008); ctx.strokeStyle = color; ctx.beginPath();
  joints.forEach((point, index) => { const x = point.x * width; const y = point.y * height; if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke();
  for (const point of joints) { ctx.beginPath(); ctx.arc(point.x * width, point.y * height, Math.max(7, width * 0.012), 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = Math.max(3, width * 0.004); ctx.strokeStyle = '#101616'; ctx.stroke(); }
}
function timeLabel(total: number) { const minutes = Math.floor(total / 60); const seconds = total % 60; return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`; }

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null); const canvasRef = useRef<HTMLCanvasElement>(null); const landmarkerRef = useRef<PoseLandmarker | null>(null); const streamRef = useRef<MediaStream | null>(null); const frameRef = useRef<number | null>(null); const detectRef = useRef<() => void>(() => undefined); const lastInferenceRef = useRef(0); const postureFramesRef = useRef({ posture: 'ready' as Posture, frames: 0 }); const mountedRef = useRef(true);
  const [started, setStarted] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment'); const [posture, setPosture] = useState<Posture>('ready'); const [seconds, setSeconds] = useState(0); const [todaySeconds, setTodaySeconds] = useState(0);
  const releaseCamera = useCallback(() => { if (frameRef.current) cancelAnimationFrame(frameRef.current); frameRef.current = null; streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; landmarkerRef.current?.close(); landmarkerRef.current = null; if (videoRef.current) videoRef.current.srcObject = null; canvasRef.current?.getContext('2d')?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); postureFramesRef.current = { posture: 'ready', frames: 0 }; setPosture('ready'); }, []);
  const detect = useCallback(() => { const video = videoRef.current; const canvas = canvasRef.current; const landmarker = landmarkerRef.current; if (!video || !canvas || !landmarker || video.readyState < 2) { frameRef.current = requestAnimationFrame(() => detectRef.current()); return; } const now = performance.now(); if (now - lastInferenceRef.current >= 1000 / SETTINGS.targetFps) { lastInferenceRef.current = now; const result = landmarker.detectForVideo(video, now); const side = result.landmarks[0] ? selectVisibleSide(result.landmarks[0]) : null; const next = side ? postureFrom(side) : 'not-found'; const tracker = postureFramesRef.current; tracker.frames = tracker.posture === next ? tracker.frames + 1 : 1; tracker.posture = next; const stable = tracker.frames >= SETTINGS.warningFrames || next === 'good' ? next : posture; setPosture(stable); drawPose(canvas, video, side, stable); } frameRef.current = requestAnimationFrame(() => detectRef.current()); }, [posture]);
  useEffect(() => { detectRef.current = detect; }, [detect]);
  useEffect(() => { const frame = requestAnimationFrame(() => setTodaySeconds(getTodayCount())); return () => { mountedRef.current = false; cancelAnimationFrame(frame); releaseCamera(); }; }, [releaseCamera]);
  useEffect(() => { if (!started) return; const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000); return () => clearInterval(timer); }, [started]);
  const start = async (requestedFacingMode = facingMode) => { setLoading(true); setError(''); let phase: 'camera' | 'model' = 'camera'; try { const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: requestedFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } } }); if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; } streamRef.current = stream; const video = videoRef.current; if (!video) throw new Error('camera unavailable'); video.srcObject = stream; await video.play(); phase = 'model'; const vision = await FilesetResolver.forVisionTasks(WASM_URL); const options = { runningMode: 'VIDEO' as const, numPoses: 1, minPoseDetectionConfidence: SETTINGS.minVisibility, minPosePresenceConfidence: SETTINGS.minVisibility, minTrackingConfidence: SETTINGS.minVisibility }; let landmarker: PoseLandmarker; try { landmarker = await PoseLandmarker.createFromOptions(vision, { ...options, baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' } }); } catch { landmarker = await PoseLandmarker.createFromOptions(vision, { ...options, baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' } }); } if (!mountedRef.current) { landmarker.close(); return; } landmarkerRef.current = landmarker; setSeconds(0); setStarted(true); frameRef.current = requestAnimationFrame(() => detectRef.current()); } catch (cause) { console.error(cause); releaseCamera(); setError(phase === 'camera' ? 'カメラを開始できませんでした。Safariのカメラ許可と、HTTPSで開いていることを確認してください。' : '姿勢判定の準備に失敗しました。通信環境を確認して、もう一度お試しください。'); } finally { setLoading(false); } };
  const stopCamera = () => { if (seconds > 0) setTodaySeconds(addSeconds(seconds)); releaseCamera(); setStarted(false); };
  const switchCamera = async () => { if (loading) return; const next = facingMode === 'environment' ? 'user' : 'environment'; releaseCamera(); setStarted(false); setFacingMode(next); await start(next); };
  const status = posture === 'good' ? ['体幹はまっすぐです', 'good'] : posture === 'high' ? ['腰が上がりすぎです', 'high'] : posture === 'low' ? ['腰が下がりすぎです', 'low'] : posture === 'not-found' ? ['横向きの全身を映してください', 'lost'] : ['姿勢を認識中…', 'ready'];
  return <main className="app-shell"><section className="camera-stage" aria-label="プランク姿勢判定カメラ"><video ref={videoRef} className="camera-feed" playsInline muted /><canvas ref={canvasRef} className="pose-overlay" aria-hidden="true" /><div className="top-bar"><span className="brand-mark" aria-hidden="true" /><span className="brand-name">PLANK</span><a href="/history" className="history-link" aria-label="プランク記録を見る"><BarChart3 /></a></div>{!started && <div className="start-panel"><div className="camera-icon"><Camera /></div><h1>真横から、全身を映す</h1><p>肩・腰・かかとが画面に入る位置にスマホを固定してください。体幹の反りをリアルタイムで確認します。</p><Button className="start-button" size="lg" onClick={() => void start()} disabled={loading}>{loading ? '準備中…' : 'スタート'}</Button>{error && <p className="error-message" role="alert">{error}</p>}</div>}{started && <><div className="guide" aria-hidden="true"><span /><p>身体の真横を映してください</p><span /></div><output className={`posture-status ${status[1]}`} aria-live="polite">{status[0]}</output><div className="camera-controls"><Button className="camera-control" variant="outline" size="icon" onClick={switchCamera} disabled={loading} aria-label="前後のカメラを切り替える"><SwitchCamera /></Button><Button className="camera-control" variant="outline" size="icon" onClick={stopCamera} aria-label="カメラを終了する"><X /></Button></div></>}<output className="counter" aria-live="polite"><em>HOLD</em><strong>{timeLabel(seconds)}</strong></output><p className="today-total">今日の合計 <b>{timeLabel(todaySeconds)}</b></p></section></main>;
}
