import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FamilyStore } from './family-store.service';
import { SurnameRule } from './models';

export const SURNAME_RULES: { v: SurnameRule; label: string; example: string }[] = [
  { v: 'father-surname', label: "Father's surname", example: 'John Smith → Mary Smith' },
  { v: 'father-given', label: "Father's given name", example: 'Ravi Kumar → Priya Ravi' },
  { v: 'none', label: 'Leave blank', example: 'Type it in each time' },
];

/** "Start a family tree": a name and the surname rule. Opens the new tree's page when it is created. */
@Component({
  selector: 'app-create-tree',
  template: `
    <form class="gate-form" (submit)="create($event)">
      <label for="new-tree-name">Tree name
        <input id="new-tree-name" maxlength="200" placeholder="e.g. The Kumar family" autocomplete="off"
               [value]="name()" (input)="name.set(value($event))" />
      </label>
      <fieldset class="rule-list">
        <legend>Surname for new children</legend>
        @for (r of rules; track r.v) {
          <label class="rule" [for]="'new-rule-' + r.v">
            <input type="radio" name="new-tree-rule" [id]="'new-rule-' + r.v" [checked]="rule() === r.v" (change)="rule.set(r.v)" />
            <span><strong>{{ r.label }}</strong><span class="muted">{{ r.example }}</span></span>
          </label>
        }
      </fieldset>
      <button type="submit" class="btn primary wide" [disabled]="busy() || !name().trim()">Start the tree</button>
      @if (error()) { <p class="gate-error" role="alert">{{ error() }}</p> }
    </form>
  `,
})
export class CreateTreeComponent {
  private readonly store = inject(FamilyStore);
  private readonly router = inject(Router);
  readonly rules = SURNAME_RULES;
  readonly name = signal('');
  readonly rule = signal<SurnameRule>('father-surname');
  readonly busy = signal(false);
  readonly error = signal('');

  value(ev: Event) { return (ev.target as HTMLInputElement).value; }

  async create(ev: Event) {
    ev.preventDefault();
    if (!this.name().trim()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const id = await this.store.createTree(this.name().trim(), this.rule());
      await this.router.navigate(['/t', id]);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
