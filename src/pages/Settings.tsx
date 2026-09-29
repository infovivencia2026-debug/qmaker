import type { Settings as S, UiLang } from '../shared/types';
import { useStore } from '../store';
import StyleEditor from '../components/StyleEditor';

const MAX_LOGO_BYTES = 300_000;

export default function Settings() {
  const { db, update, t, notify } = useStore();
  const s = db.settings;
  const set = (patch: Partial<S>) => update((db) => ({ ...db, settings: { ...db.settings, ...patch } }));

  const pickLogo = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) return notify('Logo is too large. Please use an image under 300 KB.');
    const reader = new FileReader();
    reader.onload = () => set({ logo: String(reader.result) });
    reader.readAsDataURL(file);
  };

  return (
    <div className="page narrow">
      <h1>{t('settings')}</h1>
      <div className="card">
        <label>{t('institution')}<input value={s.institutionName} onChange={(e) => set({ institutionName: e.target.value })} /></label>
        <label>{t('address')}<input value={s.address} onChange={(e) => set({ address: e.target.value })} /></label>
        <div className="field-l">{t('logo')}</div>
        <div className="row">
          {s.logo && <img src={s.logo} className="logo-prev" />}
          <input type="file" accept="image/png,image/jpeg" onChange={(e) => pickLogo(e.target.files?.[0])} />
          {s.logo && <button className="ghost danger" onClick={() => set({ logo: '' })}>{t('removeLogo')}</button>}
        </div>
      </div>
      <div className="card">
        <h2>Paper font &amp; spacing (default for all papers)</h2>
        <StyleEditor value={s.paperStyle} onChange={(patch) => set({ paperStyle: { ...s.paperStyle, ...patch } })} />
      </div>
      <div className="card">
        <label>{t('language')}
          <select value={s.uiLang} onChange={(e) => set({ uiLang: e.target.value as UiLang })}>
            <option value="en">English</option><option value="hi">हिन्दी</option><option value="te">తెలుగు</option>
          </select>
        </label>
      </div>
    </div>
  );
}
