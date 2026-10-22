import { Component, computed, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { PUBLIC_PATHS } from './app.routes';
import { AuthService } from './auth.service';
import { FamilyStore } from './family-store.service';
import { LoginComponent } from './login.component';
import { takeReturnUrl } from './return-url';

/** Shell: public pages as they are; everything else behind the sign-in gate (My trees at /, a tree at /t/:treeId). */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoginComponent],
  template: `
    @if (publicPage()) {
      <router-outlet />
    } @else if (!auth.ready()) {
      <main class="gate"><p class="muted" role="status">Loading…</p></main>
    } @else if (!auth.session()) {
      <app-login />
    } @else {
      <router-outlet />
    }
  `,
})
export class AppComponent {
  readonly auth = inject(AuthService);
  private readonly store = inject(FamilyStore);
  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(filter(e => e instanceof NavigationEnd), map(e => (e as NavigationEnd).urlAfterRedirects)),
    { initialValue: location.pathname });
  readonly publicPage = computed(() => PUBLIC_PATHS.some(p => this.url().split(/[?#]/)[0] === p));

  constructor() {
    // Signing in (not a token refresh): go back to the page the person was on, e.g. a tree link they were sent.
    // Signing out: forget the data of the previous user.
    effect(() => {
      const user = this.auth.userId();
      untracked(() => {
        if (!user) return this.store.clear();
        const back = takeReturnUrl();
        if (back) void this.router.navigateByUrl(back);
      });
    });
  }
}
