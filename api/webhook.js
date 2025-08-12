// /api/webhook.js
import { Client } from '@line/bot-sdk';

export default async function handler(req, res) {
  const client = new Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  });

  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  if (!events.length) {
    res.status(200).end();
    return;
  }

  // まとめて処理
  await Promise.all(events.map(async (event) => {
    // 表示名（失敗時はデフォルト）
    const getName = async () => {
      try {
        const p = await client.getProfile(event.source.userId);
        return p.displayName || '協力者様';
      } catch {
        return '協力者様';
      }
    };

    // 初回挨拶（1通・クイックリプライ付き）
    const replyIntro = async () => {
      const name = await getName();
      const text =
`…${name}さん、ですよね？（間違っていたらすみません）

急に失礼します。私は空白社の調査部の者です。
…${name}さんに関係があると思い連絡しました。

今朝、あなたの"明日の記録"がこちらに届きました。
まだ起きていないはずの出来事が、なぜか克明に書かれています。

まずは内容を確認してほしいのですが…受け取ってくれますか？`;

      const msg = {
        type: 'text',
        text,
        quickReply: {
          items: [
            { type: 'action', action: { type: 'message', label: '受け取る', text: '受け取る' } },
            { type: 'action', action: { type: 'message', label: '断る',   text: '断る'   } },
          ]
        }
      };
      if (event.replyToken) {
        // followやmessageに対してreplyで返す
        await client.replyMessage(event.replyToken, msg);
      } else {
        // 念のため（通常は不要）
        await client.pushMessage(event.source.userId, msg);
      }
    };

    // ===== イベント別処理 =====
    if (event.type === 'follow') {
      await replyIntro();
      return;
    }

    if (event.type === 'message' && event.message?.type === 'text') {
      const raw = event.message.text || '';
      const lower = raw.trim().toLowerCase();
      const name = await getName();

      // 手動トリガ（ゆるく判定）
      if (raw.includes('スタート') || raw.includes('はじめる') || lower === 'start') {
        await replyIntro();
        return;
      }

      // 受け取る
      if (raw.includes('受け取る')) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `${name}さん、ありがとうございます。準備が整い次第、“明日の記録”をお送りします。`
        });
        return;
      }

      // 断る
      if (raw.includes('断る')) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '了解しました。必要になったら「スタート」または「はじめる」と送ってください。'
        });
        return;
      }

      // デフォルト
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'メニュー：\n・「スタート」/「はじめる」…初回のご案内\n・「受け取る」…“明日の記録”を受け取る\n・「断る」…中止する'
      });
      return;
    }
  }));

  res.status(200).end();
}


