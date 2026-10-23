import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';
import { Family, Person, SurnameRule, TreeData, TreeSettings } from './models';

export type Role = 'viewer' | 'editor' | 'owner';
/** A tree the signed-in user belongs to. */
export interface TreeSummary {
  id: string;
  name: string;
  role: Role;
  peopleCount: number;
}
export interface Me {
  id: string;
  email: string;
  trees: TreeSummary[];
}
export interface MemberRow {
  email: string;
  role: Role;
  /** False until they first sign in with this email. */
  joined: boolean;
  /** This row is the signed-in user. */
  you: boolean;
  addedAt: string;
  /** The person in the tree they are (approved by an owner), or null. */
  personId: string | null;
  /** The person they said "This is me" about, waiting for an owner, or null. */
  claimedPersonId: string | null;
}
/** Who the signed-in user is in a tree. */
export interface YouInTree {
  personId: string | null;
  claimedPersonId: string | null;
}
/** Your link, and (owners only, else 0) how many "This is me" claims wait for approval. */
export interface YouResponse {
  you: YouInTree;
  pendingClaims: number;
}
export interface TreeInfo extends TreeSummary, YouResponse {
  fileName: string;
  settings: TreeSettings;
}
export interface Versions {
  people: Record<string, number>;
  families: Record<string, number>;
}
export interface TreeResponse extends YouResponse {
  data: TreeData;
  versions: Versions;
  fileName: string;
  settings: TreeSettings;
  role: Role;
}
/** One edit: every record it touches. `version` is what this client last saw (null for new records). */
export interface ChangeSet {
  upsertPeople: (Person & { version: number | null })[];
  deletePeople: { id: string; version: number }[];
  upsertFamilies: (Family & { version: number | null })[];
  deleteFamilies: { id: string; version: number }[];
}
export interface ImportBody {
  fileName: string;
  submitterName: string;
  people: Person[];
  families: Family[];
}

@Injectable({ providedIn: 'root' })
export class TreeApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/api`;

  private tree(id: string) { return `${this.base}/trees/${encodeURIComponent(id)}`; }

  getMe() { return firstValueFrom(this.http.get<Me>(`${this.base}/me`)); }
  /** Delete everything stored about the signed-in user; `confirm` is their email address. */
  deleteAccount(confirm: string) {
    return firstValueFrom(this.http.delete<{ deletedTrees: number; leftTrees: number }>(`${this.base}/me`, { params: { confirm } }));
  }
  createTree(name: string, surnameRule: SurnameRule) {
    return firstValueFrom(this.http.post<TreeSummary>(`${this.base}/trees`, { name, surnameRule }));
  }
  getTree(id: string) { return firstValueFrom(this.http.get<TreeResponse>(`${this.tree(id)}/tree`)); }
  sendChanges(id: string, c: ChangeSet) {
    return firstValueFrom(this.http.post<{ versions: Versions }>(`${this.tree(id)}/changes`, c));
  }
  importTree(id: string, b: ImportBody) { return firstValueFrom(this.http.post<TreeResponse>(`${this.tree(id)}/import`, b)); }
  /** Settings need an editor; `name` needs an owner. */
  updateTree(id: string, patch: Partial<TreeSettings> & { name?: string }) {
    return firstValueFrom(this.http.patch<TreeInfo>(this.tree(id), patch));
  }
  listMembers(id: string) { return firstValueFrom(this.http.get<MemberRow[]>(`${this.tree(id)}/members`)); }
  /** Owners. Returns the updated list. */
  addMember(id: string, email: string, role: Role) {
    return firstValueFrom(this.http.post<MemberRow[]>(`${this.tree(id)}/members`, { email, role }));
  }
  changeRole(id: string, email: string, role: Role) {
    return firstValueFrom(this.http.patch<MemberRow[]>(`${this.tree(id)}/members/${encodeURIComponent(email)}`, { role }));
  }
  removeMember(id: string, email: string) {
    return firstValueFrom(this.http.delete<MemberRow[]>(`${this.tree(id)}/members/${encodeURIComponent(email)}`));
  }
  /** Any member except the last owner. */
  leaveTree(id: string) { return firstValueFrom(this.http.delete<{ left: string }>(`${this.tree(id)}/members/me`)); }
  /** "This is me". Owners are linked at once; everyone else waits for an owner to approve. */
  claimPerson(id: string, personId: string) {
    return firstValueFrom(this.http.put<YouResponse>(`${this.tree(id)}/members/me/claim`, { personId }));
  }
  withdrawClaim(id: string) { return firstValueFrom(this.http.delete<YouResponse>(`${this.tree(id)}/members/me/claim`)); }
  unlinkMe(id: string) { return firstValueFrom(this.http.delete<YouResponse>(`${this.tree(id)}/members/me/person`)); }
  /** Owners: link a member to a person (this approves their claim). Returns the updated list. */
  linkMember(id: string, email: string, personId: string) {
    return firstValueFrom(this.http.put<MemberRow[]>(`${this.tree(id)}/members/${encodeURIComponent(email)}/person`, { personId }));
  }
  unlinkMember(id: string, email: string) {
    return firstValueFrom(this.http.delete<MemberRow[]>(`${this.tree(id)}/members/${encodeURIComponent(email)}/person`));
  }
  /** Owners: turn down a member's pending claim. */
  rejectClaim(id: string, email: string) {
    return firstValueFrom(this.http.delete<MemberRow[]>(`${this.tree(id)}/members/${encodeURIComponent(email)}/claim`));
  }
  /** Owners only; `confirm` must be the tree's exact name. */
  deleteTree(id: string, confirm: string) {
    return firstValueFrom(this.http.delete<{ deleted: string }>(this.tree(id), { params: { confirm } }));
  }
}

/** HTTP status of a failed call (0 when the server could not be reached). */
export function statusOf(e: unknown): number {
  return e instanceof HttpErrorResponse ? e.status : -1;
}

/** A message for the user: the server's own wording when it sent one. */
export function messageOf(e: unknown): string {
  if (e instanceof HttpErrorResponse) {
    if (typeof e.error?.error === 'string') return e.error.error;
    if (e.status === 0) return 'Could not reach the server. Check your connection and try again.';
    return `The server answered ${e.status} ${e.statusText}.`.trim();
  }
  return e instanceof Error ? e.message : String(e);
}
