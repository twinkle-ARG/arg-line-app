const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// LINEのWebhookを受け取るエンドポイント
app.post("/webhook", (req, res) => {
  console.log("📩 Webhook received:", JSON.stringify(req.body));
  res.send("OK");
});

app.get("/", (req, res) => {
  res.send("LINE Bot Server is running.");
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
