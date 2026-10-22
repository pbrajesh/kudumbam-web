import { Component, computed, inject, linkedSignal } from '@angular/core';
import { FamilyStore } from './family-store.service';
import { Person, Sex, displayName, lifeSpan } from './models';

type TextField = 'given' | 'surname' | 'marriedName' | 'birthDate' | 'birthPlace' | 'deathDate' | 'deathPlace' | 'notes';

@Component({
  selector: 'app-person-editor',
  template: `
    @if (person(); as p) {
      <header class="ed-head">
        <div class="ed-title">
          <span class="ed-id">&#64;{{ p.id }}&#64;</span>
          <h2>{{ name(p) }}</h2>
          @if (span(p)) { <p class="ed-span">{{ span(p) }}</p> }
          @if (!store.canEdit()) { <p class="ed-span">View only</p> }
        </div>
        <button type="button" class="icon-btn" (click)="close()" aria-label="Close editor">✕</button>
      </header>

      <div class="ed-actions">
        <button type="button" class="btn" (click)="store.setFocus(p.id)" [disabled]="store.focusId() === p.id">
          {{ store.focusId() === p.id ? 'Tree is centred here' : 'Centre tree here' }}
        </button>
        @if (store.settings().homePersonId === p.id) {
          <span class="tag">Home person</span>
        } @else if (store.canEdit()) {
          <button type="button" class="btn ghost" (click)="store.updateSettings({ homePersonId: p.id })"
                  title="The tree opens on this person for first-time visitors">Make home person</button>
        }
      </div>

      <form class="ed-form" (submit)="save($event)">
        <fieldset class="ed-fields" [disabled]="!store.canEdit()">
        <div class="row2">
          <label for="ed-given">Given name
            <input id="ed-given" maxlength="500" [value]="draft().given" (input)="setText('given', $event)" autocomplete="off" />
          </label>
          <label for="ed-surname">Surname / initial
            <input id="ed-surname" maxlength="500" [value]="draft().surname" (input)="setText('surname', $event)" autocomplete="off" />
          </label>
        </div>

        <fieldset class="sex">
          <legend>Sex</legend>
          @for (s of sexes; track s.v) {
            <label class="chip" [class.on]="draft().sex === s.v">
              <input type="radio" name="ed-sex" [id]="'ed-sex-' + s.v" [checked]="draft().sex === s.v" (change)="setSex(s.v)" />
              {{ s.label }}
            </label>
          }
        </fieldset>

        <div class="row2">
          <label for="ed-bdate">Birth date
            <input id="ed-bdate" maxlength="500" [value]="draft().birthDate" (input)="setText('birthDate', $event)" [placeholder]="store.canEdit() ? '1 JAN 1950' : ''" />
          </label>
          <label for="ed-bplace">Birth place
            <input id="ed-bplace" maxlength="500" [value]="draft().birthPlace" (input)="setText('birthPlace', $event)" />
          </label>
        </div>

        <label class="check" for="ed-deceased">
          <input id="ed-deceased" type="checkbox" [checked]="draft().deceased" (change)="setDeceased($event)" />
          Deceased
        </label>
        @if (draft().deceased) {
          <div class="row2">
            <label for="ed-ddate">Death date
              <input id="ed-ddate" maxlength="500" [value]="draft().deathDate" (input)="setText('deathDate', $event)" [placeholder]="store.canEdit() ? 'ABT 1990' : ''" />
            </label>
            <label for="ed-dplace">Death place
              <input id="ed-dplace" maxlength="500" [value]="draft().deathPlace" (input)="setText('deathPlace', $event)" />
            </label>
          </div>
        }

        <label for="ed-notes">Notes
          <textarea id="ed-notes" maxlength="20000" rows="3" [value]="draft().notes" (input)="setText('notes', $event)"></textarea>
        </label>
        </fieldset>
        @if (store.canEdit()) {
          <p class="hint">Dates use GEDCOM style: <code>1 JAN 1950</code>, <code>ABT 1950</code>, <code>BEF 1920</code>.</p>

          <div class="save-row">
            <button type="submit" class="btn primary" [disabled]="!changed()">Save changes</button>
            <button type="button" class="btn ghost" [disabled]="!changed()" (click)="revert()">Revert</button>
          </div>
        }
      </form>

      <section class="rel">
        <h3>Parents</h3>
        <ul>
          @if (parents().father; as f) {
            <li><button type="button" class="link" (click)="store.select(f.id)">{{ name(f) }}</button><span class="tag">father</span></li>
          } @else if (store.canEdit()) {
            <li><button type="button" class="btn small" (click)="store.addParent(p.id, 'M')">+ Add father</button></li>
          }
          @if (parents().mother; as m) {
            <li><button type="button" class="link" (click)="store.select(m.id)">{{ name(m) }}</button><span class="tag">mother</span></li>
          } @else if (store.canEdit()) {
            <li><button type="button" class="btn small" (click)="store.addParent(p.id, 'F')">+ Add mother</button></li>
          }
        </ul>

        <h3>Spouses &amp; children</h3>
        @for (u of unions(); track u.famId) {
          <div class="union">
            <div class="union-head">
              @if (u.spouse; as s) {
                <button type="button" class="link" (click)="store.select(s.id)">{{ name(s) }}</button>
              } @else {
                <span class="muted">Partner not recorded</span>
              }
              <span class="tag mono">&#64;{{ u.famId }}&#64;</span>
              <label class="mini-check" [for]="'cur-' + u.famId">
                <input type="checkbox" [id]="'cur-' + u.famId" [checked]="u.former" [disabled]="!store.canEdit()" (change)="toggleFormer(u.famId, $event)" /> former
              </label>
              @if (store.canEdit()) {
                <button type="button" class="icon-btn small" (click)="store.unlink(p.id, u.famId)" [attr.aria-label]="'Unlink from family ' + u.famId" title="Remove this link">⨯</button>
              }
            </div>
            <ul class="kids">
              @for (c of u.children; track c.id) {
                <li><button type="button" class="link" (click)="store.select(c.id)">{{ name(c) }}</button><span class="tag">{{ span(c) }}</span></li>
              }
              @if (store.canEdit()) {
                <li class="add-kids">
                  <button type="button" class="btn small" (click)="store.addChild(p.id, u.famId, 'M')">+ Son</button>
                  <button type="button" class="btn small" (click)="store.addChild(p.id, u.famId, 'F')">+ Daughter</button>
                </li>
              }
            </ul>
          </div>
        }
        @if (store.canEdit()) {
        <div class="add-row">
          <button type="button" class="btn small" (click)="store.addSpouse(p.id)">+ Add spouse</button>
          @if (!unions().length) {
            <button type="button" class="btn small" (click)="store.addChild(p.id, null, 'M')">+ Son</button>
            <button type="button" class="btn small" (click)="store.addChild(p.id, null, 'F')">+ Daughter</button>
          }
        </div>
        <label class="link-existing" for="ed-link">Link an existing person as spouse
          <select id="ed-link" (change)="linkExisting($event)">
            <option value="">Choose a person…</option>
            @for (o of linkOptions(); track o.id) {
              <option [value]="o.id">{{ o.label }}</option>
            }
          </select>
        </label>
        } @else if (!unions().length) {
          <p class="muted">None recorded</p>
        }

        <h3>Siblings</h3>
        <ul>
          @for (s of siblings(); track s.id) {
            <li><button type="button" class="link" (click)="store.select(s.id)">{{ name(s) }}</button><span class="tag">{{ span(s) }}</span></li>
          } @empty {
            <li class="muted">None recorded</li>
          }
          @if (store.canEdit()) {
            <li class="add-kids">
              <button type="button" class="btn small" (click)="store.addSibling(p.id, 'M')">+ Brother</button>
              <button type="button" class="btn small" (click)="store.addSibling(p.id, 'F')">+ Sister</button>
            </li>
          }
        </ul>
      </section>

      @if (store.canEdit()) {
      <section class="danger">
        @if (confirmDelete()) {
          <p>Delete {{ name(p) }} and remove them from every family? You can undo this.</p>
          <div class="save-row">
            <button type="button" class="btn danger-btn" (click)="remove(p.id)">Delete person</button>
            <button type="button" class="btn ghost" (click)="confirmDelete.set(false)">Keep</button>
          </div>
        } @else {
          <button type="button" class="btn ghost danger-text" (click)="confirmDelete.set(true)">Delete this person…</button>
        }
      </section>
      }
    }
  `,
})
export class PersonEditorComponent {
  readonly store = inject(FamilyStore);
  readonly sexes: { v: Sex; label: string }[] = [
    { v: 'M', label: 'Male' }, { v: 'F', label: 'Female' }, { v: 'U', label: 'Unknown' },
  ];
  readonly person = this.store.selected;
  readonly draft = linkedSignal<Person>(() => structuredClone(this.person() ?? emptyDraft()));
  readonly confirmDelete = linkedSignal<boolean>(() => { this.person(); return false; });

