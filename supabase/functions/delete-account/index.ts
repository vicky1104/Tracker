/**
 * Permanently deletes the calling user's account and all of their server-side
 * data. Every user-owned table references auth.users with ON DELETE CASCADE,
 * so deleting the auth user removes lists, habits, schedules, reminders,
 * completions, settings, entitlement rows and AI usage records.
 *
 * Store subscriptions are managed by Apple/Google and must be cancelled there;
 * the app tells the user this before they confirm.
 */
import { adminClient, corsHeaders, getCaller, json } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const user = await getCaller(req);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const { error } = await adminClient().auth.admin.deleteUser(user.id);
  if (error) {
    console.error('delete-account failed', error.message);
    return json({ error: 'server_error' }, 500);
  }
  return json({ deleted: true });
});
