import { describe, expect, it } from 'vitest';
import { paperLabels } from '../lib/labels';
import { renderPaperHtml } from '../lib/renderHtml';
import { resolvePaper, sectionInstruction } from '../lib/paper';
import { db, paper, q, section } from './fixtures';

describe('printed labels', () => {
  it('translates and joins bilingual labels', () => {
    expect(paperLabels('hi')('maxMarks')).toBe('पूर्णांक');
    expect(paperLabels('en-te')('class')).toBe('Class / తరగతి');
    expect(paperLabels('en-hi')('end')).toBe('*** End of Paper / प्रश्न पत्र समाप्त ***');
    expect(paperLabels()('or')).toBe('OR');
  });

  it('"answer any N" follows the paper language', () => {
    const qs = [q('short', 2), q('short', 2), q('short', 2)];
    const p = paper([section(qs.map((x) => x.id), { attempt: 2 })], { labelLang: 'hi' });
    expect(sectionInstruction(resolvePaper(p, db(qs)).sections[0])).toBe('निम्नलिखित 3 प्रश्नों में से किन्हीं 2 के उत्तर दीजिए।');
  });

  it('prints header, OR and answer key words in the chosen language', () => {
    const a = q('long', 5), b = q('long', 5);
    const p = paper([section([a.id], { alternatives: { [a.id]: b.id } })], { labelLang: 'te' });
    const html = renderPaperHtml(p, db([a, b]), true);
    for (const word of ['తరగతి', 'గరిష్ఠ మార్కులు', 'లేదా', 'జవాబు కీ', 'ప్రశ్నాపత్రం ముగిసింది']) expect(html).toContain(word);
    expect(html).not.toContain('Max. Marks');
  });
});

describe('bilingual questions', () => {
  const a = q('mcq', 1, {
    stem: 'Speed of light?', 'stem@2': 'प्रकाश की चाल?',
    options: { items: ['Fast', 'Slow'], items2: ['तेज़', 'धीमा'], correct: 0 },
  });

  it('prints the second language under the question and each option when enabled', () => {
    const html = renderPaperHtml(paper([section([a.id])], { bilingual: true }), db([a]), false);
    expect(html).toContain('प्रकाश की चाल?');
    expect(html).toContain('(a)</span> Fast<div class="t2">तेज़</div>');
  });

  it('leaves the second language out when the paper is not bilingual', () => {
    const html = renderPaperHtml(paper([section([a.id])]), db([a]), false);
    expect(html).not.toContain('प्रकाश');
    expect(html).not.toContain('तेज़');
  });
});
