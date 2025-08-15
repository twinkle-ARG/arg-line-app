// /api/webhook.js
import { Client } from '@line/bot-sdk';

// --- 短い間を置いて順番にpushする（サーバーレス想定で短め） ---
function sendSequence(client, userId, messages, stepMs = 1500) {
  messages.forEach((msg, i) => {
    setTimeout(() => client.pushMessage(userId, msg), i * stepMs);
  });
}

// --- 全角/空白などの正規化（小文字・空白除去・全角英数→半角・ハイフン類統一）---
const z2hMap = (() => {
  const map = {};
  for (let i = 0; i < 10; i++) map[String.fromCharCode(0xFF10 + i)] = String(i); // ０-９
  for (let i = 0; i < 26; i++) {
    map[String.fromCharCode(0xFF21 + i)] = String.fromCharCode(0x41 + i); // Ａ-Ｚ
    map[String.fromCharCode(0xFF41 + i)] = String.fromCharCode(0x61 + i); // ａ-ｚ
  }
  ['\u2010', '\u2011', '\u2012', '\u2013', '\u2014', '\u2015', '\u2212', '\u30FC', '\uFF0D'].forEach(ch => map[ch] = '-');
  return map;
})();
function normalize(text = '') {
  const raw = text.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  const z2h = raw.split('').map(ch => z2hMap[ch] ?? ch).join('');
  return z2h.toLowerCase().replace(/\s+/g, '');
}

// --- セッション（簡易：インメモリ） ---
const session = new Map(); // userId -> { stage, lastRecord }

export default async function handler(req, res) {
  const client = new Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  });

  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  if (!events.length) {
    res.status(200).end();
    return;
  }

  // ユーティリティ
  const getName = async (userId) => {
    try {
      const p = await client.getProfile(userId);
      return p.displayName || '協力者様';
    } catch {
      return '協力者様';
    }
  };
  const setStage = (userId, stage) => {
    const s = session.get(userId) || {};
    s.stage = stage;
    session.set(userId, s);
  };
  const setLastRecord = (userId, text) => {
    const s = session.get(userId) || {};
    s.lastRecord = text;
    session.set(userId, s);
  };

  // 文面パーツ
  const introText = (name) =>
`…${name}さん、ですよね？（間違っていたらすみません）

急に失礼します。私は空白社の調査部の者です。
あなたに至急確認していただきたいことがあり、連絡しました。

今朝、弊社にあなたの"明日の記録"が届きました。
まだ起きていないはずの出来事が、なぜか克明に記されています。

しかし、その記録は断片的なデータにすぎず、こちらでも全容を把握できていません。

……まずは内容を確認していただけますか？`;

  const deathRecord =
`📄 記録No.002 - 20XX年8月17日 午後7時12分
📍 都内某駅 改札前

▶ 状況：本人、階段から転落し頭部を強打。
▶ 目撃者：「赤い切符を拾おうとしていた」
▶ 現場に目立った異常なし。事故として処理予定。

……記録は、ここで途切れています。`;

  const deathChoice =
`――あなたは、このまま死を受け入れますか？

それとも、“書き換える”方法を探しますか。`;

  const record1 =
