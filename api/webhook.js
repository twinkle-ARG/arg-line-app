// /api/webhook.js
import { Client } from '@line/bot-sdk';

export default async function handler(req, res) {
  const client = new Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  });

  // 表示名取得
  async function getDisplayName(userId, fallback = '協力者様') {
    try {
      const profile = await client.getProfile(userId);
      return profile.displayName || fallback;
    } catch (e) {
      console.error('getProfile 失敗:', e);
      return fallback;
    }
  }

  // 文字正規化（空白除去＋低リスク整形）
  function norm(text = '') {
    const trimmed = text.trim().replace(/\s+/g, '');           // 全空白除去
    const hyphenFixed = trimmed.replace(/[\u2010-\u2015\u2212\u30FC\uFF0D]/g, '-');
    return hyphenFixed.toLowerCase();
  }

  // 初回挨拶（5秒おきに送信）
  function sendIntroWithDelays(userId, name) {
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

  // 受け取る後（暫定）
  function sendAfterAcceptWithDelays(userId, name) {
    client.pushMessage(userId, { type: 'text', text: `${name}さん、ありがとうございます。` });
    setTimeout(() => client.pushMessage(userId, { type: 'text', text: 'では、“明日の記録”の準備をします。' }), 5000);
    setTimeout(() => client.pushMessage(userId, { type: 'text', text: '準備が整い次第、お送りします。' }), 10000);
  }

  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  if (!events.length) {
    res.status(200).end();
    return;
  }

  // イベント処理をキックしてから即時200を返す
  const tasks = events.map(async (event) => {
    // 友だち追加
    if (event.type === 'follow') {
      const name = await getDisplayName(event.source.userId);
      sendIntroWithDelays(event.source.userId, name);
      return;
    }

    // テキスト
    if (event.type === 'message' && event.message?.type === 'text') {
      const name = await getDisplayName(event.source.userId);
      const msg = norm(event.message.text);

      // 手動トリガ（ゆるく一致）
      if (msg.includes('スタート') || msg.includes('はじめる') || msg === 'start') {
        sendIntroWithDelays(event.source.userId, name);
        return;
      }

      if (msg.includes('受け取る')) {
        sendAfterAcceptWithDelays(event.source.userId, name);
        return;
      }

      if (msg.includes('断る')) {
        await client.pushMessage(event.source.userId, {
          type: 'text',
          text: '了解しました。記録の受け取りはいつでも再開できます。\n必要になったら「はじめる」または「スタート」と送ってください。'
        });
        return;
      }

      // ガイド
      await client.pushMessage(event.source.userId, {
        type: 'text',
        text: 'メニュー：\n・「はじめる」…初回のご案内\n・「受け取る」…“明日の記録”の受け取り\n・「断る」…今回は中止する'
      });
    }
  });

  Promise.allSettled(tasks).finally(() => {});
  res.status(200).end();
}
