import * as d3 from 'd3';
import { Family, Person, TreeData } from './models';

export const CARD_W = 168;
export const CARD_H = 60;
export const COUPLE_GAP = 18;
export const ROW_H = 132;

export interface CardBox {
  key: string;          // unique per drawn card
  person: Person;
  x: number;            // top-left
  y: number;
  role: 'focus' | 'descendant' | 'spouse' | 'ancestor';
  /** Person has relatives not drawn in the current view. */
  more: boolean;
}

export interface Link {
  key: string;
  path: string;
  kind: 'parent' | 'couple';
  former?: boolean;
}

export interface Layout {
  cards: CardBox[];
  links: Link[];
  focusCenter: { x: number; y: number };
}

interface DescNode {
  person: Person;
  spouses: { fam: Family; spouse?: Person }[];
  viaFamily?: string;      // which of the parent's families this child belongs to
  width: number;
  children: DescNode[];
  truncated: boolean;
}

interface AncNode {
  person: Person;
  children: AncNode[];
  truncated: boolean;
}

function unitWidth(n: number) {
  return n * CARD_W + (n - 1) * COUPLE_GAP;
}

function elbow(x1: number, y1: number, x2: number, y2: number): string {
  const my = (y1 + y2) / 2;
  return `M${x1},${y1}V${my}H${x2}V${y2}`;
}

