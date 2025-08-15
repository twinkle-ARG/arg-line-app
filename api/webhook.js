// /api/webhook.js
import { Client } from '@line/bot-sdk';

// ====== 短い間を置いて順送りpush（1.5s間隔） ======
function sendSequence(client, userId, messages, stepMs = 1500) {
  messages.forEach((msg, i) => setTimeout(() => client.pushMessage(userId, msg), i * stepMs));
}

// ====== 入力正規化（全角→半角・空白除去・小文字化・ハイフン統一） ======
const z2hMap = (() => {
  const map = {};
  for (let i = 0; i < 10; i++) map[String.fromCharCode(0xFF10 + i)] = String(i);
  for (let i = 0; i < 26; i++) {
    map[String.fromCharCode(0xFF21 + i)] = String.fromCharCode(0x41 + i);
    map[String.fromCharCode(0xFF41 + i)] = String.fromCharCode(0x61 + i);
  }
  ['\u2010', '\u2011', '\u2012', '\u2013', '\u2014', '\u2015', '\u2212', '\u30FC', '\uFF0D'].forEach(ch => map[ch] = '-');
  return map;
})();
function normalize(text = '') {
  const raw = text.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  const z2h = raw.split('').map(ch => z2hMap[ch] ?? ch).join('');
  return z2h.toLowerCase().replace(/\s+/g, '');
}

// ====== 簡易セッション（インメモリ） ======
const session = new Map(); // userId -> { stage, lastRecord, stop1, stop2, stop3 }

