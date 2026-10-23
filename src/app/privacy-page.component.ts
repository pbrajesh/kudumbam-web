import { Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { environment } from '../environments/environment';
import { AuthService } from './auth.service';

/** /privacy — open to everyone, signed in or not. Describes what this app actually stores and does. */
@Component({
  selector: 'app-privacy-page',
  imports: [RouterLink],
  template: `
    <header class="topbar">
      <div class="brand"><h1><a class="home-link" routerLink="/">{{ appName }}</a></h1></div>
      <nav class="actions"><a class="btn ghost" routerLink="/">{{ auth.session() ? 'My trees' : 'Sign in' }}</a></nav>
    </header>
    <main class="prose">
      <h2>Privacy</h2>
      <p>{{ appName }} lets families build a family tree together. This page explains, in plain words, what the site
        keeps and how you stay in control of it.</p>

      <h3>What is stored</h3>
      <ul>
        <li><strong>Your email address and a sign-in ID.</strong> Sign-in is handled by Supabase, which emails you sign-in
          links (or uses your Google account) and tells this site who you are.</li>
        <li><strong>The family trees you and your relatives add:</strong> names, sex, dates and places of birth and death,
          marriages and notes — about people who have died and about living people.</li>
        <li><strong>Who belongs to each tree</strong> and their role (viewer, editor or owner), and who last changed each
          person or family.</li>
        <li><strong>Which person in a tree you are</strong>, if you choose “This is me” on a person (an owner confirms it)
          or an owner links you. Other members of that tree can see it. You can remove it at any time with “This isn't me”.</li>
        <li><strong>In your browser only:</strong> your sign-in session, the tree you opened last and the person you last
          centred on. Nothing else is tracked: no advertising, no analytics, no tracking cookies.</li>
      </ul>

      <h3>Who can see it</h3>
      <p>A tree is visible only to its members. Viewers can read and export it, editors can also change it, and owners can
        also add or remove members, rename it or delete it. Trees are never public, never sold and never shared with
        anyone else. The people who run the site's servers can technically reach the data, and only do so to keep the
        site working.</p>

      <h3>Please be careful with living relatives</h3>
      <p>Before adding details about living people — especially notes, or anything about children — make sure they
        would be comfortable with every member of the tree seeing it.</p>

      <h3>Your choices</h3>
      <ul>
        <li><strong>Take your data with you:</strong> any member can export a tree as a GEDCOM (.ged) file.</li>
        <li><strong>Leave a tree</strong> from its Members screen.</li>
        <li><strong>Delete a tree</strong> (owners) from its Settings: everyone and everything in it is removed.</li>
        <li><strong>Delete your account</strong> from the My trees page: you leave every tree, trees that only you belong
          to are deleted, and your email is removed from the record of who changed what. If you are the only owner of a
          tree other people use, make someone else an owner (or delete the tree) first.</li>
        <li>Deleted data can remain in the site's backups for a short time until they expire.</li>
        <li>Your sign-in record at Supabase (your email address) is removed on request{{ contact ? '' : ' to the people who run this site' }}.
          @if (contact) { Write to <a [href]="'mailto:' + contact">{{ contact }}</a>. }
        </li>
      </ul>

      @if (contact) {
        <h3>Questions</h3>
        <p>Write to <a [href]="'mailto:' + contact">{{ contact }}</a>.</p>
      }
    </main>
  `,
})
export class PrivacyPageComponent {
  readonly auth = inject(AuthService);
  readonly appName = environment.appName;
  readonly contact = environment.privacyContact;

  constructor() {
    inject(Title).setTitle(`Privacy · ${environment.appName}`);
  }
}
