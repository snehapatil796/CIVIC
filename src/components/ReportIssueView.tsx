import { useRef, useState } from 'react';
import {
  Camera,
  LocateFixed,
  Mic,
  Square,
  Video,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Send,
  Upload,
} from 'lucide-react';
import type {
  AIAnalysisResult,
  CivicUser,
  Complaint,
  ComplaintCategory,
  LanguageCode,
} from '../types/civic';
import { BENGALURU_WARDS, TRANSLATIONS } from '../i18n/translations';
import { InteractiveMap } from './InteractiveMap';
import { StatusIndicator } from './StatusLabel';

interface ReportIssueViewProps {
  user: CivicUser | null;
  token: string | null;
  lang: LanguageCode;
  myComplaints: Complaint[];
  onRequireAuth: () => void;
  onComplaintCreated: (created: Complaint) => void;
  onSelectComplaint: (c: Complaint) => void;
}

export function ReportIssueView({
  user,
  token,
  lang,
  myComplaints,
  onRequireAuth,
  onComplaintCreated,
  onSelectComplaint,
}: ReportIssueViewProps) {
  const t = TRANSLATIONS[lang];

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reportLang, setReportLang] = useState<LanguageCode>(lang);
  const [ward, setWard] = useState(BENGALURU_WARDS[1]);
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: 12.9716,
    lng: 77.5946,
  });
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);

  const [beforeImage, setBeforeImage] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string | null>(null);
  const [videoData, setVideoData] = useState<string | null>(null);
  const [audioTranscript, setAudioTranscript] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [analyzing, setAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
  const [manualCategory, setManualCategory] = useState<ComplaintCategory | ''>('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successComplaint, setSuccessComplaint] = useState<Complaint | null>(null);

  const handleDetectGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('Geolocation is not supported in this browser. Click the map to pin location.');
      return;
    }
    setGpsStatus('Detecting GPS coordinates...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setCoords({ lat, lng });
        setGpsStatus(`Locked GPS: ${lat}, ${lng}`);
        if (!address.trim()) {
          setAddress(`GPS Location (${lat}, ${lng})`);
        }
      },
      () => {
        setGpsStatus('GPS permission denied or unavailable. Click directly on the map to set pin.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageMime(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setBeforeImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      setError('Video attachment exceeds 12 MB prototype limit.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setVideoData(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const toggleVoiceRecording = async () => {
    setError(null);
    if (isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = async () => {
          if (typeof reader.result !== 'string') return;
          setIsTranscribing(true);
          try {
            const res = await fetch('/api/ai/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64: reader.result,
                mimeType: blob.type || 'audio/webm',
                language: reportLang,
              }),
            });
            const data = await res.json();
            if (res.ok && data.transcript) {
              setAudioTranscript(data.transcript);
              setDescription((prev) => (prev ? `${prev}\n${data.transcript}` : data.transcript));
              if (!title.trim()) {
                setTitle(data.transcript.slice(0, 80));
              }
            } else {
              setError(data.error || 'Could not transcribe voice note.');
            }
          } catch {
            setError('Failed to send voice recording for transcription.');
          } finally {
            setIsTranscribing(false);
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      setError('Microphone permission denied or unavailable.');
    }
  };

  const runAIAnalysis = async () => {
    if (!title.trim() && !description.trim() && !beforeImage) {
      setError('Enter a description or upload a photo before running AI triage.');
      return;
    }
    setError(null);
    setAnalyzing(true);
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          language: reportLang,
          ward,
          imageBase64: beforeImage,
          imageMimeType: imageMime,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setAiResult(data);
        setManualCategory(data.category);
      } else {
        setError(data.error || 'AI analysis failed.');
      }
    } catch {
      setError('Failed to contact AI triage endpoint.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user || !token) {
      onRequireAuth();
      return;
    }
    if (!title.trim() || !description.trim()) {
      setError('Please enter both an issue headline and detailed description.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/complaints', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          description,
          language: reportLang,
          category: manualCategory || aiResult?.category,
          department: aiResult?.department,
          priority: aiResult?.priority,
          urgencyScore: aiResult?.urgencyScore,
          latitude: coords.lat,
          longitude: coords.lng,
          address: address || ward,
          ward,
          beforeImage,
          videoData,
          audioTranscript,
          aiSummary: aiResult?.summary,
          aiImageAnalysis: aiResult?.imageAnalysis,
          aiDuplicateOf: aiResult?.possibleDuplicateTrackingId,
          aiConfidence: aiResult?.confidence,
          suggestedDeadlineHours: aiResult?.suggestedDeadlineHours,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to submit complaint.');
        return;
      }

      setSuccessComplaint(data.complaint);
      onComplaintCreated(data.complaint);
      setTitle('');
      setDescription('');
      setAddress('');
      setBeforeImage(null);
      setVideoData(null);
      setAudioTranscript(null);
      setAiResult(null);
      setManualCategory('');
    } catch {
      setError('Network error while submitting complaint.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Strip */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{t.form.heading}</h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">{t.form.subheading}</p>
        </div>
        {!user && (
          <button
            type="button"
            onClick={onRequireAuth}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg whitespace-nowrap shrink-0"
          >
            Sign In to Submit
          </button>
        )}
      </div>

      {successComplaint && (
        <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-700 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-950">
                Grievance Registered ·{' '}
                <span className="font-mono-tabular">{successComplaint.tracking_id}</span>
              </p>
              <p className="text-xs text-emerald-800 mt-0.5">
                Routed to {successComplaint.department} ({successComplaint.priority} priority).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSelectComplaint(successComplaint)}
            className="px-3.5 py-2 text-xs font-semibold text-emerald-900 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-100 whitespace-nowrap"
          >
            View Tracking Details
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Main Submission Form */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5"
        >
          {/* Language & Ward row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {t.form.langLabel}
              </label>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setReportLang('en')}
                  className={`py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    reportLang === 'en' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => setReportLang('kn')}
                  className={`py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    reportLang === 'kn' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  ಕನ್ನಡ (Kannada)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {t.form.wardLabel}
              </label>
              <select
                value={ward}
                onChange={(e) => setWard(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-700"
              >
                {BENGALURU_WARDS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {t.form.titleLabel}
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t.form.titlePlaceholder}
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                {t.form.descLabel}
              </label>
              <button
                type="button"
                onClick={toggleVoiceRecording}
                disabled={isTranscribing}
                className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  isRecording
                    ? 'bg-red-600 text-white'
                    : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                }`}
              >
                {isRecording ? (
                  <>
                    <Square className="w-3 h-3" />
                    <span>{t.actions.stopRecording}</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5 text-blue-700" />
                    <span>{isTranscribing ? t.actions.transcribing : t.actions.recordVoice}</span>
                  </>
                )}
              </button>
            </div>
            <textarea
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t.form.descPlaceholder}
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
            {audioTranscript && (
              <p className="text-xs text-blue-700 mt-1">
                Voice transcript attached via Gemini speech recognition.
              </p>
            )}
          </div>

          {/* Media Upload Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="border border-dashed border-slate-300 rounded-lg p-3.5 hover:border-blue-600 transition-colors cursor-pointer block">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                <Camera className="w-4 h-4 text-blue-700" />
                <span>{beforeImage ? 'Photo Attached (Replace)' : 'Attach Issue Photo'}</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">{t.form.photoHint}</p>
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="sr-only"
              />
            </label>

            <label className="border border-dashed border-slate-300 rounded-lg p-3.5 hover:border-blue-600 transition-colors cursor-pointer block">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                <Video className="w-4 h-4 text-blue-700" />
                <span>{videoData ? 'Video Attached (Replace)' : 'Attach Video Clip'}</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">{t.form.videoHint}</p>
              <input
                type="file"
                accept="video/*"
                onChange={handleVideoUpload}
                className="sr-only"
              />
            </label>
          </div>

          {beforeImage && (
            <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
              <img
                src={beforeImage}
                alt="Uploaded civic issue preview"
                className="w-full max-h-56 object-cover"
              />
            </div>
          )}

          {/* Location Picker */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-700">
                {t.form.addressLabel}
              </label>
              <button
                type="button"
                onClick={handleDetectGps}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
              >
                <LocateFixed className="w-3.5 h-3.5" />
                <span>{t.actions.detectGps}</span>
              </button>
            </div>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t.form.addressPlaceholder}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Click anywhere on the map below to adjust exact pin</span>
              <span className="font-mono-tabular">
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </span>
            </div>
            {gpsStatus && <p className="text-xs text-blue-700">{gpsStatus}</p>}
            <InteractiveMap
              complaints={[]}
              pickerMode={true}
              pickedCoords={coords}
              onPickCoords={(lat, lng) => setCoords({ lat, lng })}
              heightClass="h-56"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Actions Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={runAIAnalysis}
              disabled={analyzing}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <Sparkles className="w-4 h-4 text-blue-700" />
              <span>{analyzing ? 'Analyzing...' : t.actions.analyzeAI}</span>
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors"
            >
              <Send className="w-4 h-4" />
              <span>{submitting ? 'Submitting...' : t.actions.submitComplaint}</span>
            </button>
          </div>
        </form>

        {/* Right Column: AI Triage Preview + Citizen History */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">{t.form.aiTriageTitle}</h2>
              {aiResult && (
                <span className="text-xs font-mono-tabular text-blue-700">
                  {Math.round(aiResult.confidence * 100)}% match
                </span>
              )}
            </div>

            {!aiResult ? (
              <div className="py-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg px-4">
                <Upload className="w-5 h-5 mx-auto mb-2 text-slate-400" />
                <p>
                  Click <strong>{t.actions.analyzeAI}</strong> to classify your issue, identify
                  hazards from photos, detect nearby duplicates, and recommend the municipal
                  department before submitting.
                </p>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <span className="text-slate-500 block">Category</span>
                    <select
                      value={manualCategory || aiResult.category}
                      onChange={(e) => setManualCategory(e.target.value as ComplaintCategory)}
                      className="mt-1 w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded bg-slate-50"
                    >
                      {Object.keys(t.categories)
                        .filter((c) => c !== 'All')
                        .map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Recommended Department</span>
                    <span className="font-semibold text-slate-900 block mt-2">
                      {aiResult.department}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-600">
                    Priority: <strong className="text-slate-900">{aiResult.priority}</strong>
                  </span>
                  <span className="font-mono-tabular text-slate-600">
                    Urgency {aiResult.urgencyScore}/100 · SLA {aiResult.suggestedDeadlineHours}h
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="font-semibold text-slate-800 block mb-1">
                    Multilingual Executive Summary
                  </span>
                  <p className="text-slate-700 leading-relaxed">{aiResult.summary}</p>
                </div>

                {aiResult.imageAnalysis && (
                  <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-200">
                    <span className="font-semibold text-blue-950 block mb-1">
                      AI Photo Inspection
                    </span>
                    <p className="text-blue-900 leading-relaxed">{aiResult.imageAnalysis}</p>
                  </div>
                )}

                {aiResult.possibleDuplicateTrackingId && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2 text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">{t.form.duplicateAlert}</p>
                      <p className="mt-0.5">
                        Similar to{' '}
                        <strong className="font-mono-tabular">
                          {aiResult.possibleDuplicateTrackingId}
                        </strong>
                        {aiResult.duplicateReason ? ` — ${aiResult.duplicateReason}` : ''}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Citizen Submission History */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Your Complaint History</h2>
              <span className="font-mono-tabular text-xs text-slate-500">
                {user ? `${myComplaints.length} filed` : 'Sign in required'}
              </span>
            </div>

            {!user ? (
              <p className="text-xs text-slate-500">{t.form.loginRequired}</p>
            ) : myComplaints.length === 0 ? (
              <p className="text-xs text-slate-500">
                You have not submitted any complaints yet. Your tracked issues will appear here.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {myComplaints.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSelectComplaint(c)}
                    className="w-full text-left py-3 hover:bg-slate-50 transition-colors flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono-tabular font-semibold text-slate-900">
                          {c.tracking_id}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{c.category}</span>
                      </div>
                      <p className="text-xs font-semibold text-slate-800 mt-0.5 truncate">
                        {c.title}
                      </p>
                    </div>
                    <StatusIndicator status={c.status} isOverdue={c.is_overdue} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
