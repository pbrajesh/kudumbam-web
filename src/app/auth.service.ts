import { Injectable, computed, signal } from '@angular/core';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

/** Supabase is used for sign-in only; the tree itself comes from our own API. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly configured = !environment.supabaseUrl.includes('your-project-ref')
    && !environment.supabasePublishableKey.includes('REPLACE_ME');
  private readonly client: SupabaseClient | null = this.configured
    ? createClient(environment.supabaseUrl, environment.supabasePublishableKey)
    : null;

  readonly session = signal<Session | null>(null);
  /** False until the stored session (or the one in a sign-in redirect URL) has been read. */
  readonly ready = signal(!this.client);
  readonly email = computed(() => this.session()?.user.email ?? '');
  /** Changes only when a different user signs in, not on every token refresh. */
  readonly userId = computed(() => this.session()?.user.id ?? null);

  constructor() {
    if (!this.client) return;
    this.client.auth.getSession()
      .then(({ data }) => this.session.set(data.session))
      .finally(() => this.ready.set(true));
    this.client.auth.onAuthStateChange((_event, s) => this.session.set(s));
  }

  /** Current access token, refreshed first if it has expired. */
  async accessToken(): Promise<string | null> {
    if (!this.client) return null;
    const { data } = await this.client.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async signInWithGoogle(): Promise<void> {
    const { error } = await this.requireClient().auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: location.origin },
    });
    if (error) throw error;
  }

  async sendMagicLink(email: string): Promise<void> {
    const { error } = await this.requireClient().auth.signInWithOtp({
      email, options: { emailRedirectTo: location.origin },
    });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    await this.client?.auth.signOut();
    this.session.set(null);
  }

  private requireClient(): SupabaseClient {
    if (!this.client) throw new Error('Sign-in is not set up: add your Supabase details to src/environments/environment.ts.');
    return this.client;
  }
}
