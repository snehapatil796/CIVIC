import { useState } from 'react';
import { Camera, MoveHorizontal } from 'lucide-react';

interface BeforeAfterSliderProps {
  beforeSrc: string | null;
  afterSrc: string | null;
  title: string;
}

function ImageWithFallback({
  src,
  alt,
  caption,
}: {
  src: string | null;
  alt: string;
  caption: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="w-full h-full bg-slate-100 flex flex-col items-center justify-center p-6 text-center text-slate-500">
        <Camera className="w-8 h-8 mb-2 text-slate-400" />
        <p className="text-xs font-medium text-slate-600">{caption}</p>
        <p className="text-xs text-slate-400 mt-1">Visual evidence pending upload</p>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="w-full h-full object-cover select-none"
    />
  );
}

export function BeforeAfterSlider({ beforeSrc, afterSrc, title }: BeforeAfterSliderProps) {
  const [sliderPos, setSliderPos] = useState(50);

  if (!beforeSrc && !afterSrc) {
    return (
      <div className="border border-slate-200 rounded-lg bg-slate-50 p-6 text-center text-slate-500">
        <Camera className="w-6 h-6 mx-auto mb-2 text-slate-400" />
        <p className="text-sm font-medium text-slate-700">No photographic evidence attached</p>
        <p className="text-xs text-slate-500 mt-1">
          Photos uploaded by citizens and resolution photos from officials appear here.
        </p>
      </div>
    );
  }

  if (beforeSrc && !afterSrc) {
    return (
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <span className="font-medium text-slate-900">Reported Condition (Before)</span>
          <span>Awaiting official resolution evidence</span>
        </div>
        <div className="aspect-[16/10] w-full bg-slate-100">
          <ImageWithFallback src={beforeSrc} alt={`Before repair: ${title}`} caption="Citizen Photo" />
        </div>
      </div>
    );
  }

  if (!beforeSrc && afterSrc) {
    return (
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <span className="font-medium text-emerald-700">Official Resolution Evidence (After)</span>
          <span>Verified repair upload</span>
        </div>
        <div className="aspect-[16/10] w-full bg-slate-100">
          <ImageWithFallback src={afterSrc} alt={`After repair: ${title}`} caption="Resolution Photo" />
        </div>
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between gap-4 text-xs">
        <span className="font-semibold text-slate-900">Before &amp; After Verification Comparison</span>
        <span className="text-slate-500 tabular-nums">Drag slider ({sliderPos}%)</span>
      </div>

      <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-900 select-none">
        {/* After Image (Full underlying layer) */}
        <div className="absolute inset-0">
          <ImageWithFallback src={afterSrc} alt={`After repair: ${title}`} caption="After Repair" />
        </div>

        {/* Before Image (Clipped overlay layer) */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
        >
          <ImageWithFallback src={beforeSrc} alt={`Before repair: ${title}`} caption="Before Repair" />
        </div>

        {/* Divider line & handle */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-md pointer-events-none"
          style={{ left: `${sliderPos}%` }}
        >
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-white text-slate-900 shadow-lg border border-slate-200 flex items-center justify-center">
            <MoveHorizontal className="w-4 h-4" />
          </div>
        </div>

        {/* Bottom Corner Labels with contrast scrim */}
        <div className="absolute bottom-3 left-3 bg-slate-950/75 text-white text-xs font-medium px-2.5 py-1 rounded">
          Before Report
        </div>
        <div className="absolute bottom-3 right-3 bg-emerald-900/85 text-white text-xs font-medium px-2.5 py-1 rounded">
          After Resolution
        </div>

        {/* Accessible range input spanning full area */}
        <input
          type="range"
          min={0}
          max={100}
          value={sliderPos}
          onChange={(e) => setSliderPos(Number(e.target.value))}
          aria-label="Compare before and after repair photos"
          className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-10"
        />
      </div>
    </div>
  );
}
