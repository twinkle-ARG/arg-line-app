// /api/webhook.js
import { Client } from '@line/bot-sdk';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

// 表示名取得（失敗時は「協力者様」）
async function getName(userId) {
  try {
    const p = await client.getProfile(userId);
    return p.displayName || '協力者様';
  } catch {
    return '協力者様';
  }
}

// 初回挨拶（5秒間隔で順送り）
function sendIntro(userId, name) {
  // 1
  client.pushMessage(userId, {
    type: 'text',
    text: `…${name}さん、ですよね？\n（間違っていたらすみません）`
  });

  // 2 (+5s)
  setTimeout(() => {
    client.pushMessage(userId, {
      type: 'text',
      text: `急に失礼します。\n私は空白社の調査部に所属している者です。\nあなたにしかお願いできないことがあって、連絡しました。`
    });
  }, 5000);

  // 3 (+10s)
  setTimeout(() => {
    client.pushMessage(userId, {
      type: 'text',
      text: `今朝、"明日の記録"がこちらに届きました。\n\nまだ起きていないはずの出来事が、なぜか克明に書かれています。`
    });
  }, 10000);

  // 4 (+15s)
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

// 「受け取る」後（暫定・5秒間隔）
function sendAfterAccept(userId, name) {
  client.pushMessage(userId, { type: 'text', text: `${name}さん、ありがとうございます。` });
  setTimeout(() => {
    client.pushMessage(userId, { type: 'text', text: 'では、“明日の記録”の準備をします。' });
  }, 5000);
  setTimeout(() => {
    client.pushMessage(userId, { type: 'text', text: '準備が整い次第、お送りします。' });
  }, 10000);
}

export default async function handler(req, res) {
  // まず 200 を返す（遅延送信でタイムアウトしないため）
  res.status(200).end();

  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  if (!events.length) return;

  // 非同期で処理（結果待たずにOK）
  await Promise.allSettled(events.map(async (event) => {
    // 友だち追加 → 初回挨拶
    if (event.type === 'follow') {
      const name = await getName(event.source.userId);
      sendIntro(event.source.userId, name);
      return;
    }

    // テキスト受信
    if (event.type === 'message' && event.message?.type === 'text') {
      const raw = event.message.text || '';
      const compact = raw.replace(/\s+/g, '').toLowerCase(); // 空白除去＋英字は小文字化
      const name = await getName(event.source.userId);

      // 初回挨拶の手動トリガ
      if (raw.includes('スタート') || raw.includes('はじめる') || compact === 'start') {
        sendIntro(event.source.userId, name);
        return;
      }

      // 分岐
      if (raw.includes('受け取る')) {
        sendAfterAccept(event.source.userId, name);
        return;
      }

      if (raw.includes('断る')) {
        await client.pushMessage(event.source.userId, {
          type: 'text',
          text: '了解しました。必要になったら「スタート」または「はじめる」と送ってください。'
        });
        return;
      }

      // デフォルト
      await client.pushMessage(event.source.userId, {
        type: 'text',
        text: 'メニュー：\n・「スタート」/「はじめる」…初回のご案内\n・「受け取る」…“明日の記録”を受け取る\n・「断る」…今回は中止する'
      });
    }
  }));
}
