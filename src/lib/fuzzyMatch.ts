// JS-side fuzzy match for ontology admin queue. Uses trigram overlap on
// lowercased input — cheap, no extension dependency at the SDK layer, returns
// 0..1 similarity scores.
function trigrams(s: string): Set<string> {
  const norm = `  ${s.toLowerCase().trim()}  `;
  const out = new Set<string>();
  for (let i = 0; i < norm.length - 2; i++) out.add(norm.slice(i, i + 3));
  return out;
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const A = trigrams(a);
  const B = trigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}
