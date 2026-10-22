import { type Family, type GedNode, type Person, type TreeData, emptyPerson } from './models';

const LINE_RE = /^\s*(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s(.*))?$/;

/** Parse GEDCOM text into a tree of nodes. */
export function parseNodes(text: string): GedNode[] {
  const roots: GedNode[] = [];
  const stack: GedNode[] = [];
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const m = LINE_RE.exec(raw);
    if (!m) continue;
    const node: GedNode = { level: Number(m[1]), tag: m[3].toUpperCase(), value: m[4] ?? '', children: [] };
    if (m[2]) node.xref = m[2].slice(1, -1);
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop();
    if (stack.length) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
  }
  return roots;
}

const ptr = (v: string) => v.trim().replace(/^@|@$/g, '');
const child = (n: GedNode, tag: string) => n.children.find(c => c.tag === tag);
const childValue = (n: GedNode | undefined, tag: string) => (n ? child(n, tag)?.value.trim() ?? '' : '');

/** Join a value with its CONC/CONT continuation lines. */
function fullText(n: GedNode): string {
  let s = n.value;
  for (const c of n.children) {
    if (c.tag === 'CONC') s += c.value;
    else if (c.tag === 'CONT') s += '\n' + c.value;
  }
  return s;
}

const PERSON_TAGS = new Set(['NAME', 'SEX', 'BIRT', 'DEAT', 'NOTE', 'FAMS', 'FAMC']);
const FAMILY_TAGS = new Set(['HUSB', 'WIFE', 'CHIL', 'MARR', '_CURRENT']);

export function parseGedcom(text: string): TreeData {
  const roots = parseNodes(text);
  const people: Record<string, Person> = {};
  const families: Record<string, Family> = {};
  const order: string[] = [];
  let submitterName = '';
  const famcLinks: [string, string][] = []; // [person, family]

  for (const rec of roots) {
    if (rec.tag === 'HEAD') {
      // Family Echo puts the NAME under HEAD.SUBM; standard files point HEAD.SUBM at a separate SUBM record.
      const subm = child(rec, 'SUBM');
      const target = subm && ptr(subm.value);
      submitterName = childValue(subm, 'NAME')
        || childValue(roots.find(r => r.tag === 'SUBM' && target && r.xref === target), 'NAME');
    } else if (rec.tag === 'INDI' && rec.xref) {
      const p = emptyPerson(rec.xref);
      const name = child(rec, 'NAME');
      if (name) {
        const mm = /^([^/]*)(?:\/([^/]*)\/?)?(.*)$/.exec(name.value) ?? [];
        p.given = childValue(name, 'GIVN') || `${(mm[1] ?? '').trim()} ${(mm[3] ?? '').trim()}`.trim();
        p.surname = childValue(name, 'SURN') || (mm[2] ?? '').trim();
        p.marriedName = childValue(name, '_MARNM');
      }
      const sex = childValue(rec, 'SEX').toUpperCase();
      p.sex = sex === 'M' || sex === 'F' ? sex : 'U';
      const birt = child(rec, 'BIRT');
      p.birthDate = childValue(birt, 'DATE');
      p.birthPlace = childValue(birt, 'PLAC');
      const deat = child(rec, 'DEAT');
      if (deat) {
        p.deceased = true;
        p.deathDate = childValue(deat, 'DATE');
        p.deathPlace = childValue(deat, 'PLAC');
      }
      const note = child(rec, 'NOTE');
      if (note && !note.value.startsWith('@')) p.notes = fullText(note);
      for (const c of rec.children) {
        if (c.tag === 'FAMC') famcLinks.push([p.id, ptr(c.value)]);
        if (!PERSON_TAGS.has(c.tag) || (c.tag === 'NOTE' && c.value.startsWith('@'))) p.extra.push(c);
      }
      people[p.id] = p;
      order.push(p.id);
    } else if (rec.tag === 'FAM' && rec.xref) {
      const f: Family = { id: rec.xref, children: [], marrDate: '', marrPlace: '', extra: [] };
      for (const c of rec.children) {
        if (c.tag === 'HUSB') f.husb = ptr(c.value);
        else if (c.tag === 'WIFE') f.wife = ptr(c.value);
        else if (c.tag === 'CHIL') f.children.push(ptr(c.value));
        else if (c.tag === 'MARR') { f.marrDate = childValue(c, 'DATE'); f.marrPlace = childValue(c, 'PLAC'); }
        else if (c.tag === '_CURRENT') f.current = c.value.trim().toUpperCase() !== 'N';
        if (!FAMILY_TAGS.has(c.tag)) f.extra.push(c);
      }
      families[f.id] = f;
    }
  }

  // Drop links to people that do not exist, and add children only listed on the INDI side.
  for (const f of Object.values(families)) {
    if (f.husb && !people[f.husb]) delete f.husb;
    if (f.wife && !people[f.wife]) delete f.wife;
    f.children = f.children.filter(id => people[id]);
  }
  for (const [pid, fid] of famcLinks) {
    const f = families[fid];
    if (f && !f.children.includes(pid)) f.children.push(pid);
  }
  return { people, families, order, submitterName };
}

