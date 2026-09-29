import type { PaperStyle } from '../shared/types';
import { HINDI_FONTS, LATIN_FONTS, TELUGU_FONTS, type FontChoice } from '../lib/fonts';

const SAMPLES = { latin: 'The quick brown fox 123', hindi: 'प्रश्न का उत्तर लिखिए', telugu: 'ప్రశ్నకు జవాబు రాయండి' };

function FontPicker({ label, list, value, sample, onChange }: { label: string; list: FontChoice[]; value: string; sample: string; onChange: (id: string) => void }) {
  return (
    <div className="fontpick">
      <div className="fontpick-l">{label}</div>
      {list.map((f) => (
        <button key={f.id} className={`fontopt ${f.id === value ? 'on' : ''}`} onClick={() => onChange(f.id)} title={`Word uses ${f.word}`}>
          <span className="fontopt-s" style={{ fontFamily: `'${f.css}'` }}>{sample}</span>
          <span className="fontopt-n">{f.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Fonts per script + sizes. Changes show live on the paper. */
export default function StyleEditor({ value, onChange }: { value: PaperStyle; onChange: (patch: Partial<PaperStyle>) => void }) {
  const num = (k: keyof PaperStyle, min: number, max: number, step: number, unit: string, label: string) => (
    <label className="slider">
      <span>{label} <b>{value[k]}{unit}</b></span>
      <div className="row">
        <button onClick={() => onChange({ [k]: Math.max(min, +(Number(value[k]) - step).toFixed(2)) })}>−</button>
        <input type="range" min={min} max={max} step={step} value={Number(value[k])} onChange={(e) => onChange({ [k]: Number(e.target.value) })} />
        <button onClick={() => onChange({ [k]: Math.min(max, +(Number(value[k]) + step).toFixed(2)) })}>+</button>
      </div>
    </label>
  );
  return (
    <div className="style-ed">
      {num('fontSize', 9, 16, 0.5, 'pt', 'Font size')}
      {num('lineHeight', 1.1, 2.2, 0.05, '', 'Line spacing')}
      {num('questionGap', 0, 24, 1, 'pt', 'Space between questions')}
      <FontPicker label="English" list={LATIN_FONTS} value={value.latinFont} sample={SAMPLES.latin} onChange={(id) => onChange({ latinFont: id })} />
      <FontPicker label="हिन्दी" list={HINDI_FONTS} value={value.hindiFont} sample={SAMPLES.hindi} onChange={(id) => onChange({ hindiFont: id })} />
      <FontPicker label="తెలుగు" list={TELUGU_FONTS} value={value.teluguFont} sample={SAMPLES.telugu} onChange={(id) => onChange({ teluguFont: id })} />
      <p className="muted">PDF uses exactly these fonts. Word files use Nirmala UI for Hindi and Telugu so they open correctly on any Windows PC.</p>
    </div>
  );
}
