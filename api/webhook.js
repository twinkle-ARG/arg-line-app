// api/webhook.js

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const body = req.body;

    // イベントが存在するかチェック
    if (body.events && body.events.length > 0) {
      const event = body.events[0];

      // 返信トークンがあれば返信する
      const replyToken = event.replyToken;

      await fetch('https://api.line.me/v2/bot/message/reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
        },
        body: JSON.stringify({
          replyToken: replyToken,
          messages: [
            {
              type: 'text',
              text: 'こんにちは！'
            }
          ]
        })
      });
    }

    res.status(200).end();
  } else {
    res.status(405).send('Method Not Allowed');
  }
}
