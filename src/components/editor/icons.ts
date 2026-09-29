/** Small text glyphs for block types, like the WordPress inserter icons. */
export function templateGlyph(id: string) {
  return ({ mcq: '◉', fib: '__', tf: 'T/F', match: '⇄', short: '≡', long: '¶' } as Record<string, string>)[id] ?? '▢';
}
