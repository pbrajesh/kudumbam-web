import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DEFAULT_SETTINGS, Family, Person, Sex, SurnameRule, TreeData, TreeSettings, displayName, emptyPerson,
} from './models';
import { parseGedcom, serializeGedcom } from './gedcom';
import { ChangeSet, Role, TreeApi, TreeResponse, TreeSummary, Versions, messageOf, statusOf } from './tree-api.service';

/** Last tree this browser opened, and the person centred in each tree. Per-viewer conveniences only. */
const TREE_KEY = 'family-tree:tree:v1';
const focusKey = (treeId: string) => `family-tree:focus:${treeId}`;
const HISTORY_LIMIT = 60;

/** State of the tree on screen. not-found: no such tree, or the user is not (or no longer) a member. */
export type LoadState = 'idle' | 'loading' | 'ready' | 'not-found' | 'error';

function readStore(key: string): string {
  try { return localStorage.getItem(key) ?? ''; } catch { return ''; }
}
function writeStore(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* unavailable */ }
}

/** The records one edit touched, by ID. The objects themselves are read from the edit's result. */
interface Edit {
  upsertPeople: string[];
  deletePeople: string[];
  upsertFamilies: string[];
  deleteFamilies: string[];
}

/**
 * Single source of truth for the tree, shared through the API server. Edits apply locally at once,
 * then go to the server one at a time, in order. A failed save is rolled back; if the server says someone
 * else changed the same records (409), the latest tree is loaded instead.
 */
@Injectable({ providedIn: 'root' })
export class FamilyStore {
  private readonly api = inject(TreeApi);

  readonly data = signal<TreeData>(emptyTree());
  readonly focusId = signal<string>('');
  readonly selectedId = signal<string | null>(null);
  readonly ancestorDepth = signal(3);
  readonly descendantDepth = signal(3);
  readonly fileName = signal('');
  readonly settings = signal<TreeSettings>(DEFAULT_SETTINGS);
  /** Every tree the signed-in user belongs to, and the one on screen. */
  readonly trees = signal<TreeSummary[]>([]);
  readonly treeId = signal<string | null>(null);
  readonly treeName = computed(() => this.trees().find(t => t.id === this.treeId())?.name ?? '');
  /** Loading state of the tree list (the My trees page). */
  readonly treesStatus = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  /** The tree this browser opened last, to mark it on the My trees page. */
  readonly lastTreeId = signal(readStore(TREE_KEY));

  readonly status = signal<LoadState>('idle');
  readonly statusMessage = signal('');
  readonly role = signal<Role | null>(null);
  readonly canEdit = computed(() => this.role() === 'editor' || this.role() === 'owner');
  /** True while edits are on their way to the server. */
  readonly saving = signal(false);
  /** Latest save or load problem, for the app to show. */
  readonly notice = signal<{ text: string; error: boolean } | null>(null);

