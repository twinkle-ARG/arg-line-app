const line = require('@line/bot-sdk');

module.exports = async (req, res) => {
  const client = new line.Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  });

  const events = req.body.events;
  if (!Array.isArray(events)) {
    return res.status(500).end();
  }

  await Promise.all(events.map(async (event) => {
    if (event.type === 'message' && event.message.type === 'text') {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `受信メッセージ: ${event.message.text}`,
      });
    }
  }));

  res.status(200).end();
};
