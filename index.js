import { middleware, Client } from '@line/bot-sdk';

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const client = new Client(config);

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const events = req.body.events;
    const results = [];

    for (const event of events) {
      // ここにイベント処理
      if (event.type === 'message' && event.message.type === 'text') {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `受け取ったメッセージ: ${event.message.text}`
        });
      }
    }

    res.status(200).end();
  } else {
    res.status(405).end();
  }
}
