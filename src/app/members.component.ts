import { Component, computed, inject, signal } from '@angular/core';
import { environment } from '../environments/environment';
import { FamilyStore } from './family-store.service';
import { displayName, lifeSpan } from './models';
import { MemberRow, Role, TreeApi, messageOf } from './tree-api.service';

const ROLES: { v: Role; label: string; hint: string }[] = [
  { v: 'viewer', label: 'Viewer', hint: 'can see and export' },
  { v: 'editor', label: 'Editor', hint: 'can also add and change people' },
  { v: 'owner', label: 'Owner', hint: 'can also manage members, rename and delete' },
];

/**
 * Who is in the tree. Everyone sees the list and can leave; owners add people by email, change roles and remove
 * people. Added people join when they first sign in with that email, so the owner gets a message to send them.
 * Each member can be linked to the person they are in the tree: they say "This is me" on a card, and an owner
 * approves it here (or links them directly).
 */
@Component({
  selector: 'app-members',
  template: `
    @if (loading()) {
      <p class="muted" role="status">Loading members…</p>
    } @else {
      <ul class="member-list">
        @for (m of members(); track m.email) {
          <li class="member">
            <span class="member-who">
              <span class="member-email">{{ m.email }}@if (m.you) { <span class="muted"> (you)</span> }</span>
              @if (!m.joined) { <span class="tag">invited · not signed in yet</span> }
              @if (m.personId) {
                <span class="member-person">In the tree: <strong>{{ personName(m.personId) }}</strong>
                  @if (isOwner()) {
                    <button type="button" class="link small" (click)="unlink(m)" [disabled]="busy()">Unlink</button>
                  }
                </span>
              }
              @if (m.claimedPersonId) {
                <span class="member-claim">Says they are <strong>{{ personName(m.claimedPersonId) }}</strong>
                  @if (isOwner()) {
                    <span class="member-confirm">
                      <button type="button" class="btn small primary" (click)="approve(m)" [disabled]="busy()">Approve</button>
                      <button type="button" class="btn small ghost" (click)="reject(m)" [disabled]="busy()">Turn down</button>
                    </span>
                  } @else if (m.you) {
                    <span class="muted"> · waiting for an owner</span>
                  }
                </span>
              }
              @if (isOwner() && !m.personId && !m.claimedPersonId && store.people().length) {
                @if (linking() === m.email) {
                  <span class="member-link">
                    <label class="sr-only" [for]="'link-' + m.email">Person in the tree for {{ m.email }}</label>
                    <select [id]="'link-' + m.email" (change)="link(m, $event)" [disabled]="busy()">
                      <option value="">Choose who they are…</option>
                      @for (p of peopleOptions(); track p.id) { <option [value]="p.id">{{ p.label }}</option> }
                    </select>
                    <button type="button" class="btn small ghost" (click)="linking.set('')">Cancel</button>
                  </span>
                } @else {
                  <button type="button" class="link small member-link-btn" (click)="linking.set(m.email)">Link to a person in the tree…</button>
                }
              }
            </span>
            @if (isOwner()) {
              <label class="sr-only" [for]="'role-' + m.email">Role for {{ m.email }}</label>
              <select [id]="'role-' + m.email" class="role-select" [disabled]="busy()" (change)="setRole(m, $event)">
                @for (r of roles; track r.v) { <option [value]="r.v" [selected]="r.v === m.role">{{ r.label }}</option> }
              </select>
              @if (!m.you) {
                @if (confirmRemove() === m.email) {
                  <span class="member-confirm">
                    <button type="button" class="btn small danger-btn" (click)="remove(m)" [disabled]="busy()">Remove</button>
                    <button type="button" class="btn small ghost" (click)="confirmRemove.set('')">Keep</button>
                  </span>
                } @else {
                  <button type="button" class="icon-btn small" (click)="confirmRemove.set(m.email)" [disabled]="busy()"
                          [attr.aria-label]="'Remove ' + m.email" title="Remove from this tree">⨯</button>
                }
              }
            } @else {
              <span class="tag role-tag">{{ label(m.role) }}</span>
            }
          </li>
        }
      </ul>

      @if (isOwner()) {
        <form class="add-member" (submit)="add($event)">
          <h3>Add someone</h3>
          <p class="muted small">They get access when they sign in with this email address — with an email link,
            or with Google if it is their Google address.</p>
          <div class="rename">
            <label for="member-email">Email
              <input id="member-email" type="email" autocomplete="off" maxlength="254" [value]="email()" (input)="email.set(value($event))" />
            </label>
            <label for="member-role" class="role-field">Role
              <select id="member-role" (change)="role.set($any(value($event)))">
                @for (r of roles; track r.v) { <option [value]="r.v" [selected]="r.v === role()">{{ r.label }}</option> }
              </select>
            </label>
            <button type="submit" class="btn primary" [disabled]="busy() || !email().includes('@')">Add</button>
          </div>
          <p class="muted small">{{ roleHint() }}</p>
        </form>
      }

      @if (invite(); as inv) {
        <section class="invite" aria-live="polite">
          <h3>Send {{ inv.email }} this message</h3>
          <textarea id="invite-text" class="ged-text" rows="4" readonly [value]="inv.text"></textarea>
          <div class="save-row">
            <button type="button" class="btn" (click)="copyInvite()">{{ copied() ? 'Copied' : 'Copy message' }}</button>
            <button type="button" class="btn ghost" (click)="invite.set(null)">Done</button>
          </div>
        </section>
      }

      @if (error()) { <p class="gate-error" role="alert">{{ error() }}</p> }

      <section class="danger">
        @if (confirmLeave()) {
          <p>Leave “{{ store.treeName() }}”? You will lose access until an owner adds you again.</p>
          <div class="save-row">
            <button type="button" class="btn danger-btn" (click)="leave()" [disabled]="busy()">Leave tree</button>
            <button type="button" class="btn ghost" (click)="confirmLeave.set(false)">Stay</button>
          </div>
        } @else if (onlyOwner()) {
          <p class="muted small">You are this tree's only owner, so you cannot leave it. Make someone else an owner
            first, or delete the tree in Settings.</p>
        } @else {
          <button type="button" class="btn ghost danger-text" (click)="confirmLeave.set(true)">Leave this tree…</button>
        }
      </section>
    }
  `,
})
export class MembersComponent {
  readonly store = inject(FamilyStore);
  private readonly api = inject(TreeApi);
  readonly roles = ROLES;
  readonly members = signal<MemberRow[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly email = signal('');
  readonly role = signal<Role>('viewer');
  readonly invite = signal<{ email: string; text: string } | null>(null);
  readonly copied = signal(false);
  readonly confirmLeave = signal(false);
  /** Email of the member whose Remove button was pressed once. */
  readonly confirmRemove = signal('');
  /** Email of the member an owner is choosing a person for. */
  readonly linking = signal('');

  /** People nobody is linked to yet, for the owner's "Link to a person" list. */
  readonly peopleOptions = computed(() => {
    const taken = new Set(this.members().map(m => m.personId));
    return this.store.people()
      .filter(p => !taken.has(p.id))
      .map(p => ({ id: p.id, label: `${displayName(p)}${lifeSpan(p) ? ' · ' + lifeSpan(p) : ''} · @${p.id}@` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  readonly isOwner = computed(() => this.store.role() === 'owner');
  readonly onlyOwner = computed(() =>
    this.isOwner() && this.members().filter(m => m.role === 'owner').length === 1);
  readonly roleHint = computed(() => {
    const r = ROLES.find(x => x.v === this.role())!;
    return `${r.label}: ${r.hint}.`;
  });

  constructor() {
    void this.run(async id => this.show(await this.api.listMembers(id))).then(() => this.loading.set(false));
  }

  /** Show a fresh list, keeping the tree's own record of you and of waiting claims in step with it. */
  private show(list: MemberRow[]) {
    this.members.set(list);
    if (this.isOwner()) this.store.pendingClaims.set(list.filter(m => m.claimedPersonId).length);
    const me = list.find(m => m.you);
    if (me) this.store.you.set({ personId: me.personId, claimedPersonId: me.claimedPersonId });
  }

  personName(id: string) {
    const p = this.store.data().people[id];
    return p ? displayName(p) : `@${id}@`;
  }

  async approve(m: MemberRow) {
    const personId = m.claimedPersonId;
    if (personId) await this.run(async id => this.show(await this.api.linkMember(id, m.email, personId)));
  }
  async reject(m: MemberRow) {
    await this.run(async id => this.show(await this.api.rejectClaim(id, m.email)));
  }
  async unlink(m: MemberRow) {
    await this.run(async id => this.show(await this.api.unlinkMember(id, m.email)));
  }
  async link(m: MemberRow, ev: Event) {
    const personId = (ev.target as HTMLSelectElement).value;
    if (!personId) return;
    if (await this.run(async id => this.show(await this.api.linkMember(id, m.email, personId)))) this.linking.set('');
  }

  value(ev: Event) { return (ev.target as HTMLInputElement | HTMLSelectElement).value; }
  label(r: Role) { return ROLES.find(x => x.v === r)?.label ?? r; }

  async add(ev: Event) {
    ev.preventDefault();
    const email = this.email().trim().toLowerCase();
    const ok = await this.run(async id => this.show(await this.api.addMember(id, email, this.role())));
    if (!ok) return;
    this.email.set('');
    this.copied.set(false);
    this.invite.set({
      email,
      text: `I've added you to our family tree “${this.store.treeName()}” on ${environment.appName}. `
        + `Open ${location.origin}/t/${this.store.treeId()} and sign in with ${email} to see it.`,
    });
  }

  async setRole(m: MemberRow, ev: Event) {
    const sel = ev.target as HTMLSelectElement;
    const role = sel.value as Role;
    const ok = await this.run(async id => this.show(await this.api.changeRole(id, m.email, role)));
    if (!ok) { sel.value = m.role; return; }
    // Your own role changed: reload so the app shows what you can now do.
    if (m.you) await this.store.load(true);
  }

  async remove(m: MemberRow) {
    await this.run(async id => this.show(await this.api.removeMember(id, m.email)));
    this.confirmRemove.set('');
  }

  async leave() {
    this.busy.set(true);
    try {
      await this.store.leaveTree();
    } catch (e) {
      this.error.set((e as Error).message);
      this.busy.set(false);
    }
  }

  async copyInvite() {
    const text = this.invite()?.text ?? '';
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
    } catch {
      const ta = document.getElementById('invite-text') as HTMLTextAreaElement | null;
      ta?.focus();
      ta?.select();
    }
  }

  /** Run a call for the tree on screen; show the server's message if it fails. */
  private async run(fn: (treeId: string) => Promise<void>): Promise<boolean> {
    const id = this.store.treeId();
    if (!id) return false;
    this.busy.set(true);
    this.error.set('');
    try {
      await fn(id);
      return true;
    } catch (e) {
      this.error.set(messageOf(e));
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
