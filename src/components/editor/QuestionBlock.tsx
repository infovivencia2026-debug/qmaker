import { useState } from 'react';
import type { OptionsValue, PairsValue, Part, PartNumbering, Question, Template } from '../../shared/types';
import { isGroupTemplate } from '../../shared/templates';
import { asOptions, asParts, asText, fieldValue, optionColumns, partLabel, type ResolvedQuestion } from '../../lib/paper';
import { letter, uid } from '../../lib/util';
import { useStore } from '../../store';
import RichInput from '../RichInput';
import { templateGlyph } from './icons';

type Data = Question['data'];

export function blankPart(t: Template): Part {
  const data: Data = {};
  for (const f of t.fields) if (f.default !== undefined) data[f.key] = structuredClone(f.default);
  return { id: uid(), templateId: t.id, marks: t.defaultMarks, data };
}

/** Fields of a question (or a part) edited in place on the page. */
export function InlineFields({ q, template, selected, answerSpace, onData }: {
  q: Pick<Question, 'id' | 'data'>; template: Template; selected: boolean; answerSpace: boolean; onData: (d: Data) => void;
}) {
  const { db } = useStore();
  const [adding, setAdding] = useState(false);
  const set = (key: string, v: unknown) => onData({ ...q.data, [key]: v });
  const answerFields = template.fields.filter((f) => f.answer);

  return (
    <>
      {template.fields.map((f) => {
        if (f.answer) return null;
        const v = fieldValue(q, f);
        switch (f.type) {
          case 'text':
            return <RichInput key={f.key} className="t" value={asText(v)} placeholder={f.label} onChange={(t) => set(f.key, t)} />;
          case 'options': {
            const o = asOptions(v);
            const setO = (next: Partial<OptionsValue>) => set(f.key, { ...o, ...next });
            return (
              <div key={f.key}>
                <div className={`opts c${optionColumns(o.items)}`}>
                  {o.items.map((it, i) => (
                    <div key={i} className={`opt ${selected && o.correct === i ? 'ok-edit' : ''}`}>
                      <button className="optl" title="Mark as correct answer" onClick={() => setO({ correct: o.correct === i ? null : i })}>({letter(i)})</button>
                      <RichInput single className="grow" value={it} placeholder={`Option ${letter(i)}`} onChange={(t) => setO({ items: o.items.map((x, j) => (j === i ? t : x)) })} />
                      {selected && o.items.length > 2 && (
                        <button className="mini" onClick={() => setO({ items: o.items.filter((_, j) => j !== i), correct: o.correct === i ? null : o.correct !== null && o.correct > i ? o.correct - 1 : o.correct })}>×</button>
                      )}
                    </div>
                  ))}
                </div>
                {selected && (
                  <div className="blk-hint">
                    {o.items.length < 8 && <button className="mini" onClick={() => setO({ items: [...o.items, ''] })}>+ option</button>}
                    <span>Click a letter to mark the correct answer{o.correct === null ? ' — none marked yet' : ''}.</span>
                  </div>
                )}
              </div>
            );
          }
          case 'pairs': {
            const pairs = (Array.isArray(v) ? v : []) as PairsValue;
            const setP = (i: number, side: 0 | 1, text: string) =>
              set(f.key, pairs.map((p, j) => (j === i ? ((side ? [p[0], text] : [text, p[1]]) as [string, string]) : p)));
            return (
              <div key={f.key}>
                <table className="pairs">
                  <tbody>
                    <tr><th>A</th><th>B {selected && <span className="blk-hint-inline">(correct match — shuffled when printed)</span>}</th></tr>
                    {pairs.map((p, i) => (
                      <tr key={i}>
                        <td><RichInput single value={p[0]} placeholder={`${i + 1}.`} onChange={(t) => setP(i, 0, t)} /></td>
                        <td className="row-cell">
                          <RichInput single className="grow" value={p[1]} onChange={(t) => setP(i, 1, t)} />
                          {selected && <button className="mini" onClick={() => set(f.key, pairs.filter((_, j) => j !== i))}>×</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {selected && <div className="blk-hint"><button className="mini" onClick={() => set(f.key, [...pairs, ['', '']])}>+ pair</button></div>}
              </div>
            );
          }
          case 'lines': {
            const n = Math.min(Number(v) || 0, 60);
            return answerSpace && n > 0 ? <div key={f.key} className="lines">{Array.from({ length: n }, (_, i) => <div key={i} />)}</div> : null;
          }
          case 'parts': {
            const pv = asParts(v);
            const setParts = (items: Part[], numbering: PartNumbering = pv.numbering) => set(f.key, { numbering, items });
            const setPart = (i: number, patch: Partial<Part>) => setParts(pv.items.map((p, j) => (j === i ? { ...p, ...patch } : p)));
            const choices = db.templates.filter((t) => !isGroupTemplate(t));
            return (
              <div key={f.key} className="parts">
                {pv.items.map((p, i) => {
                  const t = db.templates.find((x) => x.id === p.templateId);
                  return (
                    <div key={p.id} className="q part">
                      <div className="qn">{partLabel(pv.numbering, i)}</div>
                      <div>{t ? <InlineFields q={p} template={t} selected={selected} answerSpace={answerSpace} onData={(data) => setPart(i, { data })} /> : <i>missing template</i>}</div>
                      <div className="qm part-m">
                        {selected ? (
                          <>
                            [<input className="ib marks-in" type="number" min={0} step={0.5} value={p.marks} onChange={(e) => setPart(i, { marks: Number(e.target.value) })} />]
                            <span className="part-tools">
                              <button className="mini" title="Move up" disabled={!i} onClick={() => { const a = [...pv.items]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setParts(a); }}>↑</button>
                              <button className="mini" title="Remove part" onClick={() => setParts(pv.items.filter((_, j) => j !== i))}>×</button>
                            </span>
                          </>
                        ) : `[${p.marks}]`}
                      </div>
                    </div>
                  );
                })}
                {selected && (
                  <div className="blk-hint parts-add">
                    {adding ? (
                      <span className="part-choices">
                        Add part:{' '}
                        {choices.map((t) => (
                          <button key={t.id} className="chip" onClick={() => { setParts([...pv.items, blankPart(t)]); setAdding(false); }}>
                            {templateGlyph(t.id)} {t.name}
                          </button>
                        ))}
                        <button className="mini" onClick={() => setAdding(false)}>cancel</button>
                      </span>
                    ) : (
                      <>
                        <button className="mini" onClick={() => setAdding(true)}>+ part</button>
                        <span>Numbering:</span>
                        {(['a', 'i', '1'] as PartNumbering[]).map((n) => (
                          <button key={n} className={`mini ${pv.numbering === n ? 'on' : ''}`} onClick={() => setParts(pv.items, n)}>{partLabel(n, 0)}</button>
                        ))}
                        {!pv.items.length && <span className="warn-text">Add at least one part.</span>}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          }
          default:
            return null;
        }
      })}
      {selected && answerFields.length > 0 && (
        <div className="ans-edit">
          <div className="ans-edit-l">Answer key only — not printed on the paper</div>
          {answerFields.map((f) => {
            const v = fieldValue(q, f);
            if (f.type === 'truefalse')
              return (
                <div key={f.key} className="tf">
                  {[true, false].map((b) => (
                    <button key={String(b)} className={v === b ? 'on' : ''} onClick={() => set(f.key, v === b ? null : b)}>{b ? 'True' : 'False'}</button>
                  ))}
                </div>
              );
            if (f.type === 'text') return <RichInput key={f.key} value={asText(v)} placeholder={f.label} onChange={(t) => set(f.key, t)} />;
            return null;
          })}
        </div>
      )}
    </>
  );
}

interface Props {
  rq: ResolvedQuestion;
  /** Which of the either/or pair this block shows. */
  which?: 'main' | 'alt';
  selected: boolean;
  answerSpace: boolean;
  onSelect: () => void;
  onData: (data: Data) => void;
  onMove?: (d: number) => void;
  onDuplicate?: () => void;
  onRemove: () => void;
  /** Number of other papers that also use this question. */
  sharedCount?: number;
}

/** A question edited in place on the page, styled like the printed paper. */
export default function QuestionBlock({ rq, which = 'main', selected, answerSpace, onSelect, onData, onMove, onDuplicate, onRemove, sharedCount = 0 }: Props) {
  const isAlt = which === 'alt';
  const q = isAlt ? rq.alt!.question : rq.question;
  const template = isAlt ? rq.alt!.template : rq.template;

  return (
    <div className={`blk q ${selected ? 'sel' : ''}`} onMouseDown={(e) => { e.stopPropagation(); onSelect(); }}>
      {selected && (
        <div className="blk-bar" onMouseDown={(e) => e.stopPropagation()}>
          <span className="blk-type">{isAlt ? `OR · ${template.name}` : template.name}</span>
          {sharedCount > 0 && <span className="blk-shared" title="Editing this question also changes those papers. See the sidebar to make a separate copy.">⚠ also in {sharedCount} other paper{sharedCount > 1 ? 's' : ''}</span>}
          {onMove && <button title="Move up" onClick={() => onMove(-1)}>↑</button>}
          {onMove && <button title="Move down" onClick={() => onMove(1)}>↓</button>}
          {onDuplicate && <button title="Duplicate" onClick={onDuplicate}>⧉</button>}
          <button title={isAlt ? 'Remove the OR question' : 'Remove from paper'} onClick={onRemove}>🗑</button>
        </div>
      )}
      <div className="qn">{isAlt ? '' : `${rq.number}.`}</div>
      <div><InlineFields q={q} template={template} selected={selected} answerSpace={answerSpace} onData={onData} /></div>
      <div className="qm">{isAlt ? '' : `[${rq.marks}]`}</div>
    </div>
  );
}
