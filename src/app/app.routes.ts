import { Routes } from '@angular/router';
import { HelpPageComponent } from './help-page.component';
import { PrivacyPageComponent } from './privacy-page.component';
import { TreePageComponent } from './tree-page.component';
import { TreesPageComponent } from './trees-page.component';

/** Pages anyone can open without signing in (the app shell checks this). */
export const PUBLIC_PATHS = ['/privacy', '/help'];

export const routes: Routes = [
  { path: '', component: TreesPageComponent },
  { path: 't/:treeId', component: TreePageComponent },
  { path: 'privacy', component: PrivacyPageComponent },
  { path: 'help', component: HelpPageComponent },
  { path: '**', redirectTo: '' },
];
