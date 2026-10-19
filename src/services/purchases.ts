/**
 * Subscriptions via RevenueCat (cross-platform entitlements).
 *
 * - Prices, periods and trial terms always come from the store via offerings —
 *   nothing is hard-coded.
 * - A purchase is only treated as successful once the returned CustomerInfo
 *   contains the active entitlement.
 * - Server-side features (AI allowance, cloud sync) re-check entitlement in the
 *   backend, which is updated by the RevenueCat webhook Edge Function.
 * - In Expo Go the SDK runs in preview mode; real purchases need a dev build.
 */
import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';

import { env } from '@/config/env';
import { FREE_ENTITLEMENT, useAppStore, type Entitlement } from '@/state/app-store';

let configured = false;

function apiKey(): string {
  return Platform.OS === 'ios' ? env.revenueCatIosKey : Platform.OS === 'android' ? env.revenueCatAndroidKey : '';
}

export function isPurchasesConfigured(): boolean {
  return apiKey().length > 0;
}

export function entitlementFrom(info: CustomerInfo): Entitlement {
  const active = info.entitlements.active[env.revenueCatEntitlement];
  if (!active) return { ...FREE_ENTITLEMENT, managementUrl: info.managementURL ?? null };
  return {
    premium: true,
    source: 'store',
    expiresAt: active.expirationDate ?? null,
    willRenew: active.willRenew,
    managementUrl: info.managementURL ?? null,
  };
}

function apply(info: CustomerInfo): Entitlement {
  const e = entitlementFrom(info);
  if (useAppStore.getState().entitlement.source !== 'developer') useAppStore.getState().setEntitlement(e);
  return e;
}

export async function initPurchases(appUserId?: string | null): Promise<void> {
  if (configured || !isPurchasesConfigured()) return;
  try {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey: apiKey(), appUserID: appUserId ?? undefined });
    configured = true;
    Purchases.addCustomerInfoUpdateListener(apply);
    apply(await Purchases.getCustomerInfo());
  } catch (error) {
    console.warn('[purchases] init failed', error);
  }
}

export async function refreshEntitlement(): Promise<Entitlement | null> {
  if (!configured) return null;
  try {
    return apply(await Purchases.getCustomerInfo());
  } catch (error) {
    console.warn('[purchases] refresh failed', error);
    return null;
  }
}

export interface PlanOffer {
  id: string;
  title: string;
  price: string;
  period: string;
  periodLabel: string;
  intro: string | null;
  pkg: PurchasesPackage;
}

const PERIOD_LABELS: Record<string, string> = {
  P1W: 'week',
  P1M: 'month',
  P3M: '3 months',
  P6M: '6 months',
  P1Y: 'year',
};

export async function getOffers(): Promise<PlanOffer[]> {
  if (!configured) return [];
  const offerings = await Purchases.getOfferings();
  const current = offerings.current;
  if (!current) return [];
  return current.availablePackages.map((pkg) => {
    const p = pkg.product;
    const period = p.subscriptionPeriod ?? '';
    const intro = p.introPrice
      ? `${p.introPrice.priceString} for ${p.introPrice.periodNumberOfUnits} ${p.introPrice.periodUnit.toLowerCase()}${
          p.introPrice.periodNumberOfUnits > 1 ? 's' : ''
        }`
      : null;
    return {
      id: pkg.identifier,
      title: p.title,
      price: p.priceString,
      period,
      periodLabel: PERIOD_LABELS[period] ?? (period ? period : 'one-time'),
      intro,
      pkg,
    };
  });
}

export type PurchaseOutcome = 'success' | 'cancelled' | 'pending' | 'not-entitled';

export async function purchase(offer: PlanOffer): Promise<PurchaseOutcome> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(offer.pkg);
    return apply(customerInfo).premium ? 'success' : 'not-entitled';
  } catch (error) {
    const e = error as { userCancelled?: boolean; code?: string };
    if (e.userCancelled) return 'cancelled';
    if (e.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return 'pending';
    throw error;
  }
}

export async function restorePurchases(): Promise<Entitlement> {
  if (!configured) throw new Error('Purchases are not configured in this build.');
  return apply(await Purchases.restorePurchases());
}

/** Links purchases to the signed-in account so they follow the user across devices. */
export async function identifyPurchaser(userId: string | null): Promise<void> {
  if (!configured) return;
  try {
    if (userId) apply((await Purchases.logIn(userId)).customerInfo);
    else if (!(await Purchases.isAnonymous())) apply(await Purchases.logOut());
  } catch (error) {
    console.warn('[purchases] identify failed', error);
  }
}

/** Development-only override so premium screens can be tested without a store. */
export function setDeveloperPremium(enabled: boolean): void {
  if (!__DEV__) return;
  useAppStore.getState().setEntitlement(
    enabled
      ? { premium: true, source: 'developer', expiresAt: null, willRenew: null, managementUrl: null }
      : FREE_ENTITLEMENT,
  );
  if (!enabled) void refreshEntitlement();
}
