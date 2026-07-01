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
  const prompt = `添付の画像は、コープの宅配弁当コース「${courseLabel}」の週替わりメニュー表を、そのコースの表組み部分だけ切り出したものです（日付ヘッダーやおすすめバナーなど、他の部分は含まれていません）。画像には5列あり、**左から順に月曜日・火曜日・水曜日・木曜日・金曜日**に対応します。各列の1行目が主菜、2行目以降が副菜です。

画像を読み取り、「${courseLabel}」の月曜日から金曜日までの主菜・副菜をまとめた読みやすいテキストを日本語で作成してください。価格・カロリー・アレルギー表記・商品コードなどのメニューに関係のない情報は出力に含めないでください。曜日を1つも省略せず、必ず5日分すべてを出力してください。

出力形式（これ以外の前置きや説明は一切不要。括弧は使わず、主菜・副菜をすべて「／」区切りで並べる）:
月: 主菜名／副菜名／副菜名／副菜名
火: 主菜名／副菜名／副菜名／副菜名
水: 主菜名／副菜名／副菜名／副菜名
木: 主菜名／副菜名／副菜名／副菜名
金: 主菜名／副菜名／副菜名／副菜名`;

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
