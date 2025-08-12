// /api/webhook.js
import { Client } from '@line/bot-sdk';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

// ====== 簡易デバウンス ======
const seenEvents = new Set();                 // 直近イベントID（60秒保持）
const introCooldown = new Map();              // userId -> lastIntroAt(ms)
const INTRO_COOLDOWN_MS = 25_000;             // 初回挨拶の再発火抑止

function markEventSeen(id) {
  seenEvents.add(id);
  setTimeout(() => seenEvents.delete(id), 60_000);
}
function isEventSeen(id) {
  return seenEvents.has(id);
}
function canStartIntro(userId) {
  const last = introCooldown.get(userId) || 0;
  return Date.now() - last > INTRO_COOLDOWN_MS;
}
function markIntro(userId) {
  introCooldown.set(userId, Date.now());
}

// ====== 名前取得 ======
async function getName(userId) {
  try {
    const p = await client.getProfile(userId);
    return p.displayName || '協力者様';
  } catch {
    return '協力者様';
  }
}

// ====== 初回挨拶（5秒間隔） ======
function sendIntro(userId, name) {
  markIntro(userId);

  client.pushMessage(userId, {
    type: 'text',
    text: `…${name}さん、ですよね？\n（間違っていたらすみません）`
  });

  setTimeout(() => {
    client.pushMessage(userId, {
      type: 'text',
      text: `急に失礼します。\n私は空白社の調査部に所属している者です。\nあなたにしかお願いできないことがあって、連絡しました。`
    });
  }, 5000);

  setTimeout(() => {
    client.pushMessage(userId, {
      type: 'text',
      text: `今朝、"明日の記録"がこちらに届きました。\n\nまだ起きていないはずの出来事が、なぜか克明に書かれています。`
    });
  }, 10000);

  setTimeout(() => {
    client.pushMessage(userId, {
      type: 'text',
      text: 'まずは内容を確認してほしいのですが…\n受け取ってくれますか？',
      quickReply: {
        items: [
          { type: 'action', action: { type: 'message', label: '受け取る', text: '受け取る' } },
          { type: 'action', action: { type: 'message', label: '断る', text: '断る' } },
        ]
      }
    });
  }, 15000);
}

// ====== 受け取る（簡易・5秒間隔） ======
function sendAfterAccept(userId, name) {
  client.pushMessage(userId, { type: 'text', text: `${name}さん、ありがとうございます。` });
  setTimeout(() => client.pushMessage(userId, { type: 'text', text: 'では、“明日の記録”の準備をします。' }), 5000);
  setTimeout(() => client.pushMessage(userId, { type: 'text', text: '準備が整い次第、お送りします。' }), 10000);
}

// ====== ハンドラ ======
export default async function handler(req, res) {
  // すぐに 200 を返す（遅延送信のため）
  res.status(200).end();

  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  if (!events.length) return;

  await Promise.allSettled(events.map(async (event) => {
    const userId = event.source?.userId;
    if (!userId) return;

    // --- イベント重複チェック（message.id or replyToken を使う） ---
    const eventId = event.message?.id || event.replyToken || `${event.type}-${Date.now()}-${Math.random()}`;
    if (isEventSeen(eventId)) return;
    markEventSeen(eventId);

    // --- follow: 初回挨拶（クールダウン適用） ---
    if (event.type === 'follow') {
      if (!canStartIntro(userId)) return;
      const name = await getName(userId);
      sendIntro(userId, name);
      return;
    }

    // --- text: コマンド処理 ---
    if (event.type === 'message' && event.message?.type === 'text') {
      const raw = event.message.text || '';
      const compact = raw.replace(/\s+/g, '').toLowerCase();
      const name = await getName(userId);

      // 手動トリガ（スタート／はじめる／start）
      if (raw.includes('スタート') || raw.includes('はじめる') || compact === 'start') {
        if (!canStartIntro(userId)) {
          await client.pushMessage(userId, { type: 'text', text: '案内中です。少しお待ちください。' });
          return;
        }
        sendIntro(userId, name);
        return;
      }

      if (raw.includes('受け取る')) {
        sendAfterAccept(userId, name);
        return;
      }

      if (raw.includes('断る')) {
        await client.pushMessage(userId, {
          type: 'text',
          text: '了解しました。必要になったら「スタート」または「はじめる」と送ってください。'
        });
        return;
      }

      // デフォルト
      await client.pushMessage(userId, {
        type: 'text',
        text: 'メニュー：\n・「スタート」/「はじめる」…初回のご案内\n・「受け取る」…“明日の記録”を受け取る\n・「断る」…今回は中止する'
      });
    }
  }));
}
