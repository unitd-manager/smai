"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createPortal } from "react-dom";
import { ChevronDown, Play, X } from "lucide-react";
import { ApiError, apiBaseUrl, apiRequest } from "@/lib/api";
import { getDateTimeInputValue, getTimezoneLabel, localDateTimeToIso } from "@/lib/timezone";
import { videoPlatformLimits } from "@/config/video-platform-limits";

type VideoScript = {
  id: string;
  contentJson: { format: string; title: string; caption: string; scenes?: string[]; videoPlan?: IdeaVideoPlan; videoBrief?: { durationSeconds?: number; visualStyle?: string; storyType?: string } };
  brand: { name: string };
};
type VideoConversationStyle = "story-driven" | "warm" | "playful" | "dramatic" | "product-demo";
type IdeaVideoPlan = {
  industry: string;
  title: string;
  hook: string;
  story: string;
  callToAction: string;
  cast?: Array<{ id: "A" | "B" | "C"; name: string; appearance: string; personality: string }>;
  scenes: Array<{
    durationSeconds: number;
    setting: string;
    characters: Array<{ role: string; action: string }>;
    onScreenText: string;
    narration: string;
    dialogue?: Array<{ speaker: "A" | "B" | "C"; text: string }>;
    props: string[];
    ahaMoment: boolean;
  }>;
};
type MusicTrack = { id: string; title: string; mood: string; durationSeconds: number; licenseNote: string };
type StudioConfig = {
  tools: { ffmpeg: boolean; ffprobe: boolean; message: string };
  tts: { defaultProvider: string; providers: { piper: boolean }; piperExecutable: string; voices: Array<{ id: string; label: string; description: string }> };
  scriptProvider: "google-ai-studio" | "groq" | "openai";
  geminiConfigured: boolean;
  groqConfigured: boolean;
  openaiConfigured: boolean;
  activeWritingProvider: "google-ai-studio" | "groq" | "openai";
  pexelsConfigured: boolean;
  music: MusicTrack[];
  musicStyles: Array<{ id: string; label: string; description: string }>;
};
type VideoJob = {
  id: string;
  contentId: string;
  status: string;
  progress: number;
  stage: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  error: string | null;
  magicHourCreditsCharged?: number | null;
  inputJson: {
    title?: string;
    brandName?: string;
    caption?: string;
    hashtags?: string[];
    sourceScenes?: string[];
    aspectRatio?: string;
    language?: string;
    scenePlan?: { cast?: Array<{ id: "A" | "B" | "C"; name: string }> };
    avatarStyle?: "3d" | "illustrated";
    generationType?: string;
    provider?: string;
    magicHourCreditsCharged?: number | null;
  };
  createdAt: string;
};
type PublishingReadiness = {
  ready: boolean;
  platform: string;
  accountName: string | null;
  message: string;
};

type MagicHourConfig = { configured?: boolean; credits?: number | null; accounts?: Array<{ slot: number; credits: number | null; status: "available" | "unavailable"; error?: string }>; voices?: Array<{ id: string; name: string; avatarUrl: string | null }>; voicesUnavailable?: boolean; error?: string };