export default async function handler(req, res) {
  const client = new Client({ channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN });

  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  if (!events.length) { res.status(200).end(); return; }

  // ── ユーティリティ
  const getName = async (userId) => {
    try { const p = await client.getProfile(userId); return p.displayName || '協力者様'; }
    catch { return '協力者様'; }
  };
  const getS = (userId) => session.get(userId) || { stage: 'init', lastRecord: '', stop1: false, stop2: false, stop3: false };
  const putS = (userId, patch) => { const s = getS(userId); session.set(userId, { ...s, ...patch }); };

  // ── 文面
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

  const record2 =
`────────────
【明日の記録 #2：スーパー棚崩落】

15:21　棚列G-3、商品が一斉に揺れる。
15:22　レジ横の青いカゴが、誰も触れていないのに中央通路へ。
15:23　崩落直前のフレームだけ、青が一直線に“3つ”並ぶ。

補足：鍵は「配置」。写真を見直せ。
────────────
（ヒント：色＋物を英語で、くっつけて）`;

  const record3 =
`────────────
【明日の記録 #3：交差点接触事故】

23:10　交差点で、信号が異常点滅。
23:11　歩行者信号の点滅パターン：
… / .. / --. / -. / .- / .-..

補足：モールス信号で読める“語”が停止の鍵。
────────────
（ヒント：記号をアルファベットに）`;

  const finaleIntro =
`【最終記録】
3つの停止コードの取得を確認。

送信者の発信元識別は、あなたの端末情報と“近似”しています。
空白社はこれ以上の中継を推奨しません。`;

  const finaleChoice =
`……それでも、真相を見ますか？

（「真相を見る」/「やめる」）`;

  const finaleRevealSelf =
`【開示ログ】
送信者＝あなた。
ただし時間軸の異なる「あなた」の端末からの送信履歴を確認。

> これは、あなたが未来から自分に送った“明日のLINE”だ。`;

  const finaleRevealFriend =
`【開示ログ】
送信者＝あなたの連絡先にある“身近な人物”。
名前は伏せられているが、プロファイル一致度が閾値超過。

> それでも、あなたは受け取ってしまった。`;

  const finaleThanks =
`――停止完了。未来は、ひとまず書き換えられた。

「ありがとう。これで終わりだ。……少なくとも、今は。」

（「クリア」と送信で終了メッセージ）`;

  const clearMsg =
`【記録：停止完了】
これで“あの未来”は消えた。

……だが、記録はまだ止まらない。
私の端末には“次の明日の記録”が届いている。

いつか、あなたが誰かに“託す”ときが来るかもしれない。`;

  // ── 返信ヘルパ
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
    if (event.replyToken) await client.replyMessage(event.replyToken, msg);
    else await client.pushMessage(event.source.userId, msg);
  };

  // ── メインループ
  await Promise.all(events.map(async (event) => {
    // followで導入返したい場合：ここでreplyIntro(event, name)してもOK
    if (event.type !== 'message' || event.message?.type !== 'text') return;

    const userId = event.source.userId;
    const name = await getName(userId);
    const raw = event.message.text || '';
    const lower = raw.trim().toLowerCase();
    const msg = normalize(raw);
    const s = getS(userId);

    // 手動トリガ
    if (raw.includes('スタート') || raw.includes('はじめる') || raw.includes('思い出す') || lower === 'start') {
      await replyIntro(event, name);
      putS(userId, { stage: 'intro' });
      return;
    }

    // 補助：進捗/ログ/ヒント/リセット
    if (raw.includes('進捗') || raw.includes('ステータス')) {
      const c = (b) => b ? '✅' : '□';
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text:
`進捗：
停止コード1 ${c(s.stop1)} / 停止コード2 ${c(s.stop2)} / 停止コード3 ${c(s.stop3)}`
      });
      return;
    }
    if (raw.includes('ログ')) {
      await client.replyMessage(event.replyToken, { type: 'text', text: s.lastRecord || '再送できる記録はありません。' });
      return;
    }
    if (raw.includes('リセット')) {
      session.delete(userId);
      await client.replyMessage(event.replyToken, { type: 'text', text: '状態を初期化しました。「スタート」で再開できます。' });
      return;
    }
    if (raw.includes('ヒント')) {
      if (s.stage === 'A1') {
        await client.replyMessage(event.replyToken, { type: 'text', text: '「11-5-25-15-14-5」を A1Z26（A=1…Z=26）で変換。答えは小文字・半角英字。' });
      } else if (s.stage === 'B0') {
        await client.replyMessage(event.replyToken, { type: 'text', text: '色＋物を英語で。青 + 買い物カゴ → ？（つなげて1語）' });
      } else if (s.stage === 'C0') {
        await client.replyMessage(event.replyToken, { type: 'text', text: '…/../--./-./.-/.-.. をモールスでアルファベットに。' });
      } else if (s.stage === 'FINAL_READY') {
        await client.replyMessage(event.replyToken, { type: 'text', text: '真相が気になるなら「真相を見る」。怖いなら「やめる」。' });
      } else {
        await client.replyMessage(event.replyToken, { type: 'text', text: '今は記録に沿って進めてください。' });
      }
      return;
    }

    // 断る
    if (raw.includes('断る')) {
      await client.replyMessage(event.replyToken, { type: 'text', text: '了解しました。必要になったら「スタート」または「はじめる」と送ってください。' });
      putS(userId, { stage: 'stopped' });
      return;
    }

    // 受け取る → 死亡演出
    if (raw.includes('受け取る') || raw.includes('確認')) {
      await client.replyMessage(event.replyToken, { type: 'text', text: `${name}さん、ありがとうございます。最新の記録データを送信します。` });
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
      putS(userId, { stage: 'death_shown', lastRecord: deathRecord });
      return;
    }

    // 受け入れる（中断）
    if (raw.includes('受け入れる')) {
      await client.replyMessage(event.replyToken, { type: 'text', text: '……記録を閉じます。必要になったら「思い出す」と送ってください。' });
      putS(userId, { stage: 'accepted' });
      return;
    }

    // 書き換える → 記録#1
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
              { type: 'action', action: { type: 'message', label: '進捗',   text: '進捗'   } },
            ]
          }
        }
      ]);
      putS(userId, { stage: 'A1', lastRecord: record1 });
      return;
    }

    // ===== キーワード判定 =====
    // A1Z26 -> keyone
    if (normalize(raw) === 'keyone') {
      await client.replyMessage(event.replyToken, [
        { type: 'text', text: '【停止コード1 取得】\n入力確認：keyone\n駅ホームの固定は解除済み。' },
        {
          type: 'text', text: record2,
          quickReply: { items: [
            { type: 'action', action: { type: 'message', label: 'ヒント', text: 'ヒント' } },
            { type: 'action', action: { type: 'message', label: 'ログ',   text: 'ログ'   } },
            { type: 'action', action: { type: 'message', label: '進捗',   text: '進捗'   } },
          ] }
        }
      ]);
      putS(userId, { stage: 'B0', lastRecord: record2, stop1: true });
      return;
    }

    // 色+物 → bluebasket
    if (normalize(raw) === 'bluebasket') {
      await client.replyMessage(event.replyToken, [
        { type: 'text', text: '【停止コード2 取得】\n入力確認：bluebasket\n棚崩落の固定は解除済み。' },
        {
          type: 'text', text: record3,
          quickReply: { items: [
            { type: 'action', action: { type: 'message', label: 'ヒント', text: 'ヒント' } },
            { type: 'action', action: { type: 'message', label: 'ログ',   text: 'ログ'   } },
            { type: 'action', action: { type: 'message', label: '進捗',   text: '進捗'   } },
          ] }
        }
      ]);
      putS(userId, { stage: 'C0', lastRecord: record3, stop2: true });
      return;
    }

    // モールス …/../--./-./.-/.-.. → signal
    if (normalize(raw) === 'signal') {
      putS(userId, { stop3: true });

      // 3つ集まったら最終へ
      const ns = getS(userId);
      if (ns.stop1 && ns.stop2 && ns.stop3) {
        sendSequence(client, userId, [
          { type: 'text', text: '【停止コード3 取得】\n入力確認：signal\n交差点の固定は解除済み。' },
          { type: 'text', text: finaleIntro },
          {
            type: 'text',
            text: finaleChoice,
            quickReply: {
              items: [
                { type: 'action', action: { type: 'message', label: '真相を見る', text: '真相を見る' } },
                { type: 'action', action: { type: 'message', label: 'やめる',     text: 'やめる'     } },
              ]
            }
          }
        ], 1500);
        putS(userId, { stage: 'FINAL_READY', lastRecord: finaleIntro });
      } else {
        await client.replyMessage(event.replyToken, { type: 'text', text: '【停止コード3 取得】\n入力確認：signal\n（残りの停止コードを集めてください）' });
        putS(userId, { lastRecord: '【停止コード3 取得】' });
      }
      return;
    }

    // 最終分岐
    if (raw.includes('やめる')) {
      await client.replyMessage(event.replyToken, { type: 'text', text: '中継を終了します。必要になったら「思い出す」と送ってください。' });
      putS(userId, { stage: 'stopped' });
      return;
    }

    if (raw.includes('真相を見る')) {
      // 送信者像の“曖昧さ”→2パターンのどちらかを提示（ランダム）
      const reveal = Math.random() < 0.5 ? finaleRevealSelf : finaleRevealFriend;
      sendSequence(client, userId, [
        { type: 'text', text: reveal },
        { type: 'text', text: finaleThanks }
      ], 1500);
      putS(userId, { stage: 'FINAL_SHOWN', lastRecord: reveal });
      return;
    }

    if (raw.includes('クリア')) {
      await client.replyMessage(event.replyToken, [
        { type: 'text', text: clearMsg },
        { type: 'text', text: '（再プレイ：『スタート』／ 状況確認：『進捗』／ 最終ログ：『ログ』）' }
      ]);
      putS(userId, { stage: 'CLEARED' });
      return;
    }

    // デフォルト誘導
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text:
'入力を受け付けました。\n' +
'・「スタート」/「はじめる」…初回のご案内\n' +
'・「受け取る」…記録の受け取り\n' +
'・「書き換える」…最初の断片へ\n' +
'・「ヒント」/「ログ」/「進捗」/「リセット」…補助'
    });
  }));

  res.status(200).end();
}
