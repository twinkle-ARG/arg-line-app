import { Client } from '@line/bot-sdk';

export default async function handler(req, res) {
  const client = new Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  });

  const events = req.body.events;
  if (!Array.isArray(events)) {
    return res.status(500).end();
  }

  await Promise.all(events.map(async (event) => {
    if (event.type === 'message' && event.message.type === 'text') {
      const msg = event.message.text.trim().toLowerCase();

      // ユーザー名の取得（宛名用）
      let name = '協力者様';
      try {
        const profile = await client.getProfile(event.source.userId);
        name = profile.displayName || name;
      } catch (err) {
        console.error('プロファイル取得失敗:', err);
      }

      // ▼ スタート → 調査依頼メッセージ
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
このトークに【同意します】と返信してください。

※本調査は空白社が独自に実施するものであり、対象物件の管理者・関係機関との直接的関係はありません。`,
        });
        return;
      }

      // ▼ 同意 → 初回記録の送信
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

対象行について、調査を進行中です。  
必要に応じて詳細な閲覧権限を解放します。`,
        });
        return;
      }

      // ▼ 名前検索：石田 祐樹
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

      // ▼ 名前検索：坂本 結衣
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

      // ▼ 名前検索：武田 晴美
      if (msg.includes('武田') || msg.includes('晴美')) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `■ 武田 晴美（たけだ・はるみ）  
305号室｜1975年生｜無職（元清掃員）  

入居日：2019年12月1日  
特記事項：  
・「夜中2時にだけ、廊下の光が右奥からしか届かない」と複数回申告  
・302号室のドアが「内側から何かに押されている感じがする」と独自報告（未確認）  

※最終更新：2023年10月5日（担当者手動補記）`,
        });
        return;
      }

      // ▼ 該当しないメッセージ
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `記録が見つかりません。対象住人の氏名をご確認ください。`,
      });
    }
  }));

  res.status(200).end();
}
