// /api/webhook.js
import { Client } from '@line/bot-sdk';

export default async function handler(req, res) {
  // --- LINE SDK クライアント ---
  const client = new Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  });

  // --- ユーザー名取得 ---
  async function getDisplayName(userId, fallback = '協力者様') {
    try {
      const profile = await client.getProfile(userId);
      return profile.displayName || fallback;
    } catch (e) {
      console.error('getProfile 失敗:', e);
      return fallback;
    }
  }

  // --- 初回挨拶：5秒ごとに段階送信（pushMessageのみ使用） ---
  function sendIntroWithDelays(userId, name) {
    // 1通目（即時）
    client.pushMessage(userId, {
      type: 'text',
      text: `…${name}さん、ですよね？\n（間違っていたらすみません）`
    });

    // 2通目（+5秒）
    setTimeout(() => {
      client.pushMessage(userId, {
        type: 'text',
        text: `急に失礼します。\n私は空白社の調査部に所属している者です。\nあなたにしかお願いできないことがあって、連絡しました。`
      });
    }, 5000);

    // 3通目（+10秒）
    setTimeout(() => {
      client.pushMessage(userId, {
        type: 'text',
        text: `今朝、"明日の記録"がこちらに届きました。\n\nまだ起きていないはずの出来事が、なぜか克明に書かれています。`
      });
    }, 10000);

    // 4通目（+15秒）※クイックリプライ付き
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

  // --- 「受け取る」後の暫定返答（5秒間隔で軽く演出：必要なら後で本文に差し替え） ---
  function sendAfterAcceptWithDelays(userId, name) {
    client.pushMessage(userId, {
      type: 'text',
      text: `${name}さん、ありがとうございます。`
    });

    setTimeout(() => {
      client.pushMessage(userId, {
        type: 'text',
        text: 'では、“明日の記録”の準備をします。'
      });
    }, 5000);

    setTimeout(() => {
      client.pushMessage(userId, {
        type: 'text',
        text: '準備が整い次第、お送りします。'
      });
    }, 10000);
  }

  // --- 本体: Webhook 受信 ---
  const events = req.body?.events;
  if (!Array.isArray(events)) {
    return res.status(500).end();
  }

  // すぐ 200 を返す（遅延送信はバックグラウンドで実行）
  res.status(200).end();

  await Promise.all(events.map(async (event) => {
    // 友だち追加時：初回挨拶を5秒間隔で送信
    if (event.type === 'follow') {
      const name = await getDisplayName(event.source.userId);
      sendIntroWithDelays(event.source.userId, name);
      return;
    }

    // テキストメッセージ時
    if (event.type === 'message' && event.message?.type === 'text') {
      const raw = event.message.text || '';
      const msg = raw.trim().toLowerCase();
      const name = await getDisplayName(event.source.userId);

      // 手動トリガ：初回挨拶（はじめる／スタート）
      if (msg === 'はじめる' || msg === 'スタート' || msg === 'start') {
        sendIntroWithDelays(event.source.userId, name);
        return;
      }

      // 受け取る → 次の導線（本文は後で差し替え可能）
      if (msg.includes('受け取る')) {
        sendAfterAcceptWithDelays(event.source.userId, name);
        return;
      }

      // 断る → 丁寧に終了
      if (msg.includes('断る')) {
        await client.pushMessage(event.source.userId, {
          type: 'text',
          text: '了解しました。記録の受け取りはいつでも再開できます。\n必要になったら「はじめる」または「スタート」と送ってください。'
        });
        return;
      }

      // デフォルト返信（ガイド）
      await client.pushMessage(event.source.userId, {
        type: 'text',
        text: 'メニュー：\n・「はじめる」…初回のご案内\n・「受け取る」…“明日の記録”の受け取り\n・「断る」…今回は中止する'
      });
    }
  }));
}

