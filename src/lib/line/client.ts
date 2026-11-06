import { getAdminFirestore } from '../firebase/admin';

export interface LineConfig {
  channelAccessToken?: string;
  defaultTargetId?: string;
  attendanceTargetId?: string;
  truckTargetId?: string;
  dailySummaryEnabled?: boolean;
  dailySummaryHour?: number;
  revision?: number;
}

export interface LineSendResult {
  ok: boolean;
  mode: 'push' | 'broadcast';
  targetId?: string;
  statusCode: number;
  error?: string;
}

export class LineConfigError extends Error {
  code: string;

  constructor(code = 'LINE_NOT_CONFIGURED', message = 'ยังไม่ได้ตั้งค่า LINE Channel Access Token กรุณาตั้งค่าในแท็บตั้งค่า') {
    super(message);
    this.name = 'LineConfigError';
    this.code = code;
  }
}

/**
 * Resolves LINE configuration hierarchy:
 * 1. Firestore: shops/{shopId}/profile/line
 * 2. Fallback: Environment variables
 */
export async function resolveLineConfig(shopId = process.env.SHOP_ID || 'main'): Promise<LineConfig> {
  let docData: Record<string, any> | undefined;

  try {
    const db = getAdminFirestore();
    const docSnap = await db.collection('shops').doc(shopId).collection('profile').doc('line').get();
    if (docSnap.exists) {
      docData = docSnap.data();
    }
  } catch {
    // If database access fails in tests or offline, proceed to environment fallback
  }

  const channelAccessToken = (docData?.channelAccessToken ?? process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '').trim();
  const defaultTargetId = (docData?.defaultTargetId ?? process.env.LINE_DEFAULT_TARGET_ID ?? '').trim();
  const attendanceTargetId = (docData?.attendanceTargetId ?? process.env.LINE_ATTENDANCE_TARGET_ID ?? '').trim();
  const truckTargetId = (docData?.truckTargetId ?? process.env.LINE_TRUCK_TARGET_ID ?? '').trim();
  const dailySummaryEnabled = typeof docData?.dailySummaryEnabled === 'boolean'
    ? docData.dailySummaryEnabled
    : (process.env.LINE_DAILY_SUMMARY_ENABLED !== 'false');
  const dailySummaryHour = typeof docData?.dailySummaryHour === 'number'
    ? docData.dailySummaryHour
    : 19;
  const revision = docData?.revision ?? 1;

  return {
    channelAccessToken: channelAccessToken || undefined,
    defaultTargetId: defaultTargetId || undefined,
    attendanceTargetId: attendanceTargetId || undefined,
    truckTargetId: truckTargetId || undefined,
    dailySummaryEnabled,
    dailySummaryHour,
    revision
  };
}

/**
 * Resolves the destination target ID for a given scope.
 * If specific target is not set, falls back to defaultTargetId.
 * If neither is set, returns undefined (triggering broadcast).
 */
export function resolveTargetId(
  config: LineConfig,
  scope: 'attendance' | 'truck' | 'default'
): string | undefined {
  if (scope === 'attendance') {
    return config.attendanceTargetId || config.defaultTargetId || undefined;
  }
  if (scope === 'truck') {
    return config.truckTargetId || config.defaultTargetId || undefined;
  }
  return config.defaultTargetId || undefined;
}

/**
 * Sends a LINE push message (if targetId is provided) or broadcast message (if targetId is omitted)
 * using standard Node 20 fetch without third-party dependencies.
 */
export async function sendLinePush(
  config: LineConfig,
  messages: any[],
  targetId?: string
): Promise<LineSendResult> {
  const token = config.channelAccessToken?.trim();
  if (!token) {
    throw new LineConfigError('LINE_NOT_CONFIGURED', 'ยังไม่ได้ตั้งค่า LINE Channel Access Token กรุณาตั้งค่าในแท็บตั้งค่า');
  }

  const cleanTargetId = targetId?.trim();
  const isPush = Boolean(cleanTargetId);
  const url = isPush
    ? 'https://api.line.me/v2/bot/message/push'
    : 'https://api.line.me/v2/bot/message/broadcast';

  const body = isPush
    ? { to: cleanTargetId, messages }
    : { messages };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errorText = await res.text();
    return {
      ok: false,
      mode: isPush ? 'push' : 'broadcast',
      targetId: cleanTargetId,
      statusCode: res.status,
      error: errorText
    };
  }

  return {
    ok: true,
    mode: isPush ? 'push' : 'broadcast',
    targetId: cleanTargetId,
    statusCode: res.status
  };
}

/**
 * Sends a reply to a LINE webhook event.
 */
export async function sendLineReply(
  channelAccessToken: string,
  replyToken: string,
  messages: any[]
): Promise<boolean> {
  const token = channelAccessToken.trim();
  if (!token) {
    throw new LineConfigError('LINE_NOT_CONFIGURED', 'ยังไม่ได้ตั้งค่า LINE Channel Access Token กรุณาตั้งค่าในแท็บตั้งค่า');
  }

  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      replyToken,
      messages
    })
  });

  return res.ok;
}
