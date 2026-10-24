import { Component, computed, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { environment } from '../environments/environment';
import { AuthService } from './auth.service';
import { CreateTreeComponent } from './create-tree.component';
import { FamilyStore } from './family-store.service';
import { Role, TreeApi, messageOf } from './tree-api.service';

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' };

/** / — the signed-in user's trees, and starting a new one. */
@Component({
  selector: 'app-trees-page',
  imports: [RouterLink, CreateTreeComponent],
  template: `
    <header class="topbar">
      <div class="brand"><h1>{{ appName }}</h1></div>
      <nav class="actions" aria-label="Account">
        <span class="muted signed-in-top">{{ auth.email() }}</span>
        <a class="btn ghost" routerLink="/help">Help</a>
        <button type="button" class="btn ghost" (click)="auth.signOut()">Sign out</button>
      </nav>
    </header>

    <main class="trees-page">
      @if (store.treesStatus() === 'error') {
        <div class="gate-card">
          <p class="gate-error" role="alert">Couldn't load your trees. {{ store.statusMessage() }}</p>
          <button type="button" class="btn primary" (click)="store.loadTrees()">Try again</button>
        </div>
      } @else if (store.treesStatus() !== 'ready') {
        <p class="muted" role="status">Loading your trees…</p>
      } @else if (!store.trees().length) {
        <div class="gate-card">
          <h2 class="gate-sub">Start your family tree</h2>
          <p class="muted">Only people you invite will be able to see it.</p>
          <app-create-tree />
          <p class="muted small">Has a relative already added you to their tree? Ask them to check they used
            <strong>{{ auth.email() }}</strong>, then <button type="button" class="link" (click)="store.loadTrees()">check again</button>.</p>
        </div>
      } @else {
        <section class="trees-head">
          <h2>Your family trees</h2>
          <button type="button" class="btn" (click)="creating.set(!creating())" [attr.aria-expanded]="creating()">
            {{ creating() ? 'Cancel' : '＋ Start a new tree' }}
          </button>
        </section>
        @if (creating()) {
          <div class="gate-card create-card">
            <p class="muted">You will be its owner. Only people you invite will be able to see it.</p>
            <app-create-tree />
          </div>
        }
        <ul class="tree-cards">
          @for (t of sorted(); track t.id) {
            <li>
              <a class="tree-card" [routerLink]="['/t', t.id]">
                <span class="tree-card-name">{{ t.name }}</span>
                <span class="muted">{{ t.peopleCount }} {{ t.peopleCount === 1 ? 'person' : 'people' }} · {{ label(t.role) }}</span>
                @if (t.id === store.lastTreeId()) { <span class="tag">last opened</span> }
              </a>
            </li>
          }
        </ul>
        <p class="muted small">Someone added you to their tree? It appears here when you sign in with the email address
          they used. <button type="button" class="link" (click)="store.loadTrees()">Check again</button></p>
      }

      @if (store.treesStatus() === 'ready') {
        <section class="account">
          <h2>Your account</h2>
          <p class="muted small">Signed in as <strong>{{ auth.email() }}</strong>.
            <a routerLink="/privacy">What is stored and who can see it.</a></p>
          @if (!deleting()) {
            <button type="button" class="btn ghost danger-text" (click)="deleting.set(true)">Delete my account…</button>
          } @else {
            <div class="danger">
              <p>This removes you from every tree, deletes the trees that only you belong to, and removes your email from
                the record of who changed what. Trees other people use stay as they are. This cannot be undone.</p>
              <form class="rename" (submit)="deleteAccount($event)">
                <label for="delete-account">Type your email address to confirm
                  <input id="delete-account" type="email" autocomplete="off" [value]="confirmEmail()"
                         (input)="confirmEmail.set(value($event))" />
                </label>
                <button type="submit" class="btn danger-btn"
                        [disabled]="busy() || confirmEmail().trim().toLowerCase() !== auth.email().toLowerCase()">Delete my account</button>
                <button type="button" class="btn ghost" (click)="deleting.set(false)">Cancel</button>
              </form>
              @if (error()) { <p class="gate-error" role="alert">{{ error() }}</p> }
            </div>
          }
        </section>
      }
    </main>
  `,
})
export class TreesPageComponent {
  readonly auth = inject(AuthService);
  readonly store = inject(FamilyStore);
  readonly appName = environment.appName;
  readonly creating = signal(false);
  /** The tree opened last comes first; then by name. */
  readonly sorted = computed(() => {
    const last = this.store.lastTreeId();
    return [...this.store.trees()].sort((a, b) =>
      Number(b.id === last) - Number(a.id === last) || a.name.localeCompare(b.name));
  });

  private readonly api = inject(TreeApi);
  readonly deleting = signal(false);
  readonly confirmEmail = signal('');
  readonly busy = signal(false);
  readonly error = signal('');

  constructor() {
    inject(Title).setTitle(environment.appName);
    void this.store.loadTrees();
  }

  label(r: Role) { return ROLE_LABEL[r]; }
  value(ev: Event) { return (ev.target as HTMLInputElement).value; }

  /** Delete everything stored about this user, then sign out. */
  async deleteAccount(ev: Event) {
    ev.preventDefault();
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.deleteAccount(this.confirmEmail().trim().toLowerCase());
      await this.auth.signOut();
    } catch (e) {
      this.error.set(messageOf(e));
    } finally {
      this.busy.set(false);
    }
  }
}