  private past: TreeData[] = [];
  private future: TreeData[] = [];
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);

  /** Record versions as the server last confirmed them. */
  private versions: Versions = { people: {}, families: {} };
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  /** Bumped when the tree is reloaded, so edits queued against the old copy are dropped. */
  private generation = 0;

  readonly people = computed(() => {
    const d = this.data();
    return d.order.map(id => d.people[id]).filter(Boolean);
  });
  readonly selected = computed(() => {
    const id = this.selectedId();
    return id ? this.data().people[id] ?? null : null;
  });
  readonly focus = computed(() => this.data().people[this.focusId()] ?? null);

  /* ---------- loading ---------- */

  /** The signed-in user's trees. Also links invitations sent to their email (server side). */
  async loadTrees(): Promise<boolean> {
    // Keep a list that is already on screen while it refreshes.
    if (!this.trees().length) this.treesStatus.set('loading');
    try {
      this.trees.set((await this.api.getMe()).trees);
      this.treesStatus.set('ready');
      return true;
    } catch (e) {
      this.statusMessage.set(messageOf(e));
      this.treesStatus.set('error');
      return false;
    }
  }

  /** Show a tree (the one in the URL). Does nothing if it is already on screen. */
  async openTree(id: string): Promise<void> {
    if (id === this.treeId() && (this.status() === 'ready' || this.status() === 'loading')) return;
    this.showTree(id);
    await this.load();
  }

  /**
   * Reload the tree on screen and the tree list, discarding local history and any queued edits.
   * `quiet` keeps the current tree on screen while it loads (for refreshes).
   */
  async load(quiet = false): Promise<boolean> {
    const id = this.treeId();
    if (!id) return false;
    this.generation++;
    if (!quiet) this.status.set('loading');
    try {
      const [tree] = await Promise.all([this.api.getTree(id), this.loadTrees()]);
      if (id !== this.treeId()) return false; // another tree was opened meanwhile
      this.applyServerTree(tree);
      this.status.set('ready');
      writeStore(TREE_KEY, id);
      this.lastTreeId.set(id);
      return true;
    } catch (e) {
      if (id !== this.treeId()) return false;
      if (statusOf(e) === 404) {
        // Deleted, or this user was removed from it (or never in it).
        if (readStore(TREE_KEY) === id) writeStore(TREE_KEY, null);
        this.status.set('not-found');
        return false;
      }
      if (quiet && this.status() === 'ready') {
        this.notice.set({ text: `Could not load the latest tree: ${messageOf(e)}`, error: true });
        return false;
      }
      this.statusMessage.set(messageOf(e));
      this.status.set('error');
      return false;
    }
  }

  /** Start a new tree (anyone signed in). Returns its ID for the app to open. Throws with a message to show. */
  async createTree(name: string, surnameRule: SurnameRule): Promise<string> {
    try {
      const t = await this.api.createTree(name, surnameRule);
      await this.loadTrees();
      return t.id;
    } catch (e) {
      throw new Error(messageOf(e));
    }
  }

  /** Rename the tree on screen (owners). */
  async renameTree(name: string): Promise<boolean> {
    const id = this.treeId();
    if (!id || this.role() !== 'owner') return false;
    try {
      const info = await this.api.updateTree(id, { name });
      this.trees.update(list => list.map(t => t.id === id ? { ...t, name: info.name } : t));
      return true;
    } catch (e) {
      this.notice.set({ text: `Not renamed: ${messageOf(e)}`, error: true });
      return false;
    }
  }

  /** Delete the tree on screen and everything in it (owners; `confirm` is its exact name). */
  async deleteTree(confirm: string): Promise<void> {
    const id = this.treeId();
    if (!id) return;
    try {
      await this.api.deleteTree(id, confirm);
    } catch (e) {
      throw new Error(messageOf(e));
    }
    await this.closeTree(id);
  }

  /** Leave the tree on screen (not allowed for its last owner). */
  async leaveTree(): Promise<void> {
    const id = this.treeId();
    if (!id) return;
    try {
      await this.api.leaveTree(id);
    } catch (e) {
      throw new Error(messageOf(e));
    }
    await this.closeTree(id);
  }

  /** After deleting or leaving: forget the tree here and refresh the list. */
  private async closeTree(id: string) {
    if (readStore(TREE_KEY) === id) writeStore(TREE_KEY, null);
    writeStore(focusKey(id), null);
    this.showTree(null);
    this.status.set('idle');
    await this.loadTrees();
  }

  /** Point the store at a tree (or none) with a clean slate. */
  private showTree(id: string | null) {
    this.generation++;
    this.treeId.set(id);
    this.data.set(emptyTree());
    this.versions = { people: {}, families: {} };
    this.role.set(null);
    this.settings.set(DEFAULT_SETTINGS);
    this.fileName.set('');
    this.focusId.set('');
    this.selectedId.set(null);
    this.past = [];
    this.future = [];
    this.syncHistory();
  }

  /** Forget everything (on sign-out). */
  clear() {
    this.showTree(null);
    this.trees.set([]);
    this.status.set('idle');
    this.treesStatus.set('idle');
  }

  private applyServerTree(r: TreeResponse) {
    this.data.set(r.data);
    this.versions = r.versions;
    this.fileName.set(r.fileName);
    this.settings.set(r.settings);
    this.role.set(r.role);
    this.past = [];
    this.future = [];
    this.syncHistory();
    const saved = readStore(focusKey(this.treeId() ?? ''));
    // Keep the current view on a refresh; otherwise this viewer's last person, then the tree's home person.
    const focus = [this.focusId(), saved, r.settings.homePersonId].find(id => id && r.data.people[id])
      ?? r.data.order[0] ?? '';
    this.focusId.set(focus);
    const sel = this.selectedId();
    if (sel && !r.data.people[sel]) this.selectedId.set(null);
  }

  /* ---------- relationships ---------- */

  familiesAsSpouse(id: string, d = this.data()): Family[] {
    return Object.values(d.families).filter(f => f.husb === id || f.wife === id);
  }
  familyAsChild(id: string, d = this.data()): Family | undefined {
    return Object.values(d.families).find(f => f.children.includes(id));
  }
  spouseIn(f: Family, id: string): string | undefined {
    return f.husb === id ? f.wife : f.husb;
  }
  parentsOf(id: string, d = this.data()): { father?: Person; mother?: Person } {
    const f = this.familyAsChild(id, d);
    return { father: f?.husb ? d.people[f.husb] : undefined, mother: f?.wife ? d.people[f.wife] : undefined };
  }
  siblingsOf(id: string, d = this.data()): Person[] {
    const f = this.familyAsChild(id, d);
    return f ? f.children.filter(c => c !== id).map(c => d.people[c]) : [];
  }
  nameOf(id: string | undefined): string {
    return displayName(id ? this.data().people[id] : undefined);
  }

  /* ---------- navigation ---------- */

  setFocus(id: string) {
    if (!this.data().people[id]) return;
    this.focusId.set(id);
    const tree = this.treeId();
    if (tree) writeStore(focusKey(tree), id);
  }
  select(id: string | null) { this.selectedId.set(id); }

  /* ---------- editing ---------- */

  private mutate(fn: (d: TreeData) => void) {
    if (!this.canEdit()) return;
    const before = this.data();
    const next = structuredClone(before);
    fn(next);
    const edit = diff(before, next);
    if (!edit) return;
    const [past, future] = [[...this.past], [...this.future]];
    this.past.push(before);
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
    this.data.set(next);
    this.syncHistory();
    this.send(edit, next, () => this.restore(before, past, future));
  }

  /** Undo is saved to the server as an ordinary edit back to the earlier state. */
  undo() {
    const prev = this.past.at(-1);
    if (!prev || !this.canEdit()) return;
    const [past, future, current] = [[...this.past], [...this.future], this.data()];
    this.past.pop();
    this.future.push(current);
    this.applySnapshot(prev, current, past, future);
  }
  redo() {
    const next = this.future.at(-1);
    if (!next || !this.canEdit()) return;
    const [past, future, current] = [[...this.past], [...this.future], this.data()];
    this.future.pop();
    this.past.push(current);
    this.applySnapshot(next, current, past, future);
  }
  private applySnapshot(d: TreeData, current: TreeData, past: TreeData[], future: TreeData[]) {
    this.restore(d, this.past, this.future);
    const edit = diff(current, d);
    if (edit) this.send(edit, d, () => this.restore(current, past, future));
  }
  /** Show a given tree and history, keeping focus and selection on people who still exist. */
  private restore(d: TreeData, past: TreeData[], future: TreeData[]) {
    this.data.set(d);
    this.past = past;
    this.future = future;
    if (!d.people[this.focusId()]) this.focusId.set(d.order[0] ?? '');
    const sel = this.selectedId();
    if (sel && !d.people[sel]) this.selectedId.set(null);
    this.syncHistory();
  }
  private syncHistory() {
    this.canUndo.set(this.past.length > 0);
    this.canRedo.set(this.future.length > 0);
  }

  /** Queue a job so saves reach the server one at a time, in the order they were made. */
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    this.pending++;
    this.saving.set(true);
    const run = this.queue.then(job);
    this.queue = run.then(() => {}, () => {}).finally(() => {
      this.pending--;
      this.saving.set(this.pending > 0);
    });
    return run;
  }

  private send(edit: Edit, result: TreeData, rollback: () => void) {
    const gen = this.generation;
    const treeId = this.treeId();
    void this.enqueue(async () => {
      if (gen !== this.generation || !treeId) return; // the tree was reloaded; this edit was made on the old copy
      try {
        const r = await this.api.sendChanges(treeId, this.changeSet(edit, result));
        for (const id of edit.deletePeople) delete this.versions.people[id];
        for (const id of edit.deleteFamilies) delete this.versions.families[id];
        Object.assign(this.versions.people, r.versions.people);
        Object.assign(this.versions.families, r.versions.families);
      } catch (e) {
        const msg = messageOf(e);
        if (statusOf(e) === 409 || this.pending > 1) {
          // The server copy moved on, or later edits were built on this one: start again from the server.
          const text = statusOf(e) === 409
            ? 'Someone else changed the same people at the same time. Their version is now shown; please make your change again.'
            : `Not saved: ${msg} The latest tree is now shown; please make your recent changes again.`;
          if (await this.load(true)) this.notice.set({ text, error: true });
        } else {
          rollback();
          this.notice.set({ text: `Not saved: ${msg}`, error: true });
        }
      }
    });
  }

  /** Build the request at send time, so it carries the versions confirmed by earlier saves. */
  private changeSet(e: Edit, d: TreeData): ChangeSet {
    return {
      upsertPeople: e.upsertPeople.map(id => ({ ...d.people[id], version: this.versions.people[id] ?? null })),
      deletePeople: e.deletePeople.map(id => ({ id, version: this.versions.people[id] })),
      upsertFamilies: e.upsertFamilies.map(id => ({ ...d.families[id], version: this.versions.families[id] ?? null })),
      deleteFamilies: e.deleteFamilies.map(id => ({ id, version: this.versions.families[id] })),
    };
  }

  private nextId(d: TreeData, prefix: 'I' | 'F'): string {
    const keys = Object.keys(prefix === 'I' ? d.people : d.families);
    let max = 0;
    for (const k of keys) {
      const n = Number(k.replace(/^\D+/, ''));
      if (Number.isFinite(n) && n > max) max = n;
    }
    return `${prefix}${max + 1}`;
  }
  private newPerson(d: TreeData, sex: Sex, given: string, surname = ''): Person {
    const p = emptyPerson(this.nextId(d, 'I'), sex);
    p.given = given;
    p.surname = surname;
    d.people[p.id] = p;
    d.order.push(p.id);
    return p;
  }
  private newFamily(d: TreeData): Family {
    const f: Family = { id: this.nextId(d, 'F'), children: [], marrDate: '', marrPlace: '', current: true, extra: [] };
    d.families[f.id] = f;
    return f;
  }

  updatePerson(id: string, patch: Partial<Person>) {
    this.mutate(d => { Object.assign(d.people[id], patch, { id }); });
  }

  addParent(childId: string, sex: 'M' | 'F'): string {
    let created = '';
    this.mutate(d => {
      let f = this.familyAsChild(childId, d);
      if (!f) { f = this.newFamily(d); f.children.push(childId); }
      if ((sex === 'M' && f.husb) || (sex === 'F' && f.wife)) { created = (sex === 'M' ? f.husb : f.wife)!; return; }
      const child = d.people[childId];
      // Work the father's name back from the child's surname, following this tree's naming rule.
      const rule = this.settings().surnameRule;
      const given = sex === 'F' ? 'New mother'
        : rule === 'father-given' && child.surname ? child.surname : 'New father';
      const surname = sex === 'M' && rule === 'father-surname' ? child.surname : '';
      const p = this.newPerson(d, sex, given, surname);
      if (sex === 'M') f.husb = p.id; else f.wife = p.id;
      created = p.id;
    });
    if (created) this.selectedId.set(created);
    return created;
  }

  addSpouse(id: string): string {
    let created = '';
    this.mutate(d => {
      const me = d.people[id];
      const sex: Sex = me.sex === 'F' ? 'M' : 'F';
      const p = this.newPerson(d, sex, sex === 'M' ? 'New husband' : 'New wife');
      const f = this.newFamily(d);
      if (me.sex === 'F') { f.wife = id; f.husb = p.id; } else { f.husb = id; f.wife = p.id; }
      created = p.id;
    });
    if (created) this.selectedId.set(created);
    return created;
  }

  /** familyId: an existing family of the parent, or null for "partner unknown". */
  addChild(parentId: string, familyId: string | null, sex: 'M' | 'F'): string {
    let created = '';
    this.mutate(d => {
      const parent = d.people[parentId];
      let f = familyId ? d.families[familyId] : undefined;
      if (!f) {
        f = this.newFamily(d);
        if (parent.sex === 'F') f.wife = parentId; else f.husb = parentId;
      }
      const p = this.newPerson(d, sex, sex === 'M' ? 'New son' : 'New daughter', this.childSurname(f, d));
      f.children.push(p.id);
      created = p.id;
    });
    if (created) this.selectedId.set(created);
    return created;
  }

  /** A new child's surname under this tree's naming rule. */
  private childSurname(f: Family, d: TreeData): string {
    const father = f.husb ? d.people[f.husb] : undefined;
    switch (this.settings().surnameRule) {
      case 'father-given': return father?.given ?? '';
      case 'father-surname': return father?.surname ?? '';
      default: return '';
    }
  }

  /** Start an empty tree with one person, who becomes the home person. */
  addFirstPerson(): string {
    let created = '';
    this.mutate(d => { created = this.newPerson(d, 'U', 'New person').id; });
    if (!created) return '';
    this.setFocus(created);
    this.selectedId.set(created);
    void this.updateSettings({ homePersonId: created });
    return created;
  }

  /** Change this tree's settings (editors). Shows a notice if the server refuses. */
  async updateSettings(s: Partial<TreeSettings>): Promise<void> {
    const treeId = this.treeId();
    if (!this.canEdit() || !treeId) return;
    const gen = this.generation;
    try {
      // Queued behind pending edits, so a new home person exists on the server before it is chosen.
      const info = await this.enqueue(() => this.api.updateTree(treeId, s));
      if (gen === this.generation) this.settings.set(info.settings);
    } catch (e) {
      this.notice.set({ text: `Setting not saved: ${messageOf(e)}`, error: true });
    }
  }

  addSibling(id: string, sex: 'M' | 'F'): string {
    let created = '';
    this.mutate(d => {
      let f = this.familyAsChild(id, d);
      if (!f) { f = this.newFamily(d); f.children.push(id); }
      const p = this.newPerson(d, sex, sex === 'M' ? 'New brother' : 'New sister', d.people[id].surname);
      const at = f.children.indexOf(id);
      f.children.splice(at + 1, 0, p.id);
      created = p.id;
    });
    if (created) this.selectedId.set(created);
    return created;
  }

  /** Link two existing people as a couple. */
  linkSpouse(id: string, otherId: string) {
    if (id === otherId) return;
    this.mutate(d => {
      const exists = Object.values(d.families).some(f =>
        (f.husb === id && f.wife === otherId) || (f.wife === id && f.husb === otherId));
      if (exists) return;
      const f = this.newFamily(d);
      const a = d.people[id], b = d.people[otherId];
      if (a.sex === 'F' || b.sex === 'M') { f.wife = id; f.husb = otherId; } else { f.husb = id; f.wife = otherId; }
    });
  }

  /** Remove a person from one family link (as spouse or child). */
  unlink(id: string, familyId: string) {
    this.mutate(d => {
      const f = d.families[familyId];
      if (!f) return;
      if (f.husb === id) delete f.husb;
      if (f.wife === id) delete f.wife;
      f.children = f.children.filter(c => c !== id);
      this.pruneFamilies(d);
    });
  }

  setFamilyCurrent(familyId: string, current: boolean) {
    this.mutate(d => { const f = d.families[familyId]; if (f) f.current = current; });
  }
  setMarriageDate(familyId: string, date: string) {
    this.mutate(d => { const f = d.families[familyId]; if (f) f.marrDate = date; });
  }

  deletePerson(id: string) {
    this.mutate(d => {
      delete d.people[id];
      d.order = d.order.filter(x => x !== id);
      for (const f of Object.values(d.families)) {
        if (f.husb === id) delete f.husb;
        if (f.wife === id) delete f.wife;
        f.children = f.children.filter(c => c !== id);
      }
      this.pruneFamilies(d);
    });
    if (this.selectedId() === id) this.selectedId.set(null);
    if (this.focusId() === id) {
      const d = this.data();
      this.focusId.set(d.order[0] ?? '');
    }
  }

  private pruneFamilies(d: TreeData) {
    for (const f of Object.values(d.families)) {
      const members = (f.husb ? 1 : 0) + (f.wife ? 1 : 0) + f.children.length;
      if (members < 2) delete d.families[f.id];
    }
  }

  /* ---------- files ---------- */

  /** Replace the shared tree with a GEDCOM file. Undo puts the previous tree back. */
  async importGedcom(text: string, fileName: string): Promise<number> {
    if (!this.canEdit()) throw new Error('Only editors can import a file.');
    const d = parseGedcom(text);
    if (!d.order.length) throw new Error('No people (INDI records) were found in this file.');
    const gen = this.generation;
    const treeId = this.treeId();
    const r = await this.enqueue(async () => {
      if (gen !== this.generation || !treeId) throw new Error('The tree was reloaded. Please try the import again.');
      return this.api.importTree(treeId, {
        fileName, submitterName: d.submitterName,
        people: d.order.map(id => d.people[id]), families: Object.values(d.families),
      });
    }).catch(e => { throw new Error(messageOf(e)); });
    const previous = this.data();
    this.applyServerTree(r);
    this.past = previous.order.length ? [previous] : [];
    this.syncHistory();
    this.selectedId.set(null);
    this.setFocus(r.data.order[0]);
    return r.data.order.length;
  }

  exportGedcom(): string {
    return serializeGedcom(this.data());
  }
}

function emptyTree(): TreeData {
  return { people: {}, families: {}, order: [], submitterName: '' };
}

/** What changed between two versions of the tree, or null if nothing did. */
function diff(a: TreeData, b: TreeData): Edit | null {
  const changed = <T>(x: Record<string, T>, y: Record<string, T>) =>
    Object.keys(y).filter(id => !x[id] || JSON.stringify(x[id]) !== JSON.stringify(y[id]));
  const removed = <T>(x: Record<string, T>, y: Record<string, T>) => Object.keys(x).filter(id => !y[id]);
  const e: Edit = {
    upsertPeople: changed(a.people, b.people),
    deletePeople: removed(a.people, b.people),
    upsertFamilies: changed(a.families, b.families),
    deleteFamilies: removed(a.families, b.families),
  };
  return Object.values(e).some(list => list.length) ? e : null;
}
