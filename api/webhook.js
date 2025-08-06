// api/webhook.js

export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).send('Webhook GET OK');
    return;
  }

  if (req.method === 'POST') {
    try {
      // 本来は req.body.events を使うが、まず動作確認のため固定レスポンス
      console.log('Received POST', req.body);

      // 実際のLINE Bot処理を書く前に200を返す
      res.status(200).json({ status: 'received' });
    } catch (error) {
      console.error('Error in webhook:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  } else {
    res.status(405).send('Method Not Allowed');
  }
}
