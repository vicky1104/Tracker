/**
 * RevenueCat webhook → subscription_entitlements.
 *
 * Instead of trusting the event payload, every event triggers a fetch of the
 * subscriber's current state from the RevenueCat REST API, so out-of-order or
 * duplicate deliveries always converge to the true entitlement state.
 *
 * Configure in RevenueCat: Integrations → Webhooks → URL
 *   https://<project>.functions.supabase.co/revenuecat-webhook
 * with Authorization header value = REVENUECAT_WEBHOOK_AUTH.
 * The app calls Purchases.logIn(<supabase user id>), so app_user_id is the user's UUID.
 */
import { adminClient, json, requireEnv } from '../_shared/http.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface SubscriberEntitlement {
  expires_date: string | null;
  product_identifier: string;
}
interface SubscriberSubscription {
  store?: string;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!timingSafeEqual(req.headers.get('Authorization') ?? '', requireEnv('REVENUECAT_WEBHOOK_AUTH'))) {
    return json({ error: 'unauthorized' }, 401);
  }

  let appUserId: string | undefined;
  try {
    const body = (await req.json()) as { event?: { app_user_id?: string; original_app_user_id?: string } };
    appUserId = [body.event?.app_user_id, body.event?.original_app_user_id].find((id) => id && UUID_RE.test(id));
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  // Anonymous purchasers (not signed in) have nothing to sync server-side.
  if (!appUserId) return json({ ignored: true });

  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${requireEnv('REVENUECAT_SECRET_API_KEY')}` },
  });
  if (!res.ok) {
    console.error('RevenueCat lookup failed', res.status);
    return json({ error: 'upstream_error' }, 502); // RevenueCat retries failed deliveries
  }
  const data = (await res.json()) as {
    subscriber: {
      entitlements: Record<string, SubscriberEntitlement>;
      subscriptions: Record<string, SubscriberSubscription>;
    };
  };

  const entitlementId = Deno.env.get('REVENUECAT_ENTITLEMENT') ?? 'premium';
  const ent = data.subscriber.entitlements[entitlementId];
  const sub = ent ? data.subscriber.subscriptions[ent.product_identifier] : undefined;
  const active = !!ent && (ent.expires_date == null || new Date(ent.expires_date) > new Date());

  const { error } = await adminClient()
    .from('subscription_entitlements')
    .upsert(
      {
        user_id: appUserId,
        entitlement: entitlementId,
        is_active: active,
        product_id: ent?.product_identifier ?? null,
        store: sub?.store ?? null,
        expires_at: ent?.expires_date ?? null,
        will_renew: sub ? !sub.unsubscribe_detected_at : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,entitlement' },
    );
  if (error) {
    // Unknown user (e.g. deleted account): acknowledge so RevenueCat stops retrying.
    if (error.code === '23503') return json({ ignored: true });
    console.error('entitlement upsert failed', error.message);
    return json({ error: 'server_error' }, 500);
  }
  return json({ ok: true, active });
});
