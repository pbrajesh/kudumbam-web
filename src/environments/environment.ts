// Values that are safe to ship to the browser. Never put a Supabase secret key (sb_secret_…) here.
export const environment = {
  /** Name shown in the header, sign-in screen and browser tab. */
  appName: 'Kudumbam',
  /** Email for privacy questions and account-removal requests, shown on the privacy page. Empty: not shown. */
  privacyContact: '',
  /** Supabase project URL (Project Settings → API). Used for sign-in only. */
  supabaseUrl: 'https://vyzygojjbhxqcpknasmm.supabase.co',
  /** Supabase publishable key (sb_publishable_…). Public by design. */
  supabasePublishableKey: 'sb_publishable_ZCrlAgoivFpk4Yspayr3NA_VY9GAYN7',
  /** Where the API server is. Empty: same origin, which in development is the Angular proxy to localhost:3000. */
  apiUrl: '',
};
