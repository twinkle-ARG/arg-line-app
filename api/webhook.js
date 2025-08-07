import { Client } from '@line/bot-sdk';

export default async function handler(req, res) {
  const client = new Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  });

  const events = req.body.events;
  if (!Array.isArray(events)) {
    return res.status(500).end();
  }

  await Promise.all(events.map(async (event) => {
    if (event.type === 'message' && event.message.type === 'text') {
      const msg = event.message.text.trim().toLowerCase();

      // ▼ 「スタート」→ 初回調査依頼メッセージ
      if (msg === 'スタート') {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `【空白社 地域記録保全課】

このたび、貴殿に都市環境調査プロジェクトへの協力をお願いしたく連絡いたしました。

対象物件：△△市◆◆マンション  
特記：記録上に存在しない「部屋番号の欠落」

調査に協力される方は「同意します」と返信してください。`,
        });
        return;
      }

      // ▼ 「同意」→ 初回記録送信
      if (msg.includes('同意')) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `同意確認済み。初回記録を送信します…

▶ ファイル：1件の住民記録  
▶ 状況：部屋番号の欠落を含む

（次の報告をお待ちください）`,
        });
        return;
      }

      // ▼ その他のメッセージ（デバッグ表示）
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `受信メッセージ: ${event.message.text}`,
      });
    }
  }));

  res.status(200).end();
}