function MagicHourCreator({ onCreated }: { onCreated: () => void }) {
  const [config, setConfig] = useState<MagicHourConfig | null>(null);
  const [category, setCategory] = useState<"product" | "avatar-realistic" | "avatar-animated">("product");
  const [workflow, setWorkflow] = useState("product-image");
  const [title, setTitle] = useState("");
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [promotion, setPromotion] = useState("");
  const [script, setScript] = useState("");
  const [style, setStyle] = useState("commercial");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [resolution, setResolution] = useState("480p");
  const [durationSeconds, setDurationSeconds] = useState(5);
  const [voiceName, setVoiceName] = useState("");
  const [voiceMode, setVoiceMode] = useState<"preset" | "custom">("preset");
  const [voiceSampleFile, setVoiceSampleFile] = useState<File | null>(null);
  const [selectedVoiceSampleAssetId, setSelectedVoiceSampleAssetId] = useState("");
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [language, setLanguage] = useState("english");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [galleryAssets, setGalleryAssets] = useState<Array<{ id: string; fileName: string; mimeType: string; canUseMagicHour?: boolean }>>([]);
  const [galleryError, setGalleryError] = useState("");
  const [selectedGalleryAssetId, setSelectedGalleryAssetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const sourceInputRef = useRef<HTMLInputElement>(null);

  function clearSourceSelection() {
    setSourceFile(null);
    setSelectedGalleryAssetId("");
    if (sourceInputRef.current) sourceInputRef.current.value = "";
  }

  async function deleteSelectedGalleryImage() {
    const selected = galleryAssets.find((asset) => asset.id === selectedGalleryAssetId);
    if (!selected || !window.confirm(`Permanently delete â€œ${selected.fileName}â€ from this workspace?`)) return;
    try {
      await apiRequest(`/api/media/uploads/${encodeURIComponent(selected.id)}`, { method: "DELETE" });
      setGalleryAssets((assets) => assets.filter((asset) => asset.id !== selected.id));
      clearSourceSelection();
      setFeedback("Photo deleted from this workspace and Gallery.");
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete this photo.");
    }
  }

  function stopCamera() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraOpen(false);
  }

  async function openCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      cameraStreamRef.current = stream;
      if (cameraVideoRef.current) cameraVideoRef.current.srcObject = stream;
      setCameraOpen(true);
      setError("");
    } catch {
      setError("Camera access was unavailable. Allow camera access in your browser, or upload a portrait instead.");
    }
  }

  function captureFace() {
    const video = cameraVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) { setError("Wait for the camera preview, then capture the photo."); return; }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) { setError("Could not capture the camera image."); return; }
    context.translate(canvas.width, 0); context.scale(-1, 1); context.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) { setError("Could not capture the camera image."); return; }
      setSourceFile(new File([blob], `avatar-capture-${Date.now()}.jpg`, { type: "image/jpeg" }));
      if (sourceInputRef.current) sourceInputRef.current.value = "";
      setSelectedGalleryAssetId(""); stopCamera(); setError("");
    }, "image/jpeg", 0.92);
  }

  useEffect(() => () => { cameraStreamRef.current?.getTracks().forEach((track) => track.stop()); }, []);
  useEffect(() => {
    if (cameraOpen && cameraVideoRef.current && cameraStreamRef.current) cameraVideoRef.current.srcObject = cameraStreamRef.current;
  }, [cameraOpen]);

  useEffect(() => {
    let active = true;
    apiRequest<MagicHourConfig>("/api/videos/magic-hour/configuration", { cache: "no-store" })
      .then((value) => {
        if (!active) return;
        setConfig(value);
        setError(value.error ?? "");
        if (value.voices?.[0]) setVoiceName((current) => current || value.voices![0]!.id);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        const message = reason instanceof Error ? reason.message : "Could not load Magic Hour configuration.";
        setError(reason instanceof ApiError && reason.status >= 500 && /fetch failed/i.test(message)
          ? "The API server could not reach Magic Hour. Check outbound HTTPS access from the API server, then retry."
          : message);
      });
    apiRequest<{ assets: Array<{ id: string; fileName: string; mimeType: string; canUseMagicHour?: boolean }> }>("/api/media/uploads", { cache: "no-store" })
      .then(({ assets }) => { if (active) { setGalleryAssets(assets); setGalleryError(""); } })
      .catch((reason: unknown) => { if (active) setGalleryError(reason instanceof Error ? reason.message : "Saved media could not be loaded."); });
    return () => { active = false; };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const balance = config?.credits;
    const stages = workflow === "talking-photo" ? " This Talking Photo workflow makes a speech-generation request and a separate portrait-animation request." : "";
    const balanceText = typeof balance === "number" ? `The account currently shows ${balance} credits.` : "The current credit balance is unavailable.";
    if (!window.confirm(`This starts a real Magic Hour generation and uses credits.${stages} ${balanceText} The app cannot get a guaranteed price quote before generation. Continue?`)) return;
    setBusy(true); setError(""); setFeedback("");
    try {
      const needsFile = workflow !== "product-text";
      if (needsFile && !sourceFile && !selectedGalleryAssetId) throw new Error("Choose an image or video file first.");
      let sourceAssetId: string | undefined = selectedGalleryAssetId || undefined;
      if (sourceFile) {
        if (sourceFile.size > 50 * 1024 * 1024) throw new Error("Magic Hour source files must be smaller than 50 MB.");
        const uploaded = await apiRequest<{ asset: { id: string; fileName: string; mimeType: string } }>("/api/media/uploads", {
          method: "POST", body: sourceFile,
          headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(sourceFile.name), "X-File-Mime-Type": sourceFile.type, "X-In-Gallery": "true" },
        });
        sourceAssetId = uploaded.asset.id;
        setGalleryAssets((assets) => [uploaded.asset, ...assets.filter((asset) => asset.id !== uploaded.asset.id)]);
        setSelectedGalleryAssetId(uploaded.asset.id);
        setSourceFile(null);
      }
      let voiceSampleAssetId: string | undefined;
      if (workflow === "talking-photo" && voiceMode === "custom") {
        if (!voiceSampleFile && !selectedVoiceSampleAssetId) throw new Error("Choose or upload a short MP3 or WAV sample of a voice you own or have permission to use.");
        if (!voiceConsent) throw new Error("Confirm you have permission to use this voice sample.");
        if (voiceSampleFile) {
          if (voiceSampleFile.size > 20 * 1024 * 1024) throw new Error("Voice samples must be smaller than 20 MB.");
          const uploaded = await apiRequest<{ asset: { id: string; fileName: string; mimeType: string } }>("/api/media/uploads", {
            method: "POST", body: voiceSampleFile,
            headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(voiceSampleFile.name), "X-File-Mime-Type": voiceSampleFile.name.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "audio/wav", "X-In-Gallery": "true" },
          });
          voiceSampleAssetId = uploaded.asset.id;
          setSelectedVoiceSampleAssetId(uploaded.asset.id);
          setGalleryAssets((current) => [uploaded.asset, ...current.filter((asset) => asset.id !== uploaded.asset.id)]);
        } else voiceSampleAssetId = selectedVoiceSampleAssetId;
      }
      const data: Record<string, unknown> = {
        generationType: workflow, title: title.trim() || productName.trim() || (script.trim().split(/\s+/).slice(0, 6).join(" ") || "Product video"), productName: productName.trim(), description: description.trim(), promotion: promotion.trim(),
        style, aspectRatio, resolution, durationSeconds, script: script.trim(), voiceName, language, voiceMode: workflow === "talking-photo" ? voiceMode : "preset",
        avatarStyle: category === "avatar-animated" ? "animated" : "realistic",
        ...(voiceSampleAssetId ? { voiceSampleAssetId } : {}),
        ...(workflow === "lip-sync" ? { sourceVideoAssetId: sourceAssetId } : sourceAssetId ? { sourceAssetId } : {}),
      };
      const response = await apiRequest<{ job: { id: string }; credits: number | null }>("/api/videos/magic-hour/generate", { method: "POST", body: JSON.stringify(data) });
      setFeedback(`Video queued. Magic Hour balance before generation: ${response.credits === null ? "unavailable" : `${response.credits} credits`}. Final charge appears when it completes.`);
      setSourceFile(null);
      setVoiceSampleFile(null);
      setSelectedGalleryAssetId("");
      onCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not queue the Magic Hour video.");
    } finally { setBusy(false); }
  }

  const isProduct = category === "product";
  const uploadAccept = workflow === "lip-sync" ? "video/mp4" : "image/jpeg,image/png,image/webp";
  const galleryChoices = galleryAssets.filter((asset) => asset.canUseMagicHour !== false && (workflow === "lip-sync" ? asset.mimeType === "video/mp4" : asset.mimeType.startsWith("image/")));
  const voiceSampleChoices = galleryAssets.filter((asset) => asset.canUseMagicHour !== false && (asset.mimeType === "audio/mpeg" || asset.mimeType === "audio/wav"));
  const selectedSourceAsset = galleryAssets.find((asset) => asset.id === selectedGalleryAssetId);
  return <section className="video-studio-card" id="magic-hour-creator">
    <div className="video-job-heading"><div><p className="card-kicker">AI VIDEO PROVIDER</p><h2>Magic Hour</h2></div><span className="video-provider-badge">{!config ? error ? "Status unavailable" : "Checking balance…" : config.configured === false ? "Not configured" : config.credits === null || config.credits === undefined ? "Credits unavailable" : `${config.credits} combined credits`}</span></div>
    {config?.accounts && config.accounts.length > 0 && <p className="video-credit-notice" role="status">
      {config.accounts.map((account) => `Account ${account.slot}: ${account.status === "available" ? account.credits ?? "balance unavailable" : account.error ?? "unavailable"}`).join(" · ")}
      {config.accounts.length === 1 ? " Only one API key is loaded by the server; verify MAGIC_HOUR_API_KEY_2 in apps/api/.env and restart the API." : " Available account balances are combined; unavailable accounts are excluded from the total."}
    </p>}
    {!config && !error && <p className="notice notice-gold" role="status">Checking Magic Hour configurationâ€¦</p>}
    {config?.configured === false && <p className="notice notice-gold" role="status">Add <code>MAGIC_HOUR_API_KEY</code> to <code>apps/api/.env</code> and restart the API to enable real Magic Hour generation.</p>}
    {config?.voicesUnavailable && <p className="notice notice-gold" role="status">Magic Hour balance is available, but the voice list could not be loaded. Product video workflows remain available.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}{galleryError && <p className="notice notice-gold" role="status">Saved media could not be loaded. You can still upload a file directly.</p>}{feedback && <p className="form-success" role="status">{feedback}</p>}
    <form className="video-script-form" onSubmit={(event) => void submit(event)}>
      <div className="video-mode-picker" role="radiogroup" aria-label="Video mode">
        {([
          ["product", "Product motion", "Animate a real product photo with cinematic movement", "✦"],
          ["avatar-realistic", "Realistic avatar", "A speaking presenter from one portrait and your script", "◉"],
          ["avatar-animated", "Animated avatar", "Turn a portrait into a polished cartoon presenter", "✺"],
        ] as const).map(([id, label, copy, icon]) => <button key={id} type="button" className={category === id ? "selected" : ""} aria-pressed={category === id} onClick={() => { setCategory(id); setWorkflow(id === "product" ? "product-image" : "talking-photo"); clearSourceSelection(); }}><i aria-hidden="true">{icon}</i><strong>{label}</strong><span>{copy}</span></button>)}
      </div>
      {isProduct && <div className="video-segmented-control" role="radiogroup" aria-label="Product creation source"><button type="button" className={workflow === "product-image" ? "selected" : ""} aria-pressed={workflow === "product-image"} onClick={() => { setWorkflow("product-image"); clearSourceSelection(); }}>Use product photo</button><button type="button" className={workflow === "product-text" ? "selected" : ""} aria-pressed={workflow === "product-text"} onClick={() => { setWorkflow("product-text"); clearSourceSelection(); }}>Generate from description</button></div>}
      <Fragment key={`${category}:${workflow}`}>
      <label>Video title (optional)<input maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Generated from your product or script" /></label>
      {isProduct ? <>
        {workflow === "product-image" && <>
          {galleryChoices.length > 0 && <label>Choose a product photo<select value={selectedGalleryAssetId} onChange={(event) => { setSelectedGalleryAssetId(event.target.value); setSourceFile(null); if (sourceInputRef.current) sourceInputRef.current.value = ""; }}><option value="">Upload or take a photo</option>{galleryChoices.map((asset) => <option value={asset.id} key={asset.id}>{asset.fileName}</option>)}</select></label>}
          {!selectedGalleryAssetId && <label>Product photo<input ref={sourceInputRef} required type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)} /></label>}
          {(sourceFile || selectedSourceAsset) && <div className="video-selected-source"><p>Selected photo: {sourceFile?.name ?? selectedSourceAsset?.fileName}</p><div><button className="button button-secondary" type="button" onClick={clearSourceSelection}>Clear photo</button>{selectedSourceAsset && <button className="button button-outline" type="button" onClick={() => void deleteSelectedGalleryImage()}>Delete from Gallery</button>}</div></div>}
        </>}
        <label>Product or service<input maxLength={120} value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="What are you promoting?" /></label>
        <label>What should viewers see?<textarea maxLength={1800} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the product and its main benefit. Keep claims accurate." /></label>
        <details className="video-advanced-workflows"><summary>Add an offer or change visual style</summary>
          <label>Offer (optional)<input maxLength={500} value={promotion} onChange={(event) => setPromotion(event.target.value)} placeholder="Limited time offer" /></label>
          <label>Visual style<select value={style} onChange={(event) => setStyle(event.target.value)}><option value="commercial">Commercial</option><option value="realistic">Realistic</option><option value="cinematic">Cinematic</option><option value="animated">Animated</option></select></label>
        </details>
      </> : <>
        {galleryChoices.length > 0 && <label>{workflow === "lip-sync" ? "Choose a video from Gallery" : "Choose a face photo from Gallery"}<select value={selectedGalleryAssetId} onChange={(event) => { setSelectedGalleryAssetId(event.target.value); setSourceFile(null); if (sourceInputRef.current) sourceInputRef.current.value = ""; }}><option value="">Upload a new file instead</option>{galleryChoices.map((asset) => <option value={asset.id} key={asset.id}>{asset.fileName}</option>)}</select></label>}
        {!selectedGalleryAssetId && <label>{workflow === "lip-sync" ? "Video to lip sync" : "Face photo"}<input ref={sourceInputRef} required={!sourceFile} type="file" accept={uploadAccept} onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)} /></label>}
        {workflow === "talking-photo" && <div className="video-camera-capture">
          <p>Choose a clear, front-facing photo with one visible face, or take a photo now.</p>
          {!cameraOpen ? <button className="button button-secondary" type="button" onClick={() => void openCamera()}>Take photo with camera</button> : <>
            <video ref={cameraVideoRef} autoPlay playsInline muted aria-label="Camera preview" />
            <button className="button button-gold" type="button" onClick={captureFace}>Capture photo</button>
            <button className="button button-secondary" type="button" onClick={stopCamera}>Cancel camera</button>
          </>}
          {(sourceFile?.type.startsWith("image/") || selectedSourceAsset) && <div className="video-selected-source"><p>Selected photo: {sourceFile?.name ?? selectedSourceAsset?.fileName}</p><div><button className="button button-secondary" type="button" onClick={clearSourceSelection}>Clear photo</button>{selectedSourceAsset && <button className="button button-outline" type="button" onClick={() => void deleteSelectedGalleryImage()}>Delete from Gallery</button>}</div></div>}
        </div>}
        <label>What should the presenter say?<textarea required maxLength={4000} rows={3} value={script} onChange={(event) => setScript(event.target.value)} placeholder="Write the product explanation or a short script" /></label>
        {voiceMode === "preset" || workflow === "lip-sync" ? <label>Voice<select required value={voiceName} onChange={(event) => setVoiceName(event.target.value)}>{config?.voices?.map((voice) => <option value={voice.id} key={voice.id}>{voice.name}</option>)}{!config?.voices?.length && <option value="">Configure Magic Hour to load voices</option>}</select></label> : <>
          {voiceSampleChoices.length > 0 && <label>Saved voice sample<select value={selectedVoiceSampleAssetId} onChange={(event) => { setSelectedVoiceSampleAssetId(event.target.value); setVoiceSampleFile(null); }}><option value="">Upload a new sample</option>{voiceSampleChoices.map((asset) => <option key={asset.id} value={asset.id}>{asset.fileName}</option>)}</select></label>}
          {!selectedVoiceSampleAssetId && <label>Your voice sample (MP3 or WAV)<input required type="file" accept="audio/mpeg,audio/wav,.mp3,.wav" onChange={(event) => { setSelectedVoiceSampleAssetId(""); setVoiceSampleFile(event.target.files?.[0] ?? null); }} /></label>}
          <label className="video-consent"><input type="checkbox" checked={voiceConsent} onChange={(event) => setVoiceConsent(event.target.checked)} /> I own this voice or have permission to use it for generated speech.</label>
          <p>Magic Hour creates speech from your sample and script. Its voice-cloner charges credits based on script length.</p>
        </>}
        <label>Voice language<select value={language} onChange={(event) => setLanguage(event.target.value)}>{[["english", "English"], ["hindi", "Hindi"], ["tamil", "Tamil"], ["spanish", "Spanish"], ["french", "French"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <details className="video-advanced-workflows"><summary>Voice and lip-sync options</summary>
          {workflow === "talking-photo" && <label>Voice source<select value={voiceMode} onChange={(event) => setVoiceMode(event.target.value as "preset" | "custom")}><option value="preset">Built-in voice</option><option value="custom">Use my own voice sample</option></select></label>}
          {workflow === "talking-photo" && <button className="button button-outline" type="button" onClick={() => { setWorkflow("lip-sync"); clearSourceSelection(); }}>Lip sync an existing video</button>}
          {workflow === "lip-sync" && <button className="button button-outline" type="button" onClick={() => { setWorkflow("talking-photo"); clearSourceSelection(); }}>Back to talking photo</button>}
          {workflow === "lip-sync" && <label>Video to lip sync<input ref={sourceInputRef} required={!sourceFile && !selectedGalleryAssetId} type="file" accept="video/mp4" onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)} /></label>}
          {workflow === "lip-sync" && <label>Lip-sync style<select value={style} onChange={(event) => setStyle(event.target.value)}><option value="realistic">Realistic</option><option value="commercial">Lite</option></select></label>}
        </details>
      </>}
      {workflow !== "lip-sync" && <label>Aspect ratio<select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}><option value="9:16">Instagram Reels / YouTube Shorts Â· 9:16</option><option value="1:1">Square Â· 1:1</option><option value="16:9">Landscape Â· 16:9</option></select></label>}
      <label>Resolution<select value={resolution} onChange={(event) => setResolution(event.target.value)}><option value="480p">480p · fastest</option><option value="720p">720p · sharper</option><option value="1080p">1080p · premium</option></select><small>Higher resolutions can use more Magic Hour credits.</small></label>
      <label>Length<select value={durationSeconds} onChange={(event) => setDurationSeconds(Number(event.target.value))}>{[5, 10, 15].map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds</option>)}</select></label>
      <p className="video-credit-notice">Generation uses Magic Hour credits. Check the displayed balance before generating.</p>
      <button type="submit" className="button button-gold" disabled={busy || !config?.configured || (workflow !== "product-text" && !sourceFile && !selectedGalleryAssetId) || (workflow.includes("product") && !title.trim() && !productName.trim() && !description.trim())}>{busy ? "Queuing videoâ€¦" : "Generate video"}</button>
      </Fragment>
    </form>
  </section>;
}