export function computeLayout(data: TreeData, focusId: string, ancDepth: number, descDepth: number): Layout {
  const fams = Object.values(data.families);
  const spouseFams = (id: string) => fams.filter(f => f.husb === id || f.wife === id);
  const childFam = (id: string) => fams.find(f => f.children.includes(id));
  const focus = data.people[focusId];
  if (!focus) return { cards: [], links: [], focusCenter: { x: 0, y: 0 } };

  /* ---- descendants ---- */
  const seen = new Set<string>();
  const buildDesc = (p: Person, depth: number, via?: string): DescNode => {
    seen.add(p.id);
    const sf = spouseFams(p.id)
      // current partnerships first, then by number of children
      .sort((a, b) => Number(b.current !== false) - Number(a.current !== false));
    const spouses = sf.map(fam => {
      const sid = fam.husb === p.id ? fam.wife : fam.husb;
      return { fam, spouse: sid ? data.people[sid] : undefined };
    });
    const drawnSpouses = spouses.filter(s => s.spouse).length;
    const node: DescNode = {
      person: p, spouses, viaFamily: via,
      width: unitWidth(1 + drawnSpouses), children: [], truncated: false,
    };
    for (const s of spouses) {
      for (const cid of s.fam.children) {
        const c = data.people[cid];
        if (!c || seen.has(cid)) continue;
        if (depth <= 0) { node.truncated = true; continue; }
        node.children.push(buildDesc(c, depth - 1, s.fam.id));
      }
    }
    return node;
  };
  const descRoot = d3.hierarchy(buildDesc(focus, descDepth), d => d.children);
  d3.tree<DescNode>()
    .nodeSize([1, ROW_H])
    .separation((a, b) => (a.data.width + b.data.width) / 2 + (a.parent === b.parent ? 28 : 56))(descRoot);

  const cards: CardBox[] = [];
  const links: Link[] = [];
  const personCardCenter = new Map<string, { x: number; y: number }>(); // per desc node key

  for (const n of descRoot.descendants() as d3.HierarchyPointNode<DescNode>[]) {
    const left = n.x - n.data.width / 2;
    const top = n.y - CARD_H / 2;
    const isFocus = n.depth === 0;
    const p = n.data.person;
    cards.push({
      key: `d-${p.id}`, person: p, x: left, y: top,
      role: isFocus ? 'focus' : 'descendant',
      more: n.data.truncated,
    });
    personCardCenter.set(p.id, { x: left + CARD_W / 2, y: n.y });
    let slot = 0;
    const slotOfFamily = new Map<string, number>();
    for (const s of n.data.spouses) {
      if (!s.spouse) { slotOfFamily.set(s.fam.id, 0); continue; }
      slot++;
      slotOfFamily.set(s.fam.id, slot);
      const sx = left + slot * (CARD_W + COUPLE_GAP);
      cards.push({
        key: `s-${p.id}-${s.spouse.id}`, person: s.spouse, x: sx, y: top, role: 'spouse',
        more: !!childFam(s.spouse.id) || spouseFams(s.spouse.id).length > 1,
      });
      links.push({
        key: `c-${s.fam.id}`, kind: 'couple', former: s.fam.current === false,
        path: `M${left + CARD_W},${n.y}H${sx}`,
      });
    }
    for (const c of n.children ?? []) {
      const s = slotOfFamily.get(c.data.viaFamily ?? '') ?? 0;
      const ox = s === 0 ? left + CARD_W / 2 : left + s * (CARD_W + COUPLE_GAP) - COUPLE_GAP / 2;
      const oy = s === 0 ? n.y + CARD_H / 2 : n.y;
      const cx = c.x - c.data.width / 2 + CARD_W / 2;
      links.push({ key: `p-${c.data.person.id}`, kind: 'parent', path: elbow(ox, oy, cx, c.y - CARD_H / 2) });
    }
  }

  const focusCenter = personCardCenter.get(focus.id)!;

  /* ---- ancestors ---- */
  const aseen = new Set<string>([focus.id]);
  const buildAnc = (p: Person, depth: number): AncNode => {
    const node: AncNode = { person: p, children: [], truncated: false };
    const f = childFam(p.id);
    if (!f) return node;
    const parents = [f.husb, f.wife].filter((x): x is string => !!x && !!data.people[x] && !aseen.has(x));
    if (depth <= 0) { node.truncated = parents.length > 0; return node; }
    for (const pid of parents) { aseen.add(pid); node.children.push(buildAnc(data.people[pid], depth - 1)); }
    return node;
  };
  const ancRoot = d3.hierarchy(buildAnc(focus, ancDepth), d => d.children);
  d3.tree<AncNode>()
    .nodeSize([1, ROW_H])
    .separation((a, b) => CARD_W + (a.parent === b.parent ? COUPLE_GAP : 48))(ancRoot);
  const dx = focusCenter.x - ancRoot.x!;

  for (const n of ancRoot.descendants() as d3.HierarchyPointNode<AncNode>[]) {
    if (n.depth === 0) continue;
    const cx = n.x + dx;
    const cy = -n.y + focusCenter.y;
    cards.push({
      key: `a-${n.data.person.id}`, person: n.data.person,
      x: cx - CARD_W / 2, y: cy - CARD_H / 2, role: 'ancestor',
      more: n.data.truncated,
    });
  }
  for (const n of ancRoot.descendants() as d3.HierarchyPointNode<AncNode>[]) {
    const kids = n.children ?? [];
    if (!kids.length) continue;
    const childX = n.x + dx;
    const childTop = -n.y + focusCenter.y - CARD_H / 2;
    const py = -kids[0].y + focusCenter.y;
    let ox: number, oy: number;
    if (kids.length === 2) {
      const a = kids[0].x + dx, b = kids[1].x + dx;
      links.push({ key: `ac-${n.data.person.id}`, kind: 'couple', path: `M${a + CARD_W / 2},${py}H${b - CARD_W / 2}` });
      ox = (a + b) / 2; oy = py;
    } else {
      ox = kids[0].x + dx; oy = py + CARD_H / 2;
    }
    links.push({ key: `ap-${n.data.person.id}`, kind: 'parent', path: elbow(ox, oy, childX, childTop) });
  }

  // Mark focus "more" when it has parents or siblings outside the view.
  const fc = cards.find(c => c.role === 'focus');
  if (fc) {
    const f = childFam(focus.id);
    fc.more = fc.more || (!!f && f.children.length > 1);
  }

  return { cards, links, focusCenter };
}
