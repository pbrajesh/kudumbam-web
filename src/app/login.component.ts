import { Component, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { environment } from '../environments/environment';
import { AuthService } from './auth.service';
import { saveReturnUrl } from './return-url';

@Component({
  selector: 'app-login',
  imports: [RouterLink],
  template: `
    <main class="gate">
      <div class="gate-card">
        <h1>{{ appName }}</h1>
        <p class="muted">Sign in to see and edit the family tree.</p>

        @if (!auth.configured) {
          <p class="gate-error" role="alert">
            Sign-in is not set up yet. Add your Supabase project URL and publishable key to
            <code>src/environments/environment.ts</code>.
          </p>
        } @else {
          <button type="button" class="btn primary wide" (click)="google()" [disabled]="busy()">Continue with Google</button>
          <p class="or" aria-hidden="true">or</p>
          @if (sentTo(); as to) {
            <p role="status">Check <strong>{{ to }}</strong> for a sign-in link. You can close this tab.</p>
            <button type="button" class="link" (click)="sentTo.set('')">Use a different email</button>
          } @else {
            <form class="gate-form" (submit)="sendLink($event)">
              <label for="login-email">Email
                <input id="login-email" type="email" required autocomplete="email" [value]="email()"
                       (input)="email.set(value($event))" />
              </label>
              <button type="submit" class="btn wide" [disabled]="busy() || !email().includes('@')">Email me a link</button>
            </form>
          }
          @if (error()) { <p class="gate-error" role="alert">{{ error() }}</p> }
        }
        <p class="muted small"><a routerLink="/privacy">Privacy: what is stored and who can see it</a></p>
      </div>
    </main>
  `,
})
export class LoginComponent {
  readonly auth = inject(AuthService);
  readonly appName = environment.appName;
  readonly email = signal('');
  readonly sentTo = signal('');
  readonly busy = signal(false);
  readonly error = signal('');

  constructor() {
    inject(Title).setTitle(environment.appName);
    // Come back to this page (e.g. a shared tree link) after signing in.
    saveReturnUrl();
  }

  value(ev: Event) { return (ev.target as HTMLInputElement).value; }

  async google() {
    await this.run(() => this.auth.signInWithGoogle());
  }

  async sendLink(ev: Event) {
    ev.preventDefault();
    const email = this.email().trim();
    if (await this.run(() => this.auth.sendMagicLink(email))) this.sentTo.set(email);
  }

  private async run(fn: () => Promise<void>): Promise<boolean> {
    this.busy.set(true);
    this.error.set('');
    try {
      await fn();
      return true;
    } catch (e) {
      this.error.set((e as Error).message || 'Sign-in failed. Please try again.');
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
