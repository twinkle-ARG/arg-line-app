// /api/webhook.js
import { Client } from '@line/bot-sdk';

export default async function handler(req, res) {
  const client = new Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  });

  // === キーワード正規化（全角→半角、記号整理） ===
  const z2hMap = (() => {
    const map = {};
    for (let i = 0; i < 10; i++) map[String.fromCharCode(0xFF10 + i)] = String(i); // ０-９
    for (let i = 0; i < 26; i++) {
      map[String.fromCharCode(0xFF21 + i)] = String.fromCharCode(0x41 + i); // Ａ-Ｚ
      map[String.fromCharCode(0xFF41 + i)] = String.fromCharCode(0x61 + i); // ａ-ｚ
    }
    // 全角/異体ハイフンを半角に
    ['\u2010', '\u2011', '\u2012', '\u2013', '\u2014', '\u2015', '\u2212', '\u30FC', '\uFF0D'].forEach(ch => {
      map[ch] = '-';
    });
    return map;
  })();

  function normalizeKbnInput(input) {
    const raw = (input || '').trim();
    const z2h = raw.split('').map(ch => z2hMap[ch] ?? ch).join('');
    const lowered = z2h.toLowerCase().replace(/\s+/g, '');
    const keyOnly = lowered.replace(/[^a-z0-9-]/g, ''); // 英数・ハイフンのみ
    const noHyphen = keyOnly.replace(/-/g, '');
    return { keyOnly, noHyphen };
  }

  // === 記録ルーティング（KBNコード） ===
  const recordRoutes = {
    'kbn-302-f01': {
      title: '【対応記録 KBN-302-F01】',
      body: [
        '部屋: 302',
        '住人: 石田 祐樹',
        '通報内容: 深夜の階段で「踏んでいないのに音が鳴る段」があるとの申告（2023/11/08）。',
        '補足: 該当時間帯の監視カメラ映像で、1段目を踏む前に“音”の波形が検出されている。',
        '対応: 廊下および階段の振動計測を実施（02:15〜02:40）。通常値より上振れ有り。',
        '次手順: 階段全段の個別センサー設置を検討中。',
      ].join('\n'),
      hint: '続きは「KBN-302-F02」を入力してください。'
    },
    'kbn302f01': 'kbn-302-f01', // ハイフン無しも許容

    'kbn-303-f01': {
      title: '【対応記録 KBN-303-F01】',
      body: [
        '部屋: 303',
        '住人: 坂本 結衣',
        '通報内容: 階段の段数が日によって変わる旨の本人申告（2024/1/19）。',
        '補足: 報告当日の朝と夜で段数計測を実施。朝は23段、夜は22段を確認。',
        '対応: 記録員立会いのもと再測定を予定。時間帯別の変化要因を調査中。',
        '次手順: 夜間（01〜03時）の連続監視カメラを設置予定。',
      ].join('\n'),
      hint: '続きは「KBN-303-F02」を入力してください。'
    },
    'kbn303f01': 'kbn-303-f01',
  };

  function resolveRecord(key) {
    const v = recordRoutes[key];
    if (!v) return null;
    if (typeof v === 'string') return recordRoutes[v] ?? null;
    return v;
  }

  const events = req.body.events;
  if (!Array.isArray(events)) {
    return res.status(500).end();
  }

  await Promise.all(events.map(async (event) => {
    if (event.type !== 'message' || event.message.type !== 'text') return;

    const rawText = event.message.text || '';
    const msg = rawText.trim().toLowerCase();

    // ユーザー名（必要なら文面に使用）
    let name = '協力者様';
    try {
      const profile = await client.getProfile(event.source.userId);
      name = profile.displayName || name;
    } catch (err) {
      console.error('プロファイル取得失敗:', err);
    }

    // === 最優先：KBNコードでの記録表示（キーワード入力のみ） ===
    const { keyOnly, noHyphen } = normalizeKbnInput(rawText);
    const record = resolveRecord(keyOnly) || resolveRecord(noHyphen);
    if (record) {
      await client.replyMessage(event.replyToken, [
        { type: 'text', text: record.title },
        { type: 'text', text: record.body },
        { type: 'text', text: record.hint }
      ]);
      return;
    }

    // === 物語導入（任意で残す） ===
    if (msg === 'スタート') {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `【空白社よりご案内】

${name} 様

本アカウントは、都市・地域に関する各種調査へのご協力をお願いする目的で開設されています。

現在、以下の調査に関して外部協力者を募集しております。

――――――――――――  
調査名称：欠番に関する記録整理業務  
調査対象：〇〇県△△市◆◆マンション  
備考：一部記録に欠落あり  
――――――――――――  

当該調査に協力を希望される方は、  
このトークに【同意します】と返信してください。`,
      });
      return;
    }

    if (msg.includes('同意')) {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `${name} 様

ご返信ありがとうございます。
本調査へのご協力を確認いたしました。

以下は対象物件における居住者リスト（抜粋）です。  
一部記録に不整合が確認されています。

──────────────  
■ 302号室｜石田 祐樹｜1984年生｜会社員  
■ 303号室｜坂本 結衣｜1992年生｜学生  
■ 　  　   ｜名前不明｜記録欠損｜分類不明  
■ 305号室｜武田 晴美｜1975年生｜無職  
──────────────

キーワード（例：KBN-302-F01 / KBN-303-F01）を入力して進めてください。`,
      });
      return;
    }

    // === プロフィール（氏名キーワード） ===
    if (msg.includes('石田') || msg.includes('祐樹')) {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `■ 石田 祐樹（いしだ・ゆうき）  
302号室｜1984年生｜会社員（営業職）  

入居日：2021年3月15日  
特記事項：  
・深夜の階段に「踏んでいないのに音が鳴る段」があると報告（2023/11/08）  
・定期提出の生活記録に空白箇所あり（本人未申告）  

※最終更新：2024年2月6日（住民協定書更新）`,
      });
      return;
    }

    if (msg.includes('坂本') || msg.includes('結衣')) {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `■ 坂本 結衣（さかもと・ゆい）  
303号室｜1992年生｜学生（休学中）  

入居日：2023年4月10日  
特記事項：  
・本人申告により階段の数が「日によって変わる」旨の報告あり（2024/1/19）  
・集合ポストに「宛先のない封筒」が週に1回投函されていると記録  

※最終更新：2024年5月22日（提出書類訂正）`,
      });
      return;
    }

    if (msg.includes('武田') || msg.includes('晴美')) {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `■ 武田 晴美（たけだ・はるみ）  
305号室｜1975年生｜無職（元清掃員）  

入居日：2019年12月1日  
特記事項：  
・「夜中2時にだけ、廊下の光が右奥からしか届かない」と複数回申告  
・302号室のドアが「内側から何かに押されている感じがする」と独自報告（未確認）  
・廊下奥の壁に「鳴き声のようなものが響く」と書かれた手紙を拾得したと報告（2023/12/3）  
　※これに関しては【KBN-305-F01】に整理済み

※最終更新：2023年10月5日（担当者手動補記）`,
      });
      return;
    }

    // 既存の個別記録（拾得物など）
    if (msg.includes('kbn-305-f01')) {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `【拾得物記録：KBN-305-F01】

対象住人：武田 晴美（305号室）  
記録日：2023年12月3日  
種別：拾得物報告

──────────────

武田氏による報告：  
廊下奥の壁付近で封筒を拾得。  
封筒には差出人・宛名の記載なし。  
中には鉛筆で走り書きされた手紙が一枚。  
以下の文言が含まれていた：

　「だれかが、ならしてる」  
　「きこえてるのは わたしだけ？」

手紙原本は未提出。  
内容はすべて武田氏の口頭による申告。

──────────────

備考：  
当該内容は他の証言と併せて調査継続中。  
現時点では証拠資料としての効力は保留。`,
      });
      return;
    }

    // デフォルト
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: `記録が見つかりません。対象住人の氏名や「KBN-xxx-Fyy」を入力してください。`,
    });
  }));

  res.status(200).end();
}
