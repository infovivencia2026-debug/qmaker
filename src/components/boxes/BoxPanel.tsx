import type { ReactNode } from 'react';
import { marksOf, type Box, type BoxLayout, type BoxMarks, type BoxNumber, type BoxStyle, type NumberFormat } from '../../lib/box';

function Choice<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="choice">
      {options.map(([v, l]) => <button key={String(v)} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

function Switch({ on, label, onChange, children }: { on: boolean; label: string; onChange: (v: boolean) => void; children?: ReactNode }) {
  return (
    <div className={`sw ${on ? 'on' : ''}`}>
      <label className="check sw-h"><input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} /> {label}</label>
      {on && children && <div className="sw-b">{children}</div>}
    </div>
  );
}

const NUMBER_PATTERNS = ['{n}.', '({n})', '{n})', 'Q{n}.', 'Q.{n}', '[{n}]'];
const MARK_PATTERNS: [string, string][] = [['[{m}]', '[2]'], ['({m})', '(2)'], ['{m} Marks', '2 Marks'], ['{k} × {e} = {m}', '5 × 2 = 10'], ['{m}', '2']];

/** Every switch a box has. Nothing here is specific to a kind of question. */
export default function BoxPanel({ b, update }: { b: Box; update: (patch: Partial<Box>) => void }) {
  const setNumber = (p: Partial<BoxNumber>) => update({ number: { format: '1', pattern: '{n}.', scope: 'local', ...b.number, ...p } });
  const setMarks = (p: Partial<BoxMarks>) => update({ marks: { mode: 'fixed', show: true, value: 1, ...b.marks, ...p } });
  const setLayout = (p: Partial<BoxLayout>) => update({ layout: { mode: 'stack', ...b.layout, ...p } });
  const setStyle = (p: Partial<BoxStyle>) => update({ style: { ...b.style, ...p } });
  const s = b.style ?? {};

  return (
    <>
      <div className="panel">
        <label>Name (for the library and the outline)<input value={b.name ?? ''} placeholder="e.g. Question, Section, Options" onChange={(e) => update({ name: e.target.value || undefined })} /></label>
        <Switch on={b.content !== undefined} label="Has its own text" onChange={(v) => update({ content: v ? '' : undefined, content2: v ? b.content2 : undefined })} />
      </div>

      <div className="panel">
        <Switch on={!!b.number} label="Numbered" onChange={(v) => update({ number: v ? { format: '1', pattern: '{n}.', scope: 'local' } : undefined })}>
          <div className="field-l">Style</div>
          <Choice value={b.number?.format ?? '1'} onChange={(v: NumberFormat) => setNumber({ format: v })} options={[['1', '1 2 3'], ['a', 'a b c'], ['A', 'A B C'], ['i', 'i ii iii'], ['I', 'I II III']]} />
          <div className="field-l">Printed as</div>
          <Choice value={b.number?.pattern ?? '{n}.'} onChange={(v) => setNumber({ pattern: v })} options={NUMBER_PATTERNS.map((p) => [p, p.replace('{n}', b.number?.format === 'a' ? 'a' : b.number?.format === 'i' ? 'i' : '1')] as [string, string])} />
          <div className="field-l">Counting</div>
          <Choice value={b.number?.scope ?? 'local'} onChange={(v) => setNumber({ scope: v, counter: v === 'paper' ? b.number?.counter || 'q' : undefined })} options={[['local', 'Restart in each box'], ['paper', 'Continue through the paper']]} />
          {b.number?.scope === 'paper' && (
            <label>Counter name (boxes with the same name count together)<input value={b.number.counter ?? ''} onChange={(e) => setNumber({ counter: e.target.value || undefined })} /></label>
          )}
        </Switch>
      </div>

      <div className="panel">
        <Switch on={!!b.marks} label="Marks" onChange={(v) => update({ marks: v ? { mode: 'fixed', value: 1, show: true, pattern: '[{m}]' } : undefined })}>
          <Choice value={b.marks?.mode ?? 'fixed'} onChange={(v) => setMarks({ mode: v })} options={[['fixed', 'This many'], ['sum', 'Add up inside'], ['best', 'Best N inside']]} />
          {b.marks?.mode === 'fixed' && <label>Marks<input type="number" min={0} step={0.5} value={b.marks.value ?? 0} onChange={(e) => setMarks({ value: Number(e.target.value) })} /></label>}
          {b.marks?.mode === 'best' && <label>Count only the best (answer any N)<input type="number" min={1} value={b.marks.best ?? 1} onChange={(e) => setMarks({ best: Number(e.target.value) })} /></label>}
          <div className="muted">Worth {marksOf(b)} marks.</div>
          <label className="check"><input type="checkbox" checked={b.marks?.show ?? true} onChange={(e) => setMarks({ show: e.target.checked })} /> Print the marks on the right</label>
          {b.marks?.show && <Choice value={b.marks.pattern ?? '[{m}]'} onChange={(v) => setMarks({ pattern: v })} options={MARK_PATTERNS} />}
        </Switch>
      </div>

      <div className="panel">
        <div className="panel-h">Inside this box</div>
        <Choice value={b.layout?.mode ?? 'stack'} onChange={(v) => setLayout({ mode: v })} options={[['stack', 'One below another'], ['grid', 'Side by side / grid']]} />
        {b.layout?.mode === 'grid' && (
          <>
            <div className="field-l">Columns</div>
            <Choice value={b.layout.cols ?? 0} onChange={(v) => setLayout({ cols: v || undefined, widths: undefined })} options={[[0, 'All in a row'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [8, '8'], [10, '10']]} />
            <label>Column widths in % (optional, e.g. 30, 70)
              <input value={b.layout.widths?.join(', ') ?? ''} placeholder="equal" onChange={(e) => {
                const w = e.target.value.split(/[,\s]+/).map(Number).filter((x) => x > 0);
                setLayout({ widths: w.length ? w : undefined });
              }} />
            </label>
            <div className="field-l">Fill order</div>
            <Choice value={b.layout.order ?? 'across'} onChange={(v) => setLayout({ order: v })} options={[['across', 'a b → across'], ['down', 'a ↓ b down']]} />
            <label>Gap (mm)<input type="number" min={0} max={30} value={b.layout.gapMm ?? ''} placeholder="auto" onChange={(e) => setLayout({ gapMm: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
          </>
        )}
        <label className="check"><input type="checkbox" checked={!!b.choice} onChange={(e) => update({ choice: e.target.checked || undefined })} /> Choice: print "OR" between the boxes inside</label>
        <label className="check"><input type="checkbox" checked={!!b.shuffle} onChange={(e) => update({ shuffle: e.target.checked || undefined })} /> Shuffle them on the paper (key keeps this order)</label>
      </div>

      <div className="panel">
        <div className="panel-h">Look</div>
        <label className="check"><input type="checkbox" checked={!!s.rule} onChange={(e) => setStyle({ rule: e.target.checked || undefined })} /> Heading (line under the first row)</label>
        <label className="check"><input type="checkbox" checked={!!s.border} onChange={(e) => setStyle({ border: e.target.checked || undefined })} /> Border</label>
        <label className="check"><input type="checkbox" checked={!!s.bold} onChange={(e) => setStyle({ bold: e.target.checked || undefined })} /> Bold text</label>
        <label className="check"><input type="checkbox" checked={!!s.italic} onChange={(e) => setStyle({ italic: e.target.checked || undefined })} /> Italic text</label>
        <label className="check"><input type="checkbox" checked={!!s.pageBreak} onChange={(e) => setStyle({ pageBreak: e.target.checked || undefined })} /> Start on a new page</label>
        <div className="field-l">Align text</div>
        <Choice value={s.align ?? 'left'} onChange={(v) => setStyle({ align: v === 'left' ? undefined : v })} options={[['left', 'Left'], ['center', 'Centre'], ['right', 'Right']]} />
        <div className="two">
          <label>Text size %<input type="number" min={50} max={250} step={5} value={Math.round((s.scale ?? 1) * 100)} onChange={(e) => setStyle({ scale: Number(e.target.value) / 100 === 1 ? undefined : Number(e.target.value) / 100 })} /></label>
          <label>Padding (mm)<input type="number" min={0} max={20} value={s.paddingMm ?? 0} onChange={(e) => setStyle({ paddingMm: Number(e.target.value) || undefined })} /></label>
        </div>
        <label>Space above (pt)<input type="number" min={0} max={72} value={s.spaceBefore ?? 0} onChange={(e) => setStyle({ spaceBefore: Number(e.target.value) || undefined })} /></label>
      </div>

      <div className="panel">
        <div className="panel-h">Paper and answer key</div>
        <Choice value={b.visible ?? 'both'} onChange={(v) => update({ visible: v === 'both' ? undefined : v })} options={[['both', 'Both'], ['paper', 'Paper only'], ['key', 'Answer key only']]} />
        <label className="check"><input type="checkbox" checked={!!b.correct} onChange={(e) => update({ correct: e.target.checked || undefined })} /> Correct answer (highlighted in the key)</label>
      </div>

      <div className="panel">
        <div className="panel-h">For the library and marks distribution</div>
        <div className="two">
          <label>Subject<input value={b.meta?.subject ?? ''} onChange={(e) => update({ meta: { ...b.meta, subject: e.target.value || undefined } })} /></label>
          <label>Chapter<input value={b.meta?.chapter ?? ''} onChange={(e) => update({ meta: { ...b.meta, chapter: e.target.value || undefined } })} /></label>
        </div>
        <Choice value={b.meta?.difficulty ?? ''} onChange={(v) => update({ meta: { ...b.meta, difficulty: (v || undefined) as never } })} options={[['', '—'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']]} />
      </div>
    </>
  );
}
