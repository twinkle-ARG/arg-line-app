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

      // ユーザーの表示名取得（宛名用）
      let name = '協力者様';
      try {
        const profile = await client.getProfile(event.source.userId);
        name = profile.displayName || name;
      } catch (err) {
        console.error('プロファイル取得失敗:', err);
      }

      // ▼ 「スタート」→ 空白社からの調査依頼
      if (msg === 'スタート') {
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

      // ▼ 「同意」→ 初回記録の送信
      if (msg.includes('同意')) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `${name} 様

ご返信ありがとうございます。
本調査へのご協力を確認いたしました。

以下は対象物件における居住者リスト（抜粋）です。  
一部記録に不整合が確認されています。

──────────────  
■ 302号室｜石田 祐樹｜1984年生｜会社員  
■ 303号室｜坂本 結衣｜1992年生｜学生  
■ 　  　   ｜名前不明｜記録欠損｜分類不明  
■ 305号室｜武田 晴美｜1975年生｜無職  
──────────────

対象行について、調査を進行中です。  
必要に応じて詳細な閲覧権限を解放します。`,
        });
        return;
      }

      // ▼ その他（今後の発展用：不明ワード）
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `受信メッセージ: ${event.message.text}`,
      });
    }
  }));

  res.status(200).end();
}
