import { Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { environment } from '../environments/environment';
import { AuthService } from './auth.service';

/** /help — open to everyone, signed in or not. A guide for family members and for tree owners. */
@Component({
  selector: 'app-help-page',
  imports: [RouterLink],
  template: `
    <header class="topbar">
      <div class="brand"><h1><a class="home-link" routerLink="/">{{ appName }}</a></h1></div>
      <nav class="actions"><a class="btn ghost" routerLink="/">{{ auth.session() ? 'My trees' : 'Sign in' }}</a></nav>
    </header>
    <main class="prose help" id="help-top">
      <h2>Help</h2>
      <p>{{ appName }} is a family tree that relatives build together. Each tree is private: only the people its owners
        invite can see it.</p>

      <nav class="help-toc" aria-label="On this page">
        <div>
          <strong>For family members</strong>
          <ul>
            <li><button type="button" class="link" (click)="go('getting-started')">Getting started</button></li>
            <li><button type="button" class="link" (click)="go('find-yourself')">Finding yourself in the tree</button></li>
            <li><button type="button" class="link" (click)="go('browsing')">Browsing the tree</button></li>
            <li><button type="button" class="link" (click)="go('editing')">Adding and editing people</button></li>
          </ul>
        </div>
        <div>
          <strong>For tree owners</strong>
          <ul>
            <li><button type="button" class="link" (click)="go('creating')">Starting a tree</button></li>
            <li><button type="button" class="link" (click)="go('inviting')">Inviting family</button></li>
            <li><button type="button" class="link" (click)="go('approving')">Approving “This is me”</button></li>
            <li><button type="button" class="link" (click)="go('export-delete')">Exporting, leaving or deleting</button></li>
          </ul>
        </div>
      </nav>

      <h2 class="help-part">For family members</h2>

      <section id="getting-started">
        <h3>Getting started</h3>
        <ol>
          <li>Open the link a relative sent you, or the site's address.</li>
          <li>Sign in with <strong>Continue with Google</strong>, or type your email address and choose
            <strong>Email me a link</strong>, then open the link in that email.</li>
          <li><strong>My trees</strong> lists every tree you belong to and your role in each. Pick one to open it.</li>
        </ol>
        <p><strong>No tree showing up?</strong> You only see a tree after an owner adds you, and only when you sign in
          with the <em>same</em> email address they used. Ask them which address they added, sign in with that one, and
          choose <strong>Check again</strong>. If a tree link says “This tree isn't available”, it is the same problem:
          check which email you signed in with.</p>
        <p>What you can do depends on your role in that tree:</p>
        <ul>
          <li><strong>Viewer:</strong> see the tree and export it. The header says <em>view only</em>.</li>
          <li><strong>Editor:</strong> also add, change and delete people, undo and redo, import a file, and change the
            tree's settings.</li>
          <li><strong>Owner:</strong> also invite and remove members, approve who is who, and rename or delete the tree.</li>
        </ul>
      </section>

      <section id="find-yourself">
        <h3>Finding yourself in the tree</h3>
        <ol>
          <li>Find yourself in the people list (☰ on a phone) by typing your name in the search box, and click your name.</li>
          <li>In your card's panel, choose <strong>This is me</strong>.</li>
          <li>An owner of the tree confirms it. Until then your card says
            <em>You said this is you · waiting for an owner to approve</em>, and you can <strong>Take back</strong> the
            claim if you picked the wrong person. (Owners who choose This is me are linked straight away.)</li>
        </ol>
        <p>Once you are linked:</p>
        <ul>
          <li>the tree opens on you, and your card and your name in the list are marked <strong>you</strong>;</li>
          <li><strong>Find me</strong>, above the tree, brings you back to your own card from anywhere;</li>
          <li><strong>This isn't me</strong> in your panel removes the link at any time.</li>
        </ul>
        <p>Each person in a tree can be linked to only one member. If someone else is already linked to you, ask an owner
          to sort it out.</p>
      </section>

      <section id="browsing">
        <h3>Browsing the tree</h3>
        <ul>
          <li>The tree is centred on one person (shown above the tree as <em>Centred on</em>): their ancestors are above
            them, their children and grandchildren with their spouses below.</li>
          <li><strong>Drag</strong> to move around; <strong>scroll</strong> or use the <strong>+</strong> and
            <strong>−</strong> buttons to zoom. <strong>⌖</strong> brings the centred person back into view.</li>
          <li><strong>Click</strong> a card to open that person's details. <strong>Double-click</strong> it (or press Enter)
            to centre the tree on them. <strong>Centre tree here</strong> in the panel does the same.</li>
          <li>Use <strong>Ancestors</strong> and <strong>Descendants</strong> above the tree to show more or fewer
            generations.</li>
          <li>A <strong>+</strong> on a card means more relatives are off-screen: centre on that person to see them. Dashed
            cards are people who have died; a dashed line between a couple is a former partnership.</li>
          <li>The people list on the left (☰ on a phone) searches everyone by name, ID or birth date. Click a name to jump
            to them.</li>
          <li>Changes other people make do not appear on their own: choose <strong>Reload latest</strong> at the bottom
            of the people list to see them.</li>
        </ul>
      </section>

      <section id="editing">
        <h3>Adding and editing people <span class="tag">editors and owners</span></h3>
        <ul>
          <li><strong>Change details:</strong> click a person, edit their names, sex, birth and death dates and places, or
            notes, then choose <strong>Save changes</strong> (<strong>Revert</strong> throws your edits away). Tick
            <strong>Deceased</strong> to add a death date.</li>
          <li><strong>Dates</strong> are written the way family tree files write them: <code>1 JAN 1950</code>,
            <code>JAN 1950</code> or <code>1950</code>, and <code>ABT 1950</code> (about), <code>BEF 1920</code> (before)
            or <code>AFT 1920</code> (after) when you are not sure.</li>
          <li><strong>Add relatives</strong> from the panel: <strong>+ Add father</strong>, <strong>+ Add mother</strong>,
            <strong>+ Add spouse</strong>, <strong>+ Son</strong>, <strong>+ Daughter</strong>, <strong>+ Brother</strong>
            and <strong>+ Sister</strong>. The new person opens straight away so you can type their name. A new child's
            surname is filled in following the tree's setting (see <strong>Settings</strong>).</li>
          <li><strong>Someone is already in the tree?</strong> Use <strong>Link an existing person as spouse</strong>
            instead of adding them twice.</li>
          <li><strong>Former partners:</strong> tick <strong>former</strong> next to a spouse. The <strong>⨯</strong>
            next to a family removes the link without deleting anyone.</li>
          <li><strong>Delete this person…</strong> at the bottom of the panel removes them from every family.</li>
          <li><strong>Undo</strong> and <strong>Redo</strong> in the header work for every change, including deletes.
            Undo history lasts until you reload the page.</li>
          <li>Every change is saved for everyone straight away (<em>saving…</em> shows in the header). If someone else
            changed the same people first, your change is not saved: the latest tree is shown, and you make the change
            again.</li>
          <li><strong>Make home person</strong> in a panel sets who the tree opens on for anyone visiting for the first
            time.</li>
        </ul>
        <p class="muted">Photos and documents cannot be added yet: use <strong>Notes</strong> for stories, occupations
          and anything else worth keeping. Please be careful with living relatives, especially children: every member of
          the tree can read what you write.</p>
      </section>

      <h2 class="help-part">For tree owners</h2>

      <section id="creating">
        <h3>Starting a tree</h3>
        <ol>
          <li>On <strong>My trees</strong>, choose <strong>＋ Start a new tree</strong> (or <em>＋ Start a new tree…</em> in
            the tree picker in a tree's header). You become its owner.</li>
          <li>Give it a name and choose how a new child's surname is filled in: the father's surname, the father's given
            name (common in South India), or left blank. You can change this later in <strong>Settings</strong>.</li>
          <li>In the empty tree, choose <strong>Add the first person</strong> and add relatives from there, or
            <strong>Import a .ged file</strong> exported from another family tree app (Family Echo, Gramps, Ancestry and
            others export GEDCOM).</li>
          <li>Open the person the tree should start on and choose <strong>Make home person</strong>.</li>
        </ol>
        <p><strong>Import .ged</strong> in the header replaces the whole tree for everyone, and clears every member's
          link to a person. <strong>Undo</strong> puts the previous tree back. Editors can import too.</p>
      </section>

      <section id="inviting">
        <h3>Inviting family</h3>
        <ol>
          <li>Open <strong>Members</strong> in the tree's header.</li>
          <li>Under <strong>Add someone</strong>, type their email address and pick a role:
            <strong>Viewer</strong> (can see and export), <strong>Editor</strong> (can also add and change people) or
            <strong>Owner</strong> (can also manage members, rename and delete). Choose <strong>Add</strong>.</li>
          <li>The site does not send emails: {{ appName }} shows a ready-made message with the tree's link. Choose
            <strong>Copy message</strong> and send it by WhatsApp, email or text.</li>
          <li>They get access the first time they sign in with that address. Until then the list shows
            <em>invited · not signed in yet</em>. Use the address they actually sign in with — for Google sign-in, their
            Google account's address.</li>
        </ol>
        <p>In the same list you can change anyone's role, or remove someone with <strong>⨯</strong> (it asks you to
          confirm). Every tree keeps at least one owner.</p>
      </section>

      <section id="approving">
        <h3>Approving “This is me”</h3>
        <p>When a member chooses <strong>This is me</strong> on a card, the <strong>Members</strong> button shows a count
          of claims waiting for you. Open it to see, for example, <em>Says they are Ravi Kumar</em>, then:</p>
        <ul>
          <li><strong>Approve</strong> links them to that person: their card is marked as them and the tree opens on
            them.</li>
          <li><strong>Turn down</strong> removes the claim, if they picked the wrong person.</li>
          <li><strong>Link to a person in the tree…</strong> links a member who has not claimed anyone, choosing the person
            for them. It also works for people who have not signed in yet.</li>
          <li><strong>Unlink</strong>, next to <em>In the tree</em>, removes a link.</li>
        </ul>
        <p>Deleting a person, or importing a new file, removes the links to them.</p>
      </section>

      <section id="export-delete">
        <h3>Exporting, leaving or deleting a tree</h3>
        <ul>
          <li><strong>Export .ged</strong> (any member) saves the whole tree as a GEDCOM file that other family tree apps
            can open. Keep a copy now and then.</li>
          <li><strong>Leave this tree…</strong> at the bottom of <strong>Members</strong> removes your own access. The only
            owner cannot leave: make someone else an owner first.</li>
          <li><strong>Settings</strong> (owners) lets you rename the tree, change the surname rule, and
            <strong>Delete this tree</strong>. To delete, type the tree's name to confirm.</li>
        </ul>
        <p class="help-warn"><strong>Deleting a tree cannot be undone.</strong> It removes every person and every link,
          for all members. Export a .ged file first if you might want it back.</p>
        <p>To delete your whole account, use <strong>Delete my account…</strong> on My trees. See
          <a routerLink="/privacy">Privacy</a> for what is stored and who can see it.</p>
      </section>

      <p><button type="button" class="link" (click)="go('help-top')">Back to top</button></p>
    </main>
  `,
})
export class HelpPageComponent {
  readonly auth = inject(AuthService);
  readonly appName = environment.appName;

  constructor() {
    inject(Title).setTitle(`Help · ${environment.appName}`);
  }

  /** Scroll to a section. Plain #fragment links would leave the page, because the app uses <base href="/">. */
  go(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
