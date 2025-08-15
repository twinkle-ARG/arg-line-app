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

  await Promise.all(events.map(async (event) => {
    const getName = async () => {
      try {
        const p = await client.getProfile(event.source.userId);
        return p.displayName || '受信者';
      } catch {
        return '受信者';
      }
    };

    const replyIntro = async () => {
      const text =
`【空白社｜通信記録案内】

本通信は、受信者の選定に基づき自動送信されています。  
本機構《空白社》は現在、破棄された記録の再構築プロトコル "EchoLine" を再起動中です。

あなたの受信反応が確認されました。

── 記録再構築プロトコルを開始します。  
── 初期照合キー： protocol_alpha

照合用ポータルへアクセスしてください。  
▼ https://your-arg-site/index.html`;

      const msg = {
        type: 'text',
        text,
        quickReply: {
          items: [
            {
              type: 'action',
              action: {
                type: 'message',
                label: '照合を開始する',
                text: '照合を開始する'
              }
            },
            {
              type: 'action',
              action: {
                type: 'message',
                label: '拒否する',
                text: '拒否する'
              }
            }
          ]
        }
      };

      if (event.replyToken) {
        await client.replyMessage(event.replyToken, msg);
      } else {
        await client.pushMessage(event.source.userId, msg);
      }
    };

    // イベント処理開始
    if (event.type === 'follow') {
      await replyIntro();
      return;
    }

    if (event.type === 'message' && event.message?.type === 'text') {
      const raw = event.message.text || '';
      const lower = raw.trim().toLowerCase();
      const name = await getName();

      // スタート再トリガー
      if (raw.includes('スタート') || raw.includes('思い出す') || lower === 'start') {
        await replyIntro();
        return;
      }

      // 照合開始
      if (raw.includes('照合') || raw.includes('受け取る')) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `${name}さん、ありがとうございます。  
通信記録“EchoLine”の照合を開始します。  
初期キーワード：protocol_alpha を照合ポータルで入力してください。`
        });
        return;
      }

      // 拒否
      if (raw.includes('拒否') || raw.includes('断る')) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '照合拒否を確認しました。必要になったら「照合を開始する」または「スタート」と送ってください。'
        });
        return;
      }

      // それ以外のメッセージ
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text:
`メニュー：
・「照合を開始する」…記録の再構築を開始します
・「拒否する」…中止する
・「スタート」または「思い出す」…再開`
      });
      return;
    }
  }));

  res.status(200).end();
}
