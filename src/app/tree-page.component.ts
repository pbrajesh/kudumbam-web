import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { environment } from '../environments/environment';
import { AuthService } from './auth.service';
import { FamilyStore } from './family-store.service';
import { CreateTreeComponent, SURNAME_RULES } from './create-tree.component';
import { MembersComponent } from './members.component';
import { TreeViewComponent } from './tree-view.component';
import { PersonEditorComponent } from './person-editor.component';
import { displayName, lifeSpan, Person } from './models';
import { readFileAsText, saveTextFile } from './file-io';

/** /t/:treeId — one family tree: people list, D3 tree, editor, and the tree's dialogs. */
@Component({
  selector: 'app-tree-page',
  imports: [RouterLink, TreeViewComponent, PersonEditorComponent, CreateTreeComponent, MembersComponent],
  template: `
    @if (store.status() === 'not-found') {
      <main class="gate">
        <div class="gate-card">
          <h1>{{ appName }}</h1>
          <h2 class="gate-sub">This tree isn't available</h2>
          <p class="muted">It may have been deleted, or you are not a member of it. If someone invited you, check that
            you signed in with the email address they used (you are signed in as <strong>{{ auth.email() }}</strong>).</p>
          <a class="btn primary" routerLink="/">Go to my trees</a>
        </div>
      </main>
    } @else if (store.status() === 'error') {
      <main class="gate">
        <div class="gate-card">
          <h1>{{ appName }}</h1>
          <p class="gate-error" role="alert">Couldn't load the family tree. {{ store.statusMessage() }}</p>
          <div class="save-row">
            <button type="button" class="btn primary" (click)="store.load()">Try again</button>
            <a class="btn ghost" routerLink="/">My trees</a>
          </div>
        </div>
      </main>
    } @else if (store.status() !== 'ready') {
      <main class="gate"><p class="muted" role="status">Loading the family tree…</p></main>
    } @else {
    <header class="topbar">
      <div class="brand">
        <button type="button" class="icon-btn menu-btn" (click)="listOpen.set(!listOpen())"
                [attr.aria-expanded]="listOpen()" aria-controls="people-panel" aria-label="Show people list">☰</button>
        <div>
          <h1><a class="home-link" routerLink="/" title="All my trees">{{ appName }}</a></h1>
          <p class="file">
            <label class="sr-only" for="tree-picker">Family tree</label>
            <select id="tree-picker" class="tree-picker" (change)="pickTree($event)">
              @for (t of store.trees(); track t.id) {
                <option [value]="t.id" [selected]="t.id === store.treeId()">{{ t.name }}</option>
              }
              <option value="__all">All my trees…</option>
              <option value="__new">＋ Start a new tree…</option>
            </select>
            · {{ store.people().length }} people · {{ familyCount() }} families
            @if (!store.canEdit()) { <span class="edited">view only</span> }
            @else if (store.saving()) { <span class="edited" role="status">saving…</span> }
          </p>
        </div>
      </div>
      <nav class="actions" aria-label="File and history">
        @if (store.canEdit()) {
          <button type="button" class="btn ghost" (click)="store.undo()" [disabled]="!store.canUndo()" title="Undo">↶ Undo</button>
          <button type="button" class="btn ghost" (click)="store.redo()" [disabled]="!store.canRedo()" title="Redo">↷ Redo</button>
          <label class="btn" for="ged-import">Import .ged
            <input id="ged-import" type="file" accept=".ged,.GED,.txt,text/plain" (change)="importFile($event)" hidden />
          </label>
          <button type="button" class="btn ghost" (click)="openSettings()">Settings</button>
        }
        <button type="button" class="btn ghost" (click)="membersOpen.set(true)">Members
          @if (store.pendingClaims()) {
            <span class="count" [attr.aria-label]="store.pendingClaims() + ' waiting for approval'">{{ store.pendingClaims() }}</span>
          }
        </button>
        <button type="button" class="btn primary" (click)="openExport()" [disabled]="!store.people().length">Export .ged</button>
        <a class="btn ghost" routerLink="/help" title="How to use the family tree">Help</a>
        <button type="button" class="btn ghost" (click)="auth.signOut()">Sign out</button>
      </nav>
    </header>

    @if (message(); as m) {
      <div class="toast" [class.error]="m.error" role="status">{{ m.text }}
        <button type="button" class="icon-btn small" (click)="message.set(null)" aria-label="Dismiss">✕</button>
      </div>
    }

    <main class="layout" [class.with-editor]="!!store.selected()">
      <aside id="people-panel" class="people" [class.open]="listOpen()" aria-label="People">
        <label class="search" for="people-search">
          <span class="sr-only">Search people</span>
          <input id="people-search" type="search" placeholder="Search {{ store.people().length }} people…"
                 [value]="query()" (input)="query.set(value($event))" />
        </label>
        <ul class="people-list">
          @for (p of filtered(); track p.id) {
            <li>
              <button type="button" class="person-row" [class.focus]="p.id === store.focusId()"
                      [class.selected]="p.id === store.selectedId()" (click)="pick(p)">
                <span class="dot sex-{{ p.sex }}" aria-hidden="true"></span>
                <span class="pr-name">{{ name(p) }}@if (p.id === store.you().personId) { <span class="pr-you">you</span> }</span>
                <span class="pr-meta">{{ span(p) || '@' + p.id + '@' }}</span>
              </button>
            </li>
          } @empty {
            @if (store.people().length) { <li class="muted pad">No one matches “{{ query() }}”.</li> }
          }
        </ul>
        <div class="people-foot">
          <span class="muted signed-in">{{ auth.email() }}</span>
          <button type="button" class="btn small ghost" (click)="refresh()">Reload latest</button>
        </div>
      </aside>

      <section class="canvas" aria-label="Tree">
        <div class="canvas-bar">
          <div class="focus-label">
            <span class="eyebrow">Centred on</span>
            <strong>{{ name(store.focus()) }}@if (store.focusId() && store.focusId() === store.you().personId) { <span class="muted"> (you)</span> }</strong>
          </div>
          @if (store.me()) {
            <button type="button" class="btn small" (click)="store.findMe()" [disabled]="store.focusId() === store.you().personId">Find me</button>
          }
          <label for="anc-depth">Ancestors
            <select id="anc-depth" [value]="store.ancestorDepth()" (change)="store.ancestorDepth.set(num($event))">
              @for (n of depths; track n) { <option [value]="n" [selected]="n === store.ancestorDepth()">{{ n }}</option> }
            </select>
          </label>
          <label for="desc-depth">Descendants
            <select id="desc-depth" [value]="store.descendantDepth()" (change)="store.descendantDepth.set(num($event))">
              @for (n of depths; track n) { <option [value]="n" [selected]="n === store.descendantDepth()">{{ n }}</option> }
            </select>
          </label>
          @if (store.people().length && !store.me() && !hideYouHint()) {
            <p class="you-hint" role="status">
              @if (store.claimed(); as c) {
                You said you are <strong>{{ name(c) }}</strong>. An owner of this tree still has to confirm it.
              } @else {
                You're not linked to anyone in this tree yet. Find yourself in the list, open your card and choose
                <strong>This is me</strong>{{ store.role() === 'owner' ? '' : ' — an owner will confirm it' }}.
              }
              <button type="button" class="icon-btn small" (click)="hideYouHint.set(true)" aria-label="Hide this message">✕</button>
            </p>
          }
        </div>
        @if (store.people().length) {
          <app-tree-view />
        } @else {
          <div class="empty">
            <h2>This tree is empty</h2>
            @if (store.canEdit()) {
              <p class="muted">Start with one person and add relatives from there, or import a GEDCOM (.ged) file
                exported from another family tree app.</p>
              <div class="save-row">
                <button type="button" class="btn primary" (click)="store.addFirstPerson()">Add the first person</button>
                <label class="btn" for="ged-import-empty">Import a .ged file
                  <input id="ged-import-empty" type="file" accept=".ged,.GED,.txt,text/plain" (change)="importFile($event)" hidden />
                </label>
              </div>
            } @else {
              <p class="muted">An editor has not added anyone yet.</p>
            }
          </div>
        }
        <p class="legend">
          <span><i class="lg sex-M"></i>Male</span><span><i class="lg sex-F"></i>Female</span>
          <span><i class="lg dec"></i>Deceased</span><span><b>+</b> more relatives</span>
          <span class="hint-text">Click {{ store.canEdit() ? 'to edit' : 'for details' }} · double-click to centre · drag to pan</span>
        </p>
      </section>

      @if (store.selected()) {
        <aside class="editor" [attr.aria-label]="store.canEdit() ? 'Edit person' : 'Person details'">
          <app-person-editor />
        </aside>
      }
    </main>

    @if (settingsOpen()) {
      <div class="modal-backdrop" (click)="settingsOpen.set(false)">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" (click)="$event.stopPropagation()">
          <header class="modal-head">
            <h2 id="settings-title">Tree settings</h2>
            <button type="button" class="icon-btn" (click)="settingsOpen.set(false)" aria-label="Close">✕</button>
          </header>
          @if (store.role() === 'owner') {
            <form class="rename" (submit)="rename($event)">
              <label for="tree-name">Tree name
                <input id="tree-name" maxlength="200" [value]="nameDraft()" (input)="nameDraft.set(value($event))" />
              </label>
              <button type="submit" class="btn" [disabled]="!nameDraft().trim() || nameDraft().trim() === store.treeName()">Rename</button>
            </form>
          }
          <fieldset class="rule-list">
            <legend>Surname for new children</legend>
            @for (r of surnameRules; track r.v) {
              <label class="rule" [for]="'rule-' + r.v">
                <input type="radio" name="surname-rule" [id]="'rule-' + r.v" [checked]="store.settings().surnameRule === r.v"
                       (change)="store.updateSettings({ surnameRule: r.v })" />
                <span><strong>{{ r.label }}</strong><span class="muted">{{ r.example }}</span></span>
              </label>
            }
          </fieldset>
          <p class="muted">Home person: <strong>{{ homeName() }}</strong>. The tree opens on them for anyone visiting for the
            first time. Change it from a person's panel.</p>
          @if (store.role() === 'owner') {
            <section class="danger">
              <h3>Delete this tree</h3>
              <p class="muted">Removes everyone in it and every link, for all members. This cannot be undone —
                export a .ged file first if you might want it back.</p>
              <form class="rename" (submit)="removeTree($event)">
                <label for="delete-confirm">Type <strong>{{ store.treeName() }}</strong> to confirm
                  <input id="delete-confirm" autocomplete="off" [value]="deleteDraft()" (input)="deleteDraft.set(value($event))" />
                </label>
                <button type="submit" class="btn danger-btn" [disabled]="deleteDraft().trim() !== store.treeName() || deleting()">Delete tree</button>
              </form>
            </section>
          }
        </div>
      </div>
    }

    @if (membersOpen()) {
      <div class="modal-backdrop" (click)="membersOpen.set(false)">
        <div class="modal narrow" role="dialog" aria-modal="true" aria-labelledby="members-title" (click)="$event.stopPropagation()">
          <header class="modal-head">
            <h2 id="members-title">Members of “{{ store.treeName() }}”</h2>
            <button type="button" class="icon-btn" (click)="membersOpen.set(false)" aria-label="Close">✕</button>
          </header>
          <app-members />
        </div>
      </div>
    }

    @if (createOpen()) {
      <div class="modal-backdrop" (click)="createOpen.set(false)">
        <div class="modal narrow" role="dialog" aria-modal="true" aria-labelledby="create-title" (click)="$event.stopPropagation()">
          <header class="modal-head">
            <h2 id="create-title">Start a new tree</h2>
            <button type="button" class="icon-btn" (click)="createOpen.set(false)" aria-label="Close">✕</button>
          </header>
          <p class="muted">You will be its owner. Only people you invite will be able to see it.</p>
          <app-create-tree />
        </div>
      </div>
    }

    @if (exportOpen()) {
      <div class="modal-backdrop" (click)="exportOpen.set(false)">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="export-title" (click)="$event.stopPropagation()">
          <header class="modal-head">
            <h2 id="export-title">Export GEDCOM 5.5.1</h2>
            <button type="button" class="icon-btn" (click)="exportOpen.set(false)" aria-label="Close">✕</button>
          </header>
          <p class="muted">{{ store.people().length }} people and {{ familyCount() }} families, UTF-8. Opens in Family Echo, Gramps, Ancestry and most genealogy apps.</p>
          <label for="export-name">File name
            <input id="export-name" [value]="exportName()" (input)="exportName.set(value($event))" />
          </label>
          <textarea id="export-text" class="ged-text" readonly [value]="exportText()" rows="14" spellcheck="false"></textarea>
          <div class="save-row">
            <button type="button" class="btn primary" (click)="download()">Download</button>
            <button type="button" class="btn" (click)="copy()">{{ copied() ? 'Copied' : 'Copy text' }}</button>
          </div>
        </div>
      </div>
    }
    }
  `,
})
export class TreePageComponent {
  readonly auth = inject(AuthService);
  readonly store = inject(FamilyStore);
  private readonly router = inject(Router);
  readonly query = signal('');
  readonly listOpen = signal(false);
  readonly exportOpen = signal(false);
  readonly exportText = signal('');
  readonly exportName = signal('family-tree.ged');
  readonly copied = signal(false);
  readonly message = signal<{ text: string; error?: boolean } | null>(null);
  readonly depths = [0, 1, 2, 3, 4, 5, 6, 8];
  readonly settingsOpen = signal(false);
  readonly appName = environment.appName;
  readonly surnameRules = SURNAME_RULES;
  readonly createOpen = signal(false);
  readonly membersOpen = signal(false);
  /** The "you're not linked yet" hint, hidden until the next tree is opened. */
  readonly hideYouHint = signal(false);
  readonly nameDraft = signal('');
  readonly deleteDraft = signal('');
  readonly deleting = signal(false);
  readonly homeName = computed(() => {
    const id = this.store.settings().homePersonId;
    return id && this.store.data().people[id] ? displayName(this.store.data().people[id]) : 'not set (first person)';
  });

