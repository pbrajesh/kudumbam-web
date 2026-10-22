/** A raw GEDCOM line with its sub-lines. Used to keep tags this app does not edit. */
export interface GedNode {
  level: number;
  xref?: string;
  tag: string;
  value: string;
  children: GedNode[];
}

export type Sex = 'M' | 'F' | 'U';

export interface Person {
  id: string;            // GEDCOM xref without @, e.g. "I3"
  given: string;
  surname: string;
  marriedName: string;
  sex: Sex;
  birthDate: string;
  birthPlace: string;
  deceased: boolean;
  deathDate: string;
  deathPlace: string;
  notes: string;
  /** Sub-records we do not edit, written back unchanged on export. */
  extra: GedNode[];
}

export interface Family {
  id: string;            // e.g. "F1"
  husb?: string;
  wife?: string;
  children: string[];
  marrDate: string;
  marrPlace: string;
  /** Family Echo's _CURRENT flag (current vs. former partnership). */
  current?: boolean;
  extra: GedNode[];
}

export interface TreeData {
  people: Record<string, Person>;
  families: Record<string, Family>;
  /** Display order of people as read from the file. */
  order: string[];
  submitterName: string;
}

/**
 * How a new child's surname is filled in:
 * father-given — the father's given name (common in South India: Ravi /Kumar/ → Priya /Ravi/),
 * father-surname — the father's surname, none — left blank.
 */
export type SurnameRule = 'father-given' | 'father-surname' | 'none';

/** Per-tree settings, stored on the server. */
export interface TreeSettings {
  /** Who the tree opens on. Null: the first person. */
  homePersonId: string | null;
  surnameRule: SurnameRule;
}

export const DEFAULT_SETTINGS: TreeSettings = { homePersonId: null, surnameRule: 'father-surname' };

export function displayName(p: Person | undefined): string {
  if (!p) return 'Unknown';
  const n = [p.given, p.surname].filter(Boolean).join(' ').trim();
  return n || 'Unnamed';
}

export function yearOf(date: string): string {
  const m = /(\d{3,4})\s*$/.exec(date.trim());
  return m ? m[1] : '';
}

export function lifeSpan(p: Person): string {
  const b = yearOf(p.birthDate);
  const d = yearOf(p.deathDate);
  if (b && d) return `${b} – ${d}`;
  if (b && p.deceased) return `${b} – †`;
  if (b) return `b. ${b}`;
  if (d) return `d. ${d}`;
  if (p.deceased) return 'Deceased';
  return '';
}

export function emptyPerson(id: string, sex: Sex = 'U'): Person {
  return {
    id, given: '', surname: '', marriedName: '', sex,
    birthDate: '', birthPlace: '', deceased: false, deathDate: '', deathPlace: '',
    notes: '', extra: [],
  };
}