/* ---------------- export ---------------- */

function line(level: number, tag: string, value = '', xref?: string): string {
  return [String(level), xref ? `@${xref}@` : '', tag, value].filter(Boolean).join(' ');
}

function writeNode(n: GedNode, level: number, out: string[]) {
  out.push(line(level, n.tag, n.value, n.xref));
  for (const c of n.children) writeNode(c, level + 1, out);
}

function writeText(level: number, tag: string, text: string, out: string[]) {
  const parts = text.split('\n');
  out.push(line(level, tag, parts[0]));
  for (const p of parts.slice(1)) out.push(line(level + 1, 'CONT', p));
}

function gedDate(d: Date): string {
  const m = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`;
}

export function serializeGedcom(data: TreeData, now = new Date()): string {
  const out: string[] = [];
  out.push('0 HEAD');
  out.push('1 SOUR FAMILY_TREE_D3');
  out.push('2 NAME Family Tree (Angular + D3)');
  out.push('2 VERS 1.0');
  out.push('1 DATE ' + gedDate(now));
  out.push('1 GEDC');
  out.push('2 VERS 5.5.1');
  out.push('2 FORM LINEAGE-LINKED');
  out.push('1 CHAR UTF-8');
  out.push('1 SUBM @U1@');

  const fams = Object.values(data.families);
  const ids = [...data.order.filter(id => data.people[id]),
    ...Object.keys(data.people).filter(id => !data.order.includes(id))];

  for (const id of ids) {
    const p = data.people[id];
    out.push(line(0, 'INDI', '', p.id));
    const given = p.given.trim();
    const sur = p.surname.trim();
    out.push(line(1, 'NAME', sur ? `${given} /${sur}/`.trim() : given));
    if (given) out.push(line(2, 'GIVN', given));
    if (sur) out.push(line(2, 'SURN', sur));
    if (p.marriedName.trim()) out.push(line(2, '_MARNM', p.marriedName.trim()));
    if (p.sex !== 'U') out.push(line(1, 'SEX', p.sex));
    if (p.birthDate.trim() || p.birthPlace.trim()) {
      out.push(line(1, 'BIRT'));
      if (p.birthDate.trim()) out.push(line(2, 'DATE', p.birthDate.trim()));
      if (p.birthPlace.trim()) out.push(line(2, 'PLAC', p.birthPlace.trim()));
    }
    if (p.deceased) {
      if (p.deathDate.trim() || p.deathPlace.trim()) {
        out.push(line(1, 'DEAT'));
        if (p.deathDate.trim()) out.push(line(2, 'DATE', p.deathDate.trim()));
        if (p.deathPlace.trim()) out.push(line(2, 'PLAC', p.deathPlace.trim()));
      } else {
        out.push(line(1, 'DEAT', 'Y'));
      }
    }
    if (p.notes.trim()) writeText(1, 'NOTE', p.notes.trim(), out);
    for (const f of fams) if (f.husb === id || f.wife === id) out.push(line(1, 'FAMS', `@${f.id}@`));
    for (const f of fams) if (f.children.includes(id)) out.push(line(1, 'FAMC', `@${f.id}@`));
    for (const e of p.extra) writeNode(e, 1, out);
  }

  for (const f of fams) {
    out.push(line(0, 'FAM', '', f.id));
    if (f.husb) out.push(line(1, 'HUSB', `@${f.husb}@`));
    if (f.wife) out.push(line(1, 'WIFE', `@${f.wife}@`));
    for (const c of f.children) out.push(line(1, 'CHIL', `@${c}@`));
    if (f.marrDate.trim() || f.marrPlace.trim()) {
      out.push(line(1, 'MARR'));
      if (f.marrDate.trim()) out.push(line(2, 'DATE', f.marrDate.trim()));
      if (f.marrPlace.trim()) out.push(line(2, 'PLAC', f.marrPlace.trim()));
    }
    if (f.current !== undefined) out.push(line(1, '_CURRENT', f.current ? 'Y' : 'N'));
    for (const e of f.extra) writeNode(e, 1, out);
  }

  out.push(line(0, 'SUBM', '', 'U1'));
  out.push(line(1, 'NAME', data.submitterName || 'Family Tree user'));
  out.push('0 TRLR');
  return out.join('\n') + '\n';
}
