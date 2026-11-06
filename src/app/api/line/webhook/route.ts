import { NextRequest, NextResponse } from 'next/server';
import { resolveLineConfig, sendLineReply } from '@/lib/line/client';
import { getShopId } from '@/lib/server/repository';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const events: any[] = Array.isArray(body?.events) ? body.events : [];

    if (events.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const shopId = getShopId();
    const config = await resolveLineConfig(shopId);
    const token = config.channelAccessToken;

    for (const event of events) {
      if (event.type === 'message' && event.message?.type === 'text') {
        const text = (event.message.text || '').trim();
        if (/^(?:\/)?id$/i.test(text)) {
          const source = event.source || {};
          const targetId = source.groupId || source.roomId || source.userId;
          const targetType = source.groupId ? 'Group ID' : (source.roomId ? 'Room ID' : 'User ID');

          if (targetId && event.replyToken && token) {
            const replyText = `${targetType}: ${targetId}\n\nคุณสามารถคัดลอก ID นี้ไปใส่ในช่อง Target ID ในหน้าตั้งค่าของระบบได้ทันที`;
            await sendLineReply(token, event.replyToken, [{ type: 'text', text: replyText }]);
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    // Webhook should always return 200 OK to LINE Platform to prevent retries on errors
    console.error('Error handling LINE webhook:', err);
    return NextResponse.json({ ok: true });
  }
}
