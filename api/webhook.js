export default function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).send('OK');  // ← これが必要
    return;
  }

  if (req.method === 'POST') {
    // 通常のメッセージ処理
  } else {
    res.status(405).end(); // Method Not Allowed
  }
}