`────────────
【明日の記録 #1：駅ホーム】

03:12　ホーム端。あなたの2つ隣に立つ人物。
　　　片手に、使い込まれた“赤い切符”。

03:13　アナウンスが流れる。足もとに影がもう一つ増える。
　　　スマホを狙う動き。接触は未遂で終わる。

03:14　監視カメラに切符がはっきり映る。
　　　角は摩耗、縁は黒ずみ。ナンバリングは読み取れない。

補足：記録番号　11-5-25-15-14-5
────────────
（※わかった語を小文字・半角英字で入力）`;

  // メッセージ送信ヘルパ
  const replyIntro = async (event, name) => {
    const msg = {
      type: 'text',
      text: introText(name),
      quickReply: {
        items: [
          { type: 'action', action: { type: 'message', label: '受け取る', text: '受け取る' } },
          { type: 'action', action: { type: 'message', label: '断る',   text: '断る'   } },
        ]
      }
    };
    if (event.replyToken) {
      await client.replyMessage(event.replyToken, msg);
    } else {
      await client.pushMessage(event.source.userId, msg);
    }
  };

  // 本処理
  await Promise.all(events.map(async (event) => {
    if (event.type !== 'message' || event.message?.type !== 'text') {
      // follow時に導入を返したいならここで replyIntro() を呼んでもOK
      if (event.type === 'follow') {
        const name = await getName(event.source.userId);
        await replyIntro(event, name);
      }
      return;
    }

    const userId = event.source.userId;
    const raw = event.message.text || '';
    const lower = raw.trim().toLowerCase();
    const msg = normalize(raw);
    const name = await getName(userId);
    const state = session.get(userId) || {};

    // 手動トリガ
    if (raw.includes('スタート') || raw.includes('はじめる') || raw.includes('思い出す') || lower === 'start') {
      await replyIntro(event, name);
      setStage(userId, 'intro');
      return;
    }

    // 断る
    if (raw.includes('断る')) {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: '了解しました。必要になったら「スタート」または「はじめる」と送ってください。'
      });
      setStage(userId, 'stopped');
      return;
    }

    // 受け取る → 死亡演出（短い間を置いて順送りpush）
    if (raw.includes('受け取る') || raw.includes('確認')) {
      // すぐの返信で了承
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `${name}さん、ありがとうございます。最新の記録データを送信します。`
      });

      // その後に死亡記録→問いかけを順送り
      sendSequence(client, userId, [
        { type: 'text', text: deathRecord },
        {
          type: 'text',
          text: deathChoice,
          quickReply: {
            items: [
              { type: 'action', action: { type: 'message', label: '書き換える', text: '書き換える' } },
              { type: 'action', action: { type: 'message', label: '受け入れる', text: '受け入れる' } },
            ]
          }
        }
      ], 1500);

      setStage(userId, 'death_shown');
      setLastRecord(userId, deathRecord);
      return;
    }

    // 受け入れる（バッドエンド風）
    if (raw.includes('受け入れる')) {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: '……記録を閉じます。必要になったら「思い出す」と送ってください。'
      });
      setStage(userId, 'accepted');
      return;
    }

    // 書き換える → 記録#1 送信
    if (raw.includes('書き換える')) {
      await client.replyMessage(event.replyToken, [
        { type: 'text', text: '了解しました。まずは最初の断片を送ります。' },
        {
          type: 'text',
          text: record1,
          quickReply: {
            items: [
              { type: 'action', action: { type: 'message', label: 'ヒント', text: 'ヒント' } },
              { type: 'action', action: { type: 'message', label: 'ログ',   text: 'ログ'   } },
            ]
          }
        }
      ]);
      setStage(userId, 'A1'); // 記録#1のステージ
      setLastRecord(userId, record1);
      return;
    }

    // ステージ別ヒント
    if (raw.includes('ヒント')) {
      if (state.stage === 'A1') {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '「11-5-25-15-14-5」を A1Z26（A=1, B=2…）で変換してみてください。答えは小文字・半角英字で。'
        });
      } else {
        await client.replyMessage(event.replyToken, { type: 'text', text: '今は記録に沿って進めてください。' });
      }
      return;
    }

    // ログ再送
    if (raw.includes('ログ')) {
      const last = state.lastRecord;
      if (last) {
        await client.replyMessage(event.replyToken, { type: 'text', text: last });
      } else {
        await client.replyMessage(event.replyToken, { type: 'text', text: '再送できる記録がありません。' });
      }
      return;
    }

    // --- キーワード判定（A1Z26: keyone）---
    if (msg === 'keyone') {
      // 正解処理：停止コード1 → 次導線
      await client.replyMessage(event.replyToken, [
        {
          type: 'text',
          text:
`【停止コード1 取得】
入力を確認：keyone

駅ホームでの“接触未遂”の固定は解除済み。`
        },
        {
          type: 'text',
          text:
`【次の事件B：スーパー棚崩落】
店内写真に“青い買い物カゴ”が不自然に配置されています。
写真の「配置」を鍵に、裏ページが開きます。

※分かった語を小文字で入力／「ヒント」「ログ」も使えます。`,
          quickReply: {
            items: [
              { type: 'action', action: { type: 'message', label: 'ヒント', text: 'ヒント' } },
              { type: 'action', action: { type: 'message', label: 'ログ',   text: 'ログ'   } },
            ]
          }
        }
      ]);
      setStage(userId, 'B0');
      setLastRecord(userId, '【次の事件B：スーパー棚崩落】…（写真の配置が鍵）');
      return;
    }

    // デフォルト：誘導
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text:
'入力を受け付けました。\n' +
'・「スタート」/「はじめる」…初回のご案内\n' +
'・「受け取る」…記録の受け取り\n' +
'・「書き換える」…最初の断片へ\n' +
'・「ヒント」/「ログ」…補助'
    });
  }));

  res.status(200).end();
}
