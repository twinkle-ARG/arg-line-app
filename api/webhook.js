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

      // ユーザーのプロフィールを取得（表示名を宛名に使用）
      let name = '協力者様';
      try {
        const profile = await client.getProfile(event.source.userId);
        name = profile.displayName || name;
      } catch (err) {
        console.error('プロファイル取得失敗:', err);
      }

      // ▼ 「スタート」→ 調査依頼メッセージ（名前入り）
      if (msg === '調査開始') {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `【空白社よりご案内】

${name} 様

本アカウントは、都市・地域に関する各種調査へのご協力をお願いする目的で開設されています。

現在、以下の調査に関して外部協力者を募集しております。

――――――――――――  
調査名称：欠番に関する記録整理業務  
調査対象：〇〇県△△市◆◆マンション  
備考：一部記録に欠落あり  
――――――――――――  

当該調査に協力を希望される方は、  
このトークに【同意します】と返信してください。

※本調査は空白社が独自に実施するものであり、対象物件の管理者・関係機関との直接的関係はありません。`,
        });
        return;
      }

      // ▼ 「同意」含む → 初回記録送信（名前入り）
      if (msg.includes('同意')) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `${name} 様

ご返信ありがとうございます。
本調査へのご協力を確認いたしました。

初回記録を送信いたします。

▶ ファイル：住民記録（第1号）  
▶ 状況：一部欠番あり

以後、順次記録を共有いたします。`,
        });
        return;
      }

      // ▼ それ以外 → デバッグ返信（今後削除可）
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `受信メッセージ: ${event.message.text}`,
      });
    }
  }));

  res.status(200).end();
}

