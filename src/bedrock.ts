import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

const REGION = process.env.AWS_REGION ?? "ap-northeast-1";
const MODEL_ID =
  process.env.BEDROCK_MODEL_ID ??
  "jp.anthropic.claude-haiku-4-5-20251001-v1:0";

const client = new BedrockRuntimeClient({ region: REGION });

export async function refineMenuFromImage(
  courseLabel: string,
  imagePng: Buffer
): Promise<string> {
  const prompt = `添付の画像は、コープの宅配弁当コース「${courseLabel}」の週替わりメニュー表（月〜金5日分）です。表には主菜1品と副菜が複数品、曜日ごとに列で並んでいます。

画像の一番上に日付ヘッダー行（7/6（月）〜7/10（金）など）があり、その下に赤い「今週のおすすめ」バッジが付いた行があります。**この「今週のおすすめ」の行は無視してください**。これは別枠のおすすめ商品であり「${courseLabel}」自体の献立ではありません。「${courseLabel}」という文字と3桁の品番（例: 902）が書かれた囲み枠から実際の献立が始まります。その囲み枠の中の主菜行（1行目）を各曜日の主菜、それ以降の行を副菜として扱ってください。

画像を読み取り、「${courseLabel}」の月曜日から金曜日までの主菜・副菜をまとめた読みやすいテキストを日本語で作成してください。価格・カロリー・アレルギー表記・商品コードなどのメニューに関係のない情報は出力に含めないでください。曜日を1つも省略せず、必ず5日分すべてを出力してください。

出力形式（これ以外の前置きや説明は一切不要）:
月: 主菜名（副菜名、副菜名、副菜名）
火: 主菜名（副菜名、副菜名、副菜名）
水: 主菜名（副菜名、副菜名、副菜名）
木: 主菜名（副菜名、副菜名、副菜名）
金: 主菜名（副菜名、副菜名、副菜名）`;

  const response = await client.send(
    new ConverseCommand({
      modelId: MODEL_ID,
      messages: [
        {
          role: "user",
          content: [
            { image: { format: "png", source: { bytes: imagePng } } },
            { text: prompt },
          ],
        },
      ],
      inferenceConfig: { maxTokens: 800, temperature: 0 },
    })
  );

  const text = response.output?.message?.content?.[0]?.text;
  if (!text) {
    throw new Error("Bedrockからの応答にテキストが含まれていません");
  }
  return text.trim();
}