const languages = [
  ["en-US", "English (US)"], ["en-GB", "English (UK)"], ["hi-IN", "Hindi"],
  ["ta-IN", "Tamil"], ["de-DE", "German"], ["es-ES", "Spanish"], ["fr-FR", "French"],
];
const videoDurations = [15, 30, 45, 60, 90, 120, 180, 300];
const storyTypes = [
  ["demo-story", "Product or service demo"],
  ["how-it-works", "How it works"],
  ["customer-success", "Customer success"],
  ["day-in-the-life", "Day in the life"],
  ["quick-tip", "Quick tip"],
  ["myth-vs-fact", "Myth versus fact"],
  ["announcement", "Announcement"],
  ["testimonial", "Testimonial"],
] as const;
const videoBriefExamples = [
  "I run an automation business for hospitals. Show how our AI receptionist handles an appointment request.",
  "We own a neighborhood restaurant. Show a guest ordering dinner and our team preparing it.",
  "We help people find homes. Show a customer comparing two properties with an agent.",
];

function formatDuration(seconds: number) {
  return seconds < 60 ? `${seconds} seconds` : `${Math.floor(seconds / 60)} min${seconds % 60 ? ` ${seconds % 60} sec` : ""}`;
}

function clampVideoDuration(seconds: number) {
  return Math.min(300, Math.max(15, seconds));
}

function getScriptMusicMood(mood: string | undefined) {
  if (!mood) return "none";
  const normalized = mood.toLowerCase();
  if (normalized.includes("upbeat") || normalized.includes("uplifting")) return "upbeat";
  if (normalized.includes("cinematic")) return "cinematic";
  if (normalized.includes("playful") || normalized.includes("jazz")) return "playful";
  return "calm";
}

function removeSceneTimecode(scene: string) {
  return scene.replace(/^\s*\d{1,3}(?::\d{2})?(?:\s*(?:-|â€“|â€”|to)\s*\d{1,3}(?::\d{2})?)?\s*(?:s|sec|seconds)?\s*[Â·:|-]\s*/i, "");
}