  readonly changed = computed(() => {
    const p = this.person();
    return !!p && JSON.stringify(p) !== JSON.stringify(this.draft());
  });

  readonly parents = computed<{ father?: Person; mother?: Person }>(() => {
    const p = this.person();
    return p ? this.store.parentsOf(p.id) : {};
  });
  readonly siblings = computed(() => {
    const p = this.person();
    return p ? this.store.siblingsOf(p.id) : [];
  });
  readonly unions = computed(() => {
    const p = this.person();
    if (!p) return [];
    const d = this.store.data();
    return this.store.familiesAsSpouse(p.id, d).map(f => {
      const sid = this.store.spouseIn(f, p.id);
      return {
        famId: f.id,
        former: f.current === false,
        spouse: sid ? d.people[sid] : undefined,
        children: f.children.map(c => d.people[c]).filter(Boolean),
      };
    });
  });
  readonly linkOptions = computed(() => {
    const p = this.person();
    if (!p) return [];
    const linked = new Set(this.unions().map(u => u.spouse?.id).filter(Boolean));
    return this.store.people()
      .filter(o => o.id !== p.id && !linked.has(o.id))
      .map(o => ({ id: o.id, label: `${displayName(o)} · @${o.id}@` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  name(p: Person) { return displayName(p); }
  span(p: Person) { return lifeSpan(p); }

  setText(field: TextField, ev: Event) {
    const v = (ev.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.draft.update(d => ({ ...d, [field]: v }));
  }
  setSex(v: Sex) { this.draft.update(d => ({ ...d, sex: v })); }
  setDeceased(ev: Event) {
    const v = (ev.target as HTMLInputElement).checked;
    this.draft.update(d => ({ ...d, deceased: v }));
  }

  save(ev: Event) {
    ev.preventDefault();
    const p = this.person();
    if (!p || !this.changed()) return;
    this.store.updatePerson(p.id, this.draft());
  }
  revert() {
    const p = this.person();
    if (p) this.draft.set(structuredClone(p));
  }
  close() { this.store.select(null); }

  toggleFormer(famId: string, ev: Event) {
    this.store.setFamilyCurrent(famId, !(ev.target as HTMLInputElement).checked);
  }
  linkExisting(ev: Event) {
    const sel = ev.target as HTMLSelectElement;
    const p = this.person();
    if (p && sel.value) this.store.linkSpouse(p.id, sel.value);
    sel.value = '';
  }
  remove(id: string) { this.store.deletePerson(id); }
}

function emptyDraft(): Person {
  return {
    id: '', given: '', surname: '', marriedName: '', sex: 'U', birthDate: '', birthPlace: '',
    deceased: false, deathDate: '', deathPlace: '', notes: '', extra: [],
  };
}