  readonly familyCount = computed(() => Object.keys(this.store.data().families).length);
  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const list = [...this.store.people()].sort((a, b) => displayName(a).localeCompare(displayName(b)));
    if (!q) return list;
    return list.filter(p => `${displayName(p)} ${p.id} ${p.birthDate}`.toLowerCase().includes(q));
  });

  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // The tree comes from the URL, so links to /t/<id> can be shared and bookmarked.
    inject(ActivatedRoute).paramMap.pipe(takeUntilDestroyed()).subscribe(p => {
      this.closeDialogs();
      this.hideYouHint.set(false);
      void this.store.openTree(p.get('treeId') ?? '');
    });
    const title = inject(Title);
    effect(() => {
      const name = this.store.treeName();
      title.setTitle(name ? `${name} · ${environment.appName}` : environment.appName);
    });
    effect(() => {
      const n = this.store.notice();
      if (n) untracked(() => { this.toast(n.text, n.error); this.store.notice.set(null); });
    });
    // Leaving or deleting the tree (from Members or Settings) closes it: go back to the tree list.
    effect(() => {
      if (this.store.treeId() === null) untracked(() => void this.router.navigateByUrl('/'));
    });
  }

  name(p: Person | null) { return p ? displayName(p) : '—'; }
  span(p: Person) { return lifeSpan(p); }
  value(ev: Event) { return (ev.target as HTMLInputElement).value; }
  num(ev: Event) { return Number((ev.target as HTMLSelectElement).value); }

  private closeDialogs() {
    this.createOpen.set(false);
    this.settingsOpen.set(false);
    this.membersOpen.set(false);
    this.exportOpen.set(false);
    this.query.set('');
  }

  pick(p: Person) {
    this.store.setFocus(p.id);
    this.store.select(p.id);
    this.listOpen.set(false);
  }

  async importFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const n = await this.store.importGedcom(text, file.name);
      this.toast(`Imported ${n} people from ${file.name} for everyone. Undo restores the previous tree.`);
    } catch (e) {
      this.toast(`Couldn't import ${file.name}: ${(e as Error).message}`, true);
    }
  }

  pickTree(ev: Event) {
    const sel = ev.target as HTMLSelectElement;
    const choice = sel.value;
    sel.value = this.store.treeId() ?? '';
    if (choice === '__new') this.createOpen.set(true);
    else if (choice === '__all') void this.router.navigateByUrl('/');
    else void this.router.navigate(['/t', choice]);
  }

  openSettings() {
    this.nameDraft.set(this.store.treeName());
    this.deleteDraft.set('');
    this.settingsOpen.set(true);
  }

  async rename(ev: Event) {
    ev.preventDefault();
    if (await this.store.renameTree(this.nameDraft().trim())) this.toast('Tree renamed.');
  }

  async removeTree(ev: Event) {
    ev.preventDefault();
    this.deleting.set(true);
    try {
      await this.store.deleteTree(this.deleteDraft());
    } catch (e) {
      this.toast(`Not deleted: ${(e as Error).message}`, true);
    } finally {
      this.deleting.set(false);
    }
  }

  async refresh() {
    if (await this.store.load(true)) this.toast('Showing the latest tree.');
  }

  openExport() {
    const base = (this.store.fileName() || this.store.treeName() || 'family-tree').replace(/\.(ged|txt)$/i, '');
    this.exportName.set(`${base}-edited.ged`);
    this.exportText.set(this.store.exportGedcom());
    this.copied.set(false);
    this.exportOpen.set(true);
  }

  async download() {
    let name = this.exportName().trim() || 'family-tree.ged';
    if (!/\.ged$/i.test(name)) name += '.ged';
    const r = await saveTextFile(name, this.exportText());
    if (r.outcome === 'saved') {
      this.toast(r.filename.endsWith('.txt')
        ? `Saved ${r.filename}. Rename it to end in .ged before importing elsewhere.`
        : `Saved ${r.filename}.`);
    } else if (r.outcome === 'failed') {
      this.toast('Download is not available here. Use “Copy text” and paste it into a file ending in .ged.', true);
    }
  }

  async copy() {
    try {
      await navigator.clipboard.writeText(this.exportText());
      this.copied.set(true);
    } catch {
      const ta = document.getElementById('export-text') as HTMLTextAreaElement | null;
      ta?.focus();
      ta?.select();
      this.toast('Text selected. Press Ctrl+C (⌘C on Mac) to copy.');
    }
  }

  private toast(text: string, error = false) {
    this.message.set({ text, error });
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.message.set(null), 6000);
  }
}
