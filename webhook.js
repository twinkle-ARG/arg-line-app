// api/webhook.js

export default async function handler(req, res) {
  if (req.method === 'POST') {
    console.log('✅ LINE Webhook Received:', req.body);
    res.status(200).send('OK');
  } else {
    res.status(405).send('Method Not Allowed');
  }
}
