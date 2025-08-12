// /api/webhook.js
import { Client, middleware, validateSignature } from '@line/bot-sdk';

// === 設定 ===
const CONFIG = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET, // 署名検証したい場合に設定
  introCooldownMs: 20_000, // 初回挨拶の重複トリガ抑止時間
  stepDelayMs: 5_000,      // 各メッセージの間隔
};

// === クライアント ===
const client = new Client({ channelAccessToken: CONFIG.channelAccessToken });

// === ユーティリティ ===
const pendingTimers = new Map(); // userId -> { timers: number[], lastIntroAt: number }

function norm(text = '') {
  // 全空白やゼロ幅空白を除去、ハイフン類を '-' に、英小文字化
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '')            // zero-width
    .replace(/\s+/g, '')                               // spaces
    .replace(/[\u2010-\u2015\u2212\u30FC\uFF0D]/g, '-')// hyphens to '-'
    .toLowerCase();
}

async function getName(userId, fallback = '協力者様') {
  try {
    const p = await client.getProfile(userId);
    return p.displayName || fallback;
  } catch {
    return fallback;
  }
}

function schedule(userId, fn, delayMs) {
  const t = setTimeout(fn, delayMs);
  const state = pendingTimers.get(userId) || { timers: [], lastIntroAt: 0 };
  state.timers.push(t);
  pendingTimers.set(userId, state);
  return t;
}

function clearAllTimers(userId) {
  const state = pendingTimers.get(userId);
  if (!state) return;
  state.timers.forEach(clearTimeout);
  pendingTimers.delete(userId);
}

function canTriggerIntro(userId) {
  const now = Date.now();
  const state = pendingTimers.get(userId);
  if (!state) return true;
  return now - (state.lastIntroAt || 0) > CONFIG.introCooldownMs;
}

function markIntroTriggered(userId) {
  const state = pendingTimers.get(userId) || { timers: [], lastIntroAt: 0 };
  state.lastIntroAt = Date.now();
  pendingTimers.set(userId, state);
}

// === 演出送信 ===
function sendIntroWithDelays(userId, name) {
  markIntroTriggered(userId);
  clearAllTimers(userId); // 念のためクリアしてから開始

  client.pushMessage(userId, {
    type: 'text',
    text: `…${name}さん、ですよね？\n（間違っていたらすみません）`
  });

  schedule(userId, () => {
    client.pushMessage(userId, {
      type: 'text',
      text: `急に失礼します。\n私は空白社の調査部に所属している者です。\nあなたにしかお願いできないことがあって、連絡しました。`
    });
  }, CONFIG.stepDelayMs);

  schedule(userId, () => {
    client.pushMessage(userId, {
      type: 'text',
      text: `今朝、"明日の記録"がこちらに届きました。\n\nまだ起きていないはずの出来事が、なぜか克明に書かれています。`
    });
  }, CONFIG.stepDelayMs * 2);

  schedule(userId, () => {
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
  }, CONFIG.stepDelayMs * 3);
}

function sendAfterAcceptWithDelays(userId, name) {
  clearAllTimers(userId); // 新セクション開始時は一旦全クリア（重複抑止）

  client.pushMessage(userId, { type: 'text', text: `${name}さん、ありがとうございます。` });

  schedule(userId, () => {
    client.pushMessage(userId, { type: 'text', text: 'では、“明日の記録”の準備をします。' });
  }, CONFIG.stepDelayMs);

  schedule(userId, () => {
    client.pushMessage(userId, { type: 'text', text: '準備が整い次第、お送りします。' });
  }, CONFIG.stepDelayMs * 2);

  // ここに“明日の記録”本編への遷移を後で差し込み可
}

// === メインハンドラ ===
export default async function handler(req, res) {
  // 1) メソッドチェック
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  // 2) 署名検証（任意だが推奨）
  if (CONFIG.channelSecret) {
    const signature = req.headers['x-line-signature'];
    const body = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(JSON.stringify(req.body || {}));
    if (!signature || !validateSignature(body, CONFIG.channelSecret, signature)) {
      res.status(401).send('Invalid signature');
      return;
    }
  }

  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  // すぐ返す（サーバーレスのタイムアウト回避）
  res.status(200).end();

  // 非同期処理をキック
  await Promise.allSettled(events.map(async (event) => {
    const userId = event.source?.userId;
    if (!userId) return;

    // 友だち追加 → 初回挨拶（重複ガード）
    if (event.type === 'follow') {
      if (!canTriggerIntro(userId)) return;
      const name = await getName(userId);
      sendIntroWithDelays(userId, name);
      return;
    }

    // テキストメッセージ
    if (event.type === 'message' && event.message?.type === 'text') {
      const text = norm(event.message.text || '');
      const name = await getName(userId);

      // 手動トリガ（広めに吸収）
      if (text.includes('スタート') || text.includes('はじめる') || text === 'start' || text === 'begin') {
        if (!canTriggerIntro(userId)) {
          await client.pushMessage(userId, { type: 'text', text: '案内中です。少しお待ちください。' });
          return;
        }
        sendIntroWithDelays(userId, name);
        return;
      }

      // 受け取る → 次導線へ
      if (text.includes('受け取る')) {
        sendAfterAcceptWithDelays(userId, name);
        return;
      }

      // 断る → タイマー全停止して終了
      if (text.includes('断る')) {
        clearAllTimers(userId);
        await client.pushMessage(userId, {
          type: 'text',
          text: '了解しました。記録の受け取りはいつでも再開できます。\n必要になったら「はじめる」または「スタート」と送ってください。'
        });
        return;
      }

      // デフォルトガイド
      await client.pushMessage(userId, {
        type: 'text',
        text: 'メニュー：\n・「はじめる」…初回のご案内\n・「受け取る」…“明日の記録”の受け取り\n・「断る」…今回は中止する'
      });
    }
  }));
}