export function VideoStudioClient() {
  const [scripts, setScripts] = useState<VideoScript[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [config, setConfig] = useState<StudioConfig | null>(null);
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [topic, setTopic] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [storyType, setStoryType] = useState("demo-story");
  const [visualStyle, setVisualStyle] = useState("product-demo");
  const [useBrandProfile, setUseBrandProfile] = useState(true);
  const [scriptScenes, setScriptScenes] = useState<string[]>([]);
  const [language, setLanguage] = useState("en-US");
  const [aspectRatio, setAspectRatio] = useState("vertical");
  const [musicId, setMusicId] = useState("");
  const [musicStyle, setMusicStyle] = useState("balanced");
  const [musicVolume, setMusicVolume] = useState(0.12);
  const [musicDucking, setMusicDucking] = useState(0.2);
  const [narration, setNarration] = useState("voiceover");
  const [voiceId, setVoiceId] = useState("man-professional");
  const [contentPlatform, setContentPlatform] = useState("Instagram");
  const [platform, setPlatform] = useState("Instagram");
  const [publishingReadiness, setPublishingReadiness] = useState<PublishingReadiness | null>(null);
  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const [scheduleAt, setScheduleAt] = useState<Record<string, string>>({});
  const [timezone, setTimezone] = useState("UTC");
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [editingJob, setEditingJob] = useState("");
  const [editedScenes, setEditedScenes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scriptRetryAvailable, setScriptRetryAvailable] = useState(false);
  const [notice, setNotice] = useState("");
  const [lastWritingProvider, setLastWritingProvider] = useState<"google-ai-studio" | "groq" | "openai" | null>(null);
  const [scriptPickerOpen, setScriptPickerOpen] = useState(false);
  const scriptPickerRef = useRef<HTMLDivElement>(null);
  const [ideaDuration, setIdeaDuration] = useState(60);
  const [ideaAspectRatio, setIdeaAspectRatio] = useState<"vertical" | "landscape">("vertical");
  const [ideaVoice, setIdeaVoice] = useState("man-professional");
  const [ideaVoiceB, setIdeaVoiceB] = useState("woman-warm");
  const [ideaVoiceC, setIdeaVoiceC] = useState("man-friendly");
  const [ideaCastSize, setIdeaCastSize] = useState<2 | 3>(2);
  const [avatarStyle, setAvatarStyle] = useState<"3d" | "illustrated">("3d");
  const [ideaConversationStyle, setIdeaConversationStyle] = useState<VideoConversationStyle>("product-demo");
  const [ideaPlan, setIdeaPlan] = useState<IdeaVideoPlan | null>(null);
  const [ideaScript, setIdeaScript] = useState<VideoScript | null>(null);

  const loadStudio = useCallback(async () => {
    try {
      const [configuration, content, jobResponse, brandResponse] = await Promise.all([
        apiRequest<StudioConfig>("/api/videos/configuration", { cache: "no-store" }),
        apiRequest<{ items: VideoScript[] }>("/api/content?format=video&brandId=all"),
        apiRequest<{ jobs: VideoJob[] }>("/api/videos/jobs"),
        apiRequest<{ brand: { timezone: string } }>("/api/brand-profile"),
      ]);
      setConfig(configuration);
      setTimezone(brandResponse.brand.timezone);
      setVoiceId((current) => configuration.tts.voices.some((voice) => voice.id === current)
        ? current
        : configuration.tts.voices[0]?.id ?? "default");
      setIdeaVoice((current) => configuration.tts.voices.some((voice) => voice.id === current)
        ? current
        : configuration.tts.voices[0]?.id ?? "default");
      setIdeaVoiceB((current) => configuration.tts.voices.some((voice) => voice.id === current)
        ? current
        : configuration.tts.voices.find((voice) => voice.id !== configuration.tts.voices[0]?.id)?.id ?? configuration.tts.voices[0]?.id ?? "default");
      setIdeaVoiceC((current) => configuration.tts.voices.some((voice) => voice.id === current)
        ? current
        : configuration.tts.voices.find((voice) => voice.id !== configuration.tts.voices[0]?.id && voice.id !== configuration.tts.voices[1]?.id)?.id
          ?? configuration.tts.voices[0]?.id
          ?? "default");
      setScripts(content.items);
      setJobs(jobResponse.jobs);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load the video studio.");
    }
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const { jobs: latestJobs } = await apiRequest<{ jobs: VideoJob[] }>("/api/videos/jobs");
      setJobs(latestJobs);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not refresh the video queue.");
    }
  }, []);

  const checkPublishingReadiness = useCallback(async () => {
    setCheckingReadiness(true);
    try {
      const readiness = await apiRequest<PublishingReadiness>("/api/videos/publishing-readiness");
      setPublishingReadiness(readiness);
    } catch (requestError) {
      setPublishingReadiness({
        ready: false,
        platform: "Instagram",
        accountName: null,
        message: requestError instanceof Error ? requestError.message : "Could not check the Instagram publishing connection.",
      });
    } finally {
      setCheckingReadiness(false);
    }
  }, []);

  useEffect(() => {
    let interval: number | undefined;
    const timer = window.setTimeout(() => {
      void loadStudio();
      interval = window.setInterval(() => void loadJobs(), 2500);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [loadJobs, loadStudio]);

  const selectedScript = scripts.find((script) => script.id === selectedScriptId);
  const selectedVideo = jobs.find((job) => job.id === selectedVideoId);
  const selectedVideoStatus = selectedVideo?.status;
  const musicTrack = config?.music.find((track) => track.id === musicId);
  const aiConfigured = Boolean(config?.geminiConfigured || config?.groqConfigured || config?.openaiConfigured);
  const activeProviderLabel = lastWritingProvider === "groq"
    ? "Groq fallback"
    : lastWritingProvider === "openai"
      ? "OpenAI fallback"
      : lastWritingProvider === "google-ai-studio"
        ? "Google Gemini"
        : [
            config?.geminiConfigured ? "Google Gemini" : null,
            config?.groqConfigured ? "Groq fallback" : null,
            config?.openaiConfigured ? "OpenAI fallback" : null,
          ].filter(Boolean).join(" â†’ ") || "No AI provider configured";
  const platformLimit = videoPlatformLimits.platforms[contentPlatform as keyof typeof videoPlatformLimits.platforms];
  const platformLimitWarning = platformLimit && durationSeconds > platformLimit.maxSeconds
    ? `${formatDuration(durationSeconds)} is longer than the configured ${contentPlatform} limit of ${formatDuration(platformLimit.maxSeconds)}. Choose a shorter length or check the platform's current upload rules.`
    : "";

  useEffect(() => {
    if (!selectedVideoId || !selectedVideoStatus || !["QUEUED", "PROCESSING"].includes(selectedVideoStatus)) return;
    const stream = new EventSource(`${apiBaseUrl}/api/videos/jobs/${encodeURIComponent(selectedVideoId)}/events`);
    stream.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data) as { status: string; progress: number; stage: string; error: string | null };
        setJobs((current) => current.map((job) =>
          job.id === selectedVideoId
            ? { ...job, status: update.status, progress: update.progress, stage: update.stage, error: update.error }
            : job,
        ));
        if (!["QUEUED", "PROCESSING"].includes(update.status)) stream.close();
      } catch {
        stream.close();
        setError("Live render updates could not be read. The queue will continue refreshing automatically.");
      }
    };
    stream.onerror = () => stream.close();
    return () => stream.close();
  }, [selectedVideoId, selectedVideoStatus]);

  useEffect(() => {
    if (!selectedVideoId) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedVideoId("");
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedVideoId]);

  useEffect(() => {
    if (!selectedVideo?.videoUrl) return;
    const timer = window.setTimeout(() => void checkPublishingReadiness(), 0);
    return () => window.clearTimeout(timer);
  }, [checkPublishingReadiness, selectedVideo?.id, selectedVideo?.videoUrl]);

  useEffect(() => {
    if (!scriptPickerOpen) return;
    function closePicker(event: PointerEvent) {
      if (event.target instanceof Node && !scriptPickerRef.current?.contains(event.target)) {
        setScriptPickerOpen(false);
      }
    }
    document.addEventListener("pointerdown", closePicker);
    return () => document.removeEventListener("pointerdown", closePicker);
  }, [scriptPickerOpen]);

  async function generateScript(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setError("");
    setScriptRetryAvailable(false);
    setNotice("");
    setBusy(true);
    try {
      const response = await apiRequest<{ items: VideoScript[]; provider: "google-ai-studio" | "groq" | "openai" }>("/api/content/generate", {
        method: "POST",
        body: JSON.stringify({
          idea: topic,
          formats: ["video"],
          platforms: [contentPlatform],
          language: languages.find(([code]) => code === language)?.[1] ?? "English",
          useBrandProfile,
          videoBrief: {
            durationSeconds,
            storyType,
            visualStyle,
            narration,
            musicMood: getScriptMusicMood(musicTrack?.mood),
            imageDirection: topic,
            onScreenText: true,
          },
        }),
      });
      setLastWritingProvider(response.provider);
      setScripts((current) => [...response.items, ...current]);
      setSelectedScriptId(response.items[0]?.id ?? "");
      setScriptScenes(response.items[0]?.contentJson.scenes ?? []);
      setNotice("Script created. Review the scenes, then render your video.");
      await loadStudio();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not generate the video script.";
      setError(message);
      setScriptRetryAvailable(/HTTP (?:429|503)|temporarily overloaded|rate limit/i.test(message));
    } finally {
      setBusy(false);
    }
  }

  async function generateIdeaPlan(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const { item, provider } = await apiRequest<{ item: VideoScript; provider: "google-ai-studio" | "groq" | "openai" }>("/api/videos/idea-to-mp4/plan", {
        method: "POST",
        body: JSON.stringify({
          idea: topic,
          durationSeconds: ideaDuration,
          language: languages.find(([code]) => code === language)?.[1] ?? "English",
          aspectRatio: ideaAspectRatio,
          voice: ideaVoice,
          conversationStyle: ideaConversationStyle,
          castSize: ideaCastSize,
        }),
      });
      setLastWritingProvider(provider);
      const plan = item.contentJson.videoPlan;
      if (!plan) throw new Error("The API returned a video script without its scene plan. Please try again.");
      setIdeaPlan(plan);
      setIdeaScript(item);
      setScriptScenes(plan.scenes.map((scene) => scene.dialogue?.map((line) => `${line.speaker}: ${line.text}`).join("\n") ?? scene.narration));
      setSelectedScriptId(item.id);
      setScripts((current) => [item, ...current.filter((script) => script.id !== item.id)]);
      setNotice("Plan created with Gemini. Review every scene before rendering; nothing will be posted automatically.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not create the video plan.");
    } finally {
      setBusy(false);
    }
  }

  function updateIdeaPlan(update: (plan: IdeaVideoPlan) => IdeaVideoPlan) {
    setIdeaPlan((current) => current ? update(current) : current);
  }

  async function createRender(
    script: VideoScript,
    sourceScenes = script.contentJson.scenes,
    scenePlan?: IdeaVideoPlan,
    renderOptions?: { durationSeconds: number; aspectRatio: "vertical" | "square" | "landscape"; voice: string; voiceB?: string; voiceC?: string; language: string },
  ) {
    if (!sourceScenes?.length) {
      setError("This video script has no scenes. Create or edit its scene text first.");
      return;
    }
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const { job } = await apiRequest<{ job: { id: string } }>("/api/videos/render", {
        method: "POST",
        body: JSON.stringify({
          contentId: script.id,
          aspectRatio,
          narration: scenePlan ? "voiceover" : narration,
          provider: "piper",
          voice: renderOptions?.voice ?? voiceId,
          ...(renderOptions?.voiceB ? { voiceB: renderOptions.voiceB } : {}),
          ...(renderOptions?.voiceC ? { voiceC: renderOptions.voiceC } : {}),
          avatarStyle,
          language: renderOptions?.language ?? language,
          musicId: musicId || null,
          musicStyle,
          musicVolume,
          musicDucking,
          durationSeconds: renderOptions?.durationSeconds ?? durationSeconds,
          ...(renderOptions ? { aspectRatio: renderOptions.aspectRatio } : {}),
          sourceScenes: sourceScenes === script.contentJson.scenes ? scriptScenes : sourceScenes,
          ...(scenePlan ? { scenePlan } : {}),
        }),
      });
      setNotice(`Render queued (${job.id}). Progress will update below.`);
      await loadStudio();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not queue the video render.");
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(job: VideoJob) {
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/api/videos/jobs/${job.id}/regenerate`, { method: "POST" });
      setNotice("A new render has been queued with the saved settings.");
      await loadStudio();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not regenerate this video.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelJob(job: VideoJob) {
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/api/videos/jobs/${job.id}/cancel`, { method: "POST" });
      setNotice("Video rendering was cancelled.");
      await loadJobs();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not cancel this video render.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteJob(job: VideoJob) {
    if (!window.confirm(`Delete "${job.inputJson.title ?? "this video"}"? A video attached to a post must be removed from Posts and Queue first.`)) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/api/videos/jobs/${job.id}`, { method: "DELETE" });
      setNotice("Video deleted.");
      await loadStudio();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not delete this video.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEditedText(job: VideoJob) {
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/api/videos/jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify({ sourceScenes: editedScenes }),
      });
      setEditingJob("");
      setSelectedVideoId("");
      setNotice("Edited scene text saved and a new render queued.");
      await loadStudio();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save edited scene text.");
    } finally {
      setBusy(false);
    }
  }

  async function sendToSchedule(job: VideoJob, publishNow = false) {
    if (platform !== "Instagram") {
      setError("Live video publishing is currently available only for Instagram Reels.");
      return;
    }
    if (!publishingReadiness?.ready) {
      setError(publishingReadiness?.message ?? "Check the Instagram connection before scheduling or publishing.");
      return;
    }
    const scheduledAt = scheduleAt[job.id];
    if (!publishNow && !scheduledAt) {
      setError("Choose a date and time to schedule this video.");
      return;
    }
    const scheduledInstant = !publishNow && scheduledAt ? localDateTimeToIso(scheduledAt, timezone) : undefined;
    if (!publishNow && !scheduledInstant) {
      setError("That local time is invalid or does not exist in this time zone. Choose another time.");
      return;
    }
    if (scheduledInstant && new Date(scheduledInstant).getTime() <= Date.now()) {
      setError("That time has passed. Choose a future time, or use Post now to publish immediately.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { demoMode, post } = await apiRequest<{
        demoMode: boolean;
        post: { status: string };
      }>("/api/posts", {
        method: "POST",
        body: JSON.stringify({
          contentId: job.contentId,
          videoJobId: job.id,
          platforms: [platform],
          ...(scheduledInstant ? { scheduledAt: scheduledInstant } : {}),
          timezone,
        }),
      });
      setNotice(publishNow
        ? demoMode
          ? "Post request processed in demo mode. It was not published to a live social account."
          : post.status === "PUBLISHED"
            ? `Video published on ${platform}.`
            : `Instagram accepted the publish request (status: ${post.status.toLowerCase()}). Check Posts and Queue for updates.`
        : demoMode
          ? "Video added to the schedule in demo mode. It will not publish to a live social account."
          : "Video added to the schedule.");
      await loadStudio();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : publishNow
        ? "Could not publish this video."
        : "Could not schedule this video.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dashboard-content video-studio-page">
      <p className="eyebrow">YOUR STUDIO Â· VIDEO</p>
      <h1>Video Studio</h1>
      <p className="dashboard-lead">Create product demonstration or presenter avatar videos with Magic Hour, using an image from the Media Library or a new upload. Then preview, save, and prepare them for Instagram.</p>
      {error && <div className="video-generation-error" role="alert"><strong>We couldnâ€™t complete that step</strong><p>{error}</p></div>}
      {notice && <p className="form-success" role="status">{notice}</p>}
      <MagicHourCreator onCreated={() => { void loadJobs(); }} />
      <details className="video-advanced-workflows" hidden>
      <summary>Alternative: local animated conversation video</summary>
      <section className="video-studio-card" id="idea-to-mp4">
        <div className="video-job-heading">
          <div><p className="card-kicker">IDEA TO MP4</p><h2>Create an AI-avatar conversation or product demo</h2></div>
          <span className="video-provider-badge">Writing provider: {activeProviderLabel}</span>
        </div>
        <form className="video-script-form video-idea-form" onSubmit={(event) => void generateIdeaPlan(event)}>
          <label>Describe your business and the scenario in 2â€“3 lines
            <textarea required minLength={10} maxLength={2400} value={topic} onChange={(event) => setTopic(event.target.value)} rows={3} placeholder="Example: Create a polished ad for our beverage. Show a man and woman chatting at a cafÃ© table, then demonstrate the bottle clearly. Use only facts from my brand profile." />
          </label>
          <div className="video-duration-controls">
            <label>Duration<select value={ideaDuration} onChange={(event) => setIdeaDuration(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((minutes) => <option key={minutes} value={minutes * 60}>{minutes} minute{minutes > 1 ? "s" : ""}</option>)}</select></label>
            <label>Language<select value={language} onChange={(event) => setLanguage(event.target.value)}>{languages.map(([code, name]) => <option value={code} key={code}>{name}</option>)}</select></label>
            <label>Format<select value={ideaAspectRatio} onChange={(event) => setIdeaAspectRatio(event.target.value as "vertical" | "landscape")}><option value="vertical">Vertical Â· 1080 Ã— 1920</option><option value="landscape">Horizontal Â· 1920 Ã— 1080</option></select></label>
            <label>Voice<select value={ideaVoice} onChange={(event) => setIdeaVoice(event.target.value)}>{(config?.tts.voices.length ? config.tts.voices : [{ id: "default", label: "Configured Piper voice", description: "Free local voice" }]).map((voice) => <option value={voice.id} key={voice.id}>{voice.label}</option>)}</select></label>
          <label>Conversation tone<select value={ideaConversationStyle} onChange={(event) => setIdeaConversationStyle(event.target.value as VideoConversationStyle)}><option value="story-driven">Story-driven</option><option value="warm">Warm and friendly</option><option value="playful">Playful</option><option value="dramatic">Dramatic</option><option value="product-demo">Professional product demonstration</option></select></label>
            <label>Characters<select value={ideaCastSize} onChange={(event) => setIdeaCastSize(Number(event.target.value) as 2 | 3)}><option value={2}>Two people</option><option value={3}>Three people</option></select></label>
          </div>
          <label>Character B voice
            <select value={ideaVoiceB} onChange={(event) => setIdeaVoiceB(event.target.value)}>{(config?.tts.voices.length ? config.tts.voices : [{ id: "default", label: "Configured Piper voice", description: "Free local voice" }]).map((voice) => <option value={voice.id} key={voice.id}>{voice.label}</option>)}</select>
          </label>
          {ideaCastSize === 3 && <label>Character C voice
            <select value={ideaVoiceC} onChange={(event) => setIdeaVoiceC(event.target.value)}>{(config?.tts.voices.length ? config.tts.voices : [{ id: "default", label: "Configured Piper voice", description: "Free local voice" }]).map((voice) => <option value={voice.id} key={voice.id}>{voice.label}</option>)}</select>
          </label>}
          <label>Character animation
            <select value={avatarStyle} onChange={(event) => setAvatarStyle(event.target.value as "3d" | "illustrated")}><option value="3d">Procedural 3D characters</option><option value="illustrated">Illustrated fallback style</option></select>
          </label>
          <p className="video-music-license">Review the generated characters, scene captions, dialogue, and product actions before rendering. Choose two people for a focused conversation or three for a group scene.</p>
          {language !== "en-US" && <p className="notice notice-gold" role="status">The included Piper voice models speak US English. Other selected languages are used for the plan and subtitles, but spoken pronunciation may be limited.</p>}
          <button type="submit" className="button button-gold" disabled={busy || !topic.trim() || !aiConfigured}>{busy ? "Creating your planâ€¦" : "Generate video plan"}</button>
        </form>
        {ideaPlan && ideaScript && <div className="video-editable-storyboard">
          <h3>Review the conversation before rendering</h3>
          {ideaPlan.cast?.map((character, characterIndex) => <fieldset className="video-editable-scene" key={character.id}>
            <legend>Character {character.id}</legend>
            <label>Name<input value={character.name} onChange={(event) => updateIdeaPlan((plan) => ({ ...plan, cast: plan.cast?.map((item, index) => index === characterIndex ? { ...item, name: event.target.value } : item) }))} /></label>
            <label>Character appearance<input value={character.appearance} onChange={(event) => updateIdeaPlan((plan) => ({ ...plan, cast: plan.cast?.map((item, index) => index === characterIndex ? { ...item, appearance: event.target.value } : item) }))} /><small>Describe an original look: age group, skin tone, hairstyle, clothes and accessories.</small></label>
            <label>Personality<input value={character.personality} onChange={(event) => updateIdeaPlan((plan) => ({ ...plan, cast: plan.cast?.map((item, index) => index === characterIndex ? { ...item, personality: event.target.value } : item) }))} /></label>
          </fieldset>)}
          <label>Title<input value={ideaPlan.title} onChange={(event) => updateIdeaPlan((plan) => ({ ...plan, title: event.target.value }))} /></label>
          <label>Industry<input value={ideaPlan.industry} onChange={(event) => updateIdeaPlan((plan) => ({ ...plan, industry: event.target.value }))} /></label>
          <label>Hook<input value={ideaPlan.hook} onChange={(event) => updateIdeaPlan((plan) => ({ ...plan, hook: event.target.value }))} /></label>
          <label>Story<textarea rows={3} value={ideaPlan.story} onChange={(event) => updateIdeaPlan((plan) => ({ ...plan, story: event.target.value }))} /></label>
          {ideaPlan.scenes.map((scene, index) => <article className="video-editable-scene" key={`idea-scene-${index}`}>
            <h4>Scene {index + 1} Â· {scene.durationSeconds}s Â· {scene.setting.replaceAll("-", " ")}{scene.ahaMoment ? " Â· Aha moment" : ""}</h4>
            <p><strong>Action:</strong> {scene.characters.map((character) => `${character.role}: ${character.action}`).join(" Â· ")}</p>
            <p><strong>Props:</strong> {scene.props.join(", ")}</p>
            <label>On-screen text<input value={scene.onScreenText} onChange={(event) => updateIdeaPlan((plan) => ({ ...plan, scenes: plan.scenes.map((item, itemIndex) => itemIndex === index ? { ...item, onScreenText: event.target.value } : item) }))} /></label>
            {scene.dialogue?.map((line, lineIndex) => <label key={`line-${lineIndex}`}>Character {line.speaker} Â· {ideaPlan.cast?.find((character) => character.id === line.speaker)?.name ?? line.speaker}
              <textarea rows={2} value={line.text} onChange={(event) => updateIdeaPlan((plan) => ({
                ...plan,
                scenes: plan.scenes.map((item, itemIndex) => {
                  if (itemIndex !== index || !item.dialogue) return item;
                  const dialogue = item.dialogue.map((entry, entryIndex) => entryIndex === lineIndex ? { ...entry, text: event.target.value } : entry);
                  return { ...item, dialogue, narration: dialogue.map((entry) => entry.text).join(" ") };
                }),
              }))} />
            </label>)}
          </article>)}
          <label>Call to action<input value={ideaPlan.callToAction} onChange={(event) => updateIdeaPlan((plan) => ({ ...plan, callToAction: event.target.value }))} /></label>
          <button type="button" className="button button-gold" disabled={busy || !config?.tools.ffmpeg || !config?.tts.providers.piper} onClick={() => {
            const scenes = ideaPlan.scenes.map((scene) => scene.narration);
            const script = {
              ...ideaScript,
              contentJson: { ...ideaScript.contentJson, title: ideaPlan.title, caption: ideaPlan.story, scenes, videoPlan: ideaPlan },
            };
            void createRender(script, scenes, ideaPlan, {
              durationSeconds: ideaDuration,
              aspectRatio: ideaAspectRatio,
              voice: ideaVoice,
              voiceB: ideaVoiceB,
              voiceC: ideaVoiceC,
              language: languages.find(([code]) => code === language)?.[1] ?? "English",
            });
          }}>Render avatar video</button>
          {(!config?.tools.ffmpeg || !config?.tts.providers.piper) && <p className="notice notice-gold" role="status">{!config?.tools.ffmpeg ? config?.tools.message : "Configure a local Piper voice model to render narration."}</p>}
        </div>}
      </section>
      </details>
      <details className="video-advanced-workflows" hidden>
        <summary>Open the additional guided script and render controls</summary>
      <div className="video-studio-grid">
        <form className="video-studio-card video-script-form" onSubmit={(event) => void generateScript(event)}>
          <h2>1. Create a script</h2>
          <label>Tell us about your business and the video you want
            <textarea required value={topic} onChange={(event) => setTopic(event.target.value)} rows={4} placeholder="In two or three lines, describe your business, audience, and what you want the video to show." />
          </label>
          <label className="video-profile-toggle">
            <input type="checkbox" checked={useBrandProfile} onChange={(event) => setUseBrandProfile(event.target.checked)} />
            <span><strong>Use my business profile</strong><small>Include your saved industry, products, audience, and brand tone.</small></span>
          </label>
          <details className="video-brief-examples-details"><summary>Use a sample brief</summary>
          <div className="video-brief-examples" aria-label="Example video briefs">
            {videoBriefExamples.map((example) => <button key={example} type="button" onClick={() => setTopic(example)}>{example}</button>)}
            <button type="button" onClick={() => {
              const example = videoBriefExamples[Math.floor(Math.random() * videoBriefExamples.length)]!;
              setTopic(example);
              setStoryType(storyTypes[Math.floor(Math.random() * storyTypes.length)]![0]);
            }}>Surprise me</button>
          </div></details>
          <label>Story type<select value={storyType} onChange={(event) => setStoryType(event.target.value)}>{storyTypes.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label>Video length<select value={durationSeconds} onChange={(event) => setDurationSeconds(Number(event.target.value))}>{videoDurations.map((seconds) => <option key={seconds} value={seconds}>{formatDuration(seconds)}</option>)}</select></label>
          <label>Platform<select value={contentPlatform} onChange={(event) => setContentPlatform(event.target.value)}><option>Instagram</option><option>YouTube Shorts</option><option>TikTok</option></select></label>
          {platformLimitWarning && <p className="notice notice-gold" role="alert">{platformLimitWarning} Platform targets last reviewed {videoPlatformLimits.lastReviewed}; confirm current rules in the linked documentation.</p>}
          <label>Visual style<select value={visualStyle} onChange={(event) => setVisualStyle(event.target.value)}><option value="product-demo">Product demonstration</option><option value="b-roll">B-roll</option><option value="talking-head">Talking head</option><option value="kinetic-type">Kinetic type</option></select></label>
          <label>Language<select value={language} onChange={(event) => setLanguage(event.target.value)}>{languages.map(([code, name]) => <option value={code} key={code}>{name}</option>)}</select></label>
          <button type="submit" className="button button-gold" disabled={busy || !topic.trim() || durationSeconds < 15 || !aiConfigured}>{busy ? "Workingâ€¦" : "Generate video script"}</button>
          {scriptRetryAvailable && <button type="button" className="button button-outline" disabled={busy || !topic.trim() || !aiConfigured} onClick={() => void generateScript()}>Retry video script</button>}
        </form>

        <section className="video-studio-card video-render-form">
          <h2>2. Set up your render</h2>
          <label className="video-script-picker-label">Script
            <div className="video-script-picker" ref={scriptPickerRef}>
              <button
                type="button"
                className="video-script-picker-trigger"
                aria-haspopup="listbox"
                aria-expanded={scriptPickerOpen}
                onClick={() => setScriptPickerOpen((open) => !open)}
              >
                <span>{selectedScript?.contentJson.title ?? "Choose a generated script"}</span>
                <ChevronDown size={17} aria-hidden="true" />
              </button>
              {scriptPickerOpen && (
                <div className="video-script-picker-menu" role="listbox" aria-label="Generated video scripts">
                  {scripts.length === 0 ? (
                    <p className="video-script-picker-empty">Generate a script in the first panel to see it here.</p>
                  ) : scripts.map((script) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={script.id === selectedScriptId}
                      className={script.id === selectedScriptId ? "is-selected" : ""}
                      key={script.id}
                      onClick={() => {
                        setSelectedScriptId(script.id);
                        setScriptScenes(script.contentJson.scenes ?? []);
                        setDurationSeconds(clampVideoDuration(script.contentJson.videoBrief?.durationSeconds ?? 30));
                        setStoryType(script.contentJson.videoBrief?.storyType ?? "demo-story");
                        setVisualStyle(script.contentJson.videoBrief?.visualStyle ?? "product-demo");
                        setScriptPickerOpen(false);
                      }}
                    >
                      <span>{script.contentJson.title}</span>
                      <small>{script.brand.name}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </label>
          <p className="video-music-license">Target length: {formatDuration(durationSeconds)}. {platformLimitWarning || `Platform targets last reviewed ${videoPlatformLimits.lastReviewed}; confirm current rules in the linked documentation.`}</p>
          <label>Video format<select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}><option value="vertical">Vertical Â· 9:16</option><option value="square">Square Â· 1:1</option><option value="landscape">Landscape Â· 16:9</option></select></label>
          <label>Narration<select value={narration} onChange={(event) => setNarration(event.target.value)}><option value="voiceover">Voiceover</option><option value="on-camera">Presenter voiceover</option><option value="text-only">Text only (no TTS)</option></select></label>
          {narration !== "text-only" && <>
            <label>Narration voice
              <select value={voiceId} onChange={(event) => setVoiceId(event.target.value)}>
                {(config?.tts.voices ?? []).map((voice) => <option value={voice.id} key={voice.id}>{voice.label} Â· {voice.description}</option>)}
              </select>
            </label>
            <p className="video-music-license">Each option uses a different speaker from the free local Piper multi-speaker model. The available voices are US English.</p>
          </>}
          <label>Music track
            <select value={musicId} onChange={(event) => setMusicId(event.target.value)}><option value="">Automatic soft bed</option>{config?.music.map((track) => <option value={track.id} key={track.id}>{track.title} Â· {track.mood}</option>)}</select>
          </label>
          {musicId && <label>Music treatment
            <select value={musicStyle} onChange={(event) => setMusicStyle(event.target.value)}>
              {(config?.musicStyles ?? []).map((style) => <option value={style.id} key={style.id}>{style.label} Â· {style.description}</option>)}
            </select>
          </label>}
          {musicTrack && <>
            <audio className="video-music-preview" controls preload="none" src={`${apiBaseUrl}/api/videos/music/${musicTrack.id}`} crossOrigin="use-credentials" />
            <small>{musicTrack.licenseNote}</small>
          </>}
          <p className="video-music-license">A low-volume local track plays under narrated videos to cover brief action beats and the end card; narration ducks the music automatically.</p>
          <label>Music volume Â· {Math.round(musicVolume * 100)}%
            <input type="range" min="0" max="0.5" step="0.01" value={musicVolume} onChange={(event) => setMusicVolume(Number(event.target.value))} />
          </label>
          <label>Music under voice Â· {Math.round(musicDucking * 100)}%
            <input type="range" min="0" max="1" step="0.05" value={musicDucking} onChange={(event) => setMusicDucking(Number(event.target.value))} />
          </label>
          {config?.pexelsConfigured && <p className="form-success">Pexels stock visuals are enabled; generated brand gradients remain the fallback.</p>}
          <button type="button" className="button button-gold" disabled={!selectedScript || busy || durationSeconds < 15 || !config?.tools.ffmpeg || (narration !== "text-only" && !config?.tts.providers.piper)} onClick={() => selectedScript && void createRender(selectedScript, scriptScenes)}>Render MP4</button>
          {scriptScenes.length > 0 && <fieldset className="video-editable-storyboard">
            <legend>Review and edit your storyboard</legend>
            {scriptScenes.map((scene, index) => <div className="video-editable-scene" key={`scene-${index}`}>
              <label htmlFor={`video-scene-${index}`}>Scene {index + 1}<textarea id={`video-scene-${index}`} value={scene} rows={3} onChange={(event) => setScriptScenes((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /></label>
              <div>
                <button type="button" disabled={index === 0} onClick={() => setScriptScenes((current) => current.map((item, itemIndex) => itemIndex === index - 1 ? current[index]! : itemIndex === index ? current[index - 1]! : item))}>Move up</button>
                <button type="button" disabled={index === scriptScenes.length - 1} onClick={() => setScriptScenes((current) => current.map((item, itemIndex) => itemIndex === index ? current[index + 1]! : itemIndex === index + 1 ? current[index]! : item))}>Move down</button>
                <button type="button" disabled={scriptScenes.length <= 1} onClick={() => setScriptScenes((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Delete scene</button>
              </div>
            </div>)}
            <button type="button" disabled={scriptScenes.length >= 20} onClick={() => setScriptScenes((current) => [...current, "New scene: add the action and dialogue."])}>Add scene</button>
          </fieldset>}
        </section>
      </div>
      </details>
      <section className="video-job-list">
        <div className="video-job-heading"><div><p className="card-kicker">RENDER QUEUE</p><h2>Your videos</h2></div><Link href="/dashboard/media-library">Open Media Library â†’</Link></div>
        {jobs.length === 0 ? <article className="section-empty-state"><h2>No rendered videos yet</h2><p>Your completed MP4 files will appear here and in the Media Library.</p></article> : jobs.map((job) => (
          <article className="video-job-card video-library-card" key={job.id}>
            <button type="button" className="video-card-open" onClick={() => { setPublishingReadiness(null); setSelectedVideoId(job.id); }} aria-label={`Open ${job.inputJson.title ?? "video"} details`}>
              {job.thumbnailUrl
                ? <Image className="video-card-thumbnail" alt="" crossOrigin="use-credentials" fill unoptimized sizes="(max-width: 720px) 100vw, 280px" src={`${apiBaseUrl}${job.thumbnailUrl}`} />
                : <span className="video-card-placeholder"><Play size={28} aria-hidden="true" /></span>}
              <span className="video-card-open-icon"><Play size={18} fill="currentColor" aria-hidden="true" /></span>
            </button>
            <div className="video-job-title"><div><h3>{job.inputJson.title ?? "Branded video"}</h3><span>{job.inputJson.provider === "magic-hour" ? `Magic Hour Â· ${job.inputJson.generationType ?? "video"}` : job.inputJson.scenePlan ? "AI-cast characters" : "Classic scene video"} Â· {job.inputJson.aspectRatio ?? "vertical"} Â· {job.stage ?? (job.status === "QUEUED" ? "Waiting in render queue" : job.status.toLowerCase())}</span></div><strong>{job.status === "SUCCEEDED" ? "Ready" : job.status === "FAILED" || job.status === "TIMED_OUT" ? "Failed" : job.status === "QUEUED" ? "Queued" : job.status === "CANCELLED" ? "Cancelled" : `${job.progress}%`}</strong></div>
            {job.inputJson.provider === "magic-hour" && job.status === "SUCCEEDED" && (job.magicHourCreditsCharged ?? job.inputJson.magicHourCreditsCharged) !== null && (job.magicHourCreditsCharged ?? job.inputJson.magicHourCreditsCharged) !== undefined && <small>Magic Hour charged {job.magicHourCreditsCharged ?? job.inputJson.magicHourCreditsCharged} credits.</small>}
            {(job.status === "PROCESSING" || job.status === "QUEUED") && <progress max={100} value={job.progress} aria-label={`Render progress ${job.progress}%`} />}
            {(job.status === "FAILED" || job.status === "TIMED_OUT") && <p className="form-error" role="alert">{job.error}</p>}
          </article>
        ))}
      </section>
      {selectedVideo && createPortal(
        <div className="design-lightbox-backdrop video-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedVideoId(""); }}>
          <section className="design-post-lightbox video-detail-lightbox" role="dialog" aria-modal="true" aria-label={`${selectedVideo.inputJson.title ?? "Video"} details`}>
            <div className="design-post-visual video-detail-preview">
              {selectedVideo.videoUrl
                ? <video className="rendered-video-player" controls autoPlay preload="metadata" crossOrigin="use-credentials" src={`${apiBaseUrl}${selectedVideo.videoUrl}`} />
                : <p>{selectedVideo.status === "FAILED" || selectedVideo.status === "TIMED_OUT" ? "This video did not render." : selectedVideo.status === "CANCELLED" ? "This render was cancelled." : selectedVideo.status === "QUEUED" ? "Waiting for a render worker to start this video." : "Rendering video. You can close this panel while it completes."}</p>}
            </div>
            <aside className="design-post-details video-detail-details">
              <header>
                <div><h2>{selectedVideo.inputJson.title ?? "Branded video"}</h2><p>{selectedVideo.inputJson.aspectRatio ?? "vertical"} format Â· {selectedVideo.status.toLowerCase()} Â· {new Date(selectedVideo.createdAt).toLocaleString()}</p></div>
                <button type="button" aria-label="Close video details" onClick={() => setSelectedVideoId("")}><X size={22} /></button>
              </header>
              <div className="design-post-copy">
                <p className="design-post-date">{selectedVideo.inputJson.brandName ?? "Branded video"}{selectedVideo.inputJson.language ? ` Â· ${selectedVideo.inputJson.language}` : ""} Â· {selectedVideo.inputJson.scenePlan ? "AI-cast animated characters" : "Classic scene render"}</p>
                {!selectedVideo.inputJson.scenePlan && <div className="notice notice-gold" role="note">
                  This saved video uses the older scene renderer. Its visuals wonâ€™t change when you retry it. To use the animated character cast, create a new plan in Idea to MP4.
                  {" "}<Link href="#idea-to-mp4" onClick={() => setSelectedVideoId("")}>Go to Idea to MP4 â†’</Link>
                </div>}
                {selectedVideo.videoUrl && <section className="video-publish-settings" aria-label="Video publishing settings">
                  <h3>Publish this video</h3>
                  <label>Platform
                    <select value={platform} onChange={(event) => setPlatform(event.target.value)}>
                      <option value="Instagram">Instagram Reels</option>
                      <option value="YouTube" disabled>YouTube Â· not available yet</option>
                      <option value="Facebook" disabled>Facebook Â· not available yet</option>
                      <option value="LinkedIn" disabled>LinkedIn Â· not available yet</option>
                      <option value="TikTok" disabled>TikTok Â· not available yet</option>
                    </select>
                  </label>
                  <label className="video-detail-schedule">Schedule date and time
                    <input type="datetime-local" min={getDateTimeInputValue(new Date(), timezone)} value={scheduleAt[selectedVideo.id] ?? ""} onChange={(event) => setScheduleAt((current) => ({ ...current, [selectedVideo.id]: event.target.value }))} />
                    <small>Time shown in {getTimezoneLabel(timezone)} Â· <Link href="/dashboard/settings/publishing">Change time zone</Link></small>
                  </label>
                  <p className={publishingReadiness?.ready ? "video-publishing-ready" : "video-publishing-unready"} role="status">
                    {checkingReadiness ? "Checking Instagram connection and video hostingâ€¦" : publishingReadiness?.message ?? "Checking Instagram connectionâ€¦"}
                    {publishingReadiness?.accountName ? ` Â· ${publishingReadiness.accountName}` : ""}
                  </p>
                  {!checkingReadiness && !publishingReadiness?.ready && <Link href="/dashboard/social-accounts/instagram">Connect or fix Instagram account â†’</Link>}
                  <button type="button" className="video-check-connection" onClick={() => void checkPublishingReadiness()} disabled={checkingReadiness || busy}>
                    {checkingReadiness ? "Checkingâ€¦" : "Check connection"}
                  </button>
                </section>}
                {selectedVideo.inputJson.sourceScenes?.length
                  ? <ol className="video-detail-scenes">{selectedVideo.inputJson.sourceScenes.map((scene, index) => <li key={`${selectedVideo.id}-${index}`}>{removeSceneTimecode(scene)}</li>)}</ol>
                  : <p>Generated branded MP4 video.</p>}
                {selectedVideo.inputJson.caption && <section className="video-result-caption">
                  <h3>Suggested caption</h3>
                  <p>{selectedVideo.inputJson.caption}</p>
                  {selectedVideo.inputJson.hashtags?.length ? <p>{selectedVideo.inputJson.hashtags.join(" ")}</p> : null}
                </section>}
                {selectedVideo.error && <p className="form-error" role="alert">{selectedVideo.error}</p>}
                {error && <p className="form-error" role="alert">{error}</p>}
                {notice && <p className="form-success" role="status">{notice}</p>}
                {editingJob === selectedVideo.id && <div className="video-edit-scenes">
                  <h4>Edit scene narration and captions</h4>
                  {editedScenes.map((scene, index) => <label key={index}>Scene {index + 1}<textarea value={scene} rows={2} onChange={(event) => setEditedScenes((current) => current.map((value, i) => i === index ? event.target.value : value))} /></label>)}
                  <button type="button" className="button button-gold" disabled={busy || editedScenes.some((scene) => !scene.trim())} onClick={() => void saveEditedText(selectedVideo)}>Save and render edited text</button>
                  <button type="button" onClick={() => setEditingJob("")}>Cancel edit</button>
                </div>}
              </div>
              <div className="video-detail-actions">
                {selectedVideo.videoUrl && <a className="button button-gold" href={`${apiBaseUrl}${selectedVideo.videoUrl}?download=true`}>Download MP4</a>}
                {(selectedVideo.status === "FAILED" || selectedVideo.status === "TIMED_OUT" || selectedVideo.status === "CANCELLED") && <button type="button" onClick={() => void regenerate(selectedVideo)} disabled={busy}>Retry render</button>}
                {(selectedVideo.status === "QUEUED" || selectedVideo.status === "PROCESSING") && <button type="button" onClick={() => void cancelJob(selectedVideo)} disabled={busy}>Cancel render</button>}
                {selectedVideo.videoUrl && <>
                  <button type="button" onClick={() => void regenerate(selectedVideo)} disabled={busy}>Regenerate</button>
                  <button type="button" onClick={() => { setEditingJob(selectedVideo.id); setEditedScenes(selectedVideo.inputJson.sourceScenes ?? []); }}>Edit text</button>
                  <button type="button" onClick={() => void sendToSchedule(selectedVideo)} disabled={busy || checkingReadiness || !publishingReadiness?.ready || !scheduleAt[selectedVideo.id]}>Schedule post</button>
                  <button type="button" onClick={() => void sendToSchedule(selectedVideo, true)} disabled={busy || checkingReadiness || !publishingReadiness?.ready}>Post now</button>
                </>}
                {selectedVideo.status !== "PROCESSING" && selectedVideo.status !== "QUEUED" && <button type="button" className="video-delete-action" onClick={() => void deleteJob(selectedVideo)} disabled={busy}>Delete video</button>}
              </div>
            </aside>
          </section>
        </div>,
        window.document.body,
      )}
    </section>
  );
}
