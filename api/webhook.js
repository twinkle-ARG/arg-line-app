// /api/webhook.js
import { Client } from '@line/bot-sdk';

export default async function handler(req, res) {
  const client = new Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  });

  // --- 初回挨拶（友だち追加時 or はじめる/スタート） ---
  async function sendIntroFollow(event, name) {
    await client.replyMessage(event.replyToken, [
      { type: 'text', text: `…${name}さん、ですよね？\n（間違っていたらすみません）` },
      { type: 'text', text: `急に失礼します。\n私は空白社の調査部に所属している者です。\nあなたにしかお願いできないことがあって、連絡しました。` },
      { type: 'text', text: `今朝、"明日の記録"がこちらに届きました。\n\nまだ起きていないはずの出来事が、なぜか克明に書かれています。` },
      {
        type: 'text',
        text: 'まずは内容を確認してほしいのですが…\n受け取ってくれますか？',
        quickReply: {
          items: [
            { type: 'action', action: { type: 'message', label: '受け取る', text: '受け取る' } },
            { type: 'action', action: { type: 'message', label: '断る', text: '断る' } },
          ]
        }
      }
    ]);
  }

  // --- 「受け取る」後の処理 ---
  async function sendFirstRecord(event, name) {
    await client.replyMessage(event.replyToken, [
      { type: 'text', text: `${name}さん、ありがとうございます。` },
      { type: 'text', text: `では、“明日の記録”をお送りします。` },
      { type: 'text', text: `────────────\n【記録：〇〇年〇月〇日】\n（ここにシナリオ本文を記載）\n────────────` },
      { type: 'text', text: `※この記録に関する感想や気づいたことを送信してください。` }
    ]);
  }

  const events = req.body.events;
  if (!Array.isArray(events)) return res.status(500).end();

  await Promise.all(events.map(async (event) => {
    // --- 友だち追加時 ---
    if (event.type === 'follow') {
      let name = '協力者様';
      try {
        const profile = await client.getProfile(event.source.userId);
        name = profile.displayName || name;
      } catch (e) {
        console.error('プロファイル取得失敗 (follow):', e);
      }
      await sendIntroFollow(event, name);
      return;
    }

    if (event.type !== 'message' || event.message.type !== 'text') return;

    const rawText = event.message.text || '';
    const msg = rawText.trim().toLowerCase();

    // ユーザー名取得
    let name = '協力者様';
    try {
      const profile = await client.getProfile(event.source.userId);
      name = profile.displayName || name;
    } catch (err) {
      console.error('プロファイル取得失敗:', err);
    }

    // --- 初回挨拶（手動トリガー） ---
    if (msg === 'はじめる' || msg === 'スタート' || msg === 'start') {
      await sendIntroFollow(event, name);
      return;
    }

    // --- 受け取る／断る ---
    if (msg.includes('受け取る')) {
      await sendFirstRecord(event, name);
      return;
    }
    if (msg.includes('断る')) {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: '了解しました。記録の受け取りはいつでも再開できます。\n必要になったら「はじめる」または「スタート」と送ってください。'
      });
      return;
    }

    // --- その他のメッセージ（暫定） ---
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: '入力を受け付けました。現在は記録受け取りモードのみ利用可能です。',
    });
  }));

  res.status(200).end();
}
