import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

const REGION = process.env.AWS_REGION ?? "ap-northeast-1";
const MODEL_ID =
  process.env.BEDROCK_MODEL_ID ??
  "jp.anthropic.claude-haiku-4-5-20251001-v1:0";

const client = new BedrockRuntimeClient({ region: REGION });

export async function refineMenuText(
  courseLabel: string,
  rawSnippet: string
): Promise<string> {
  const prompt = `以下はコープの「${courseLabel}」という宅配弁当コースの週替わりメニュー表をPDFから抽出した生データです。
このコースは月・火・水・木・金の5日分のメニューが掲載されており、同じ行内のテキストはおおむね月→金の順に左から並んでいますが、複数行に分かれて折り返されていることもあります。

価格・カロリー・アレルギー表記・商品コードなどのメニューに関係のないノイズは無視し、実際の料理名だけを使って、月曜日から金曜日までの主菜・副菜をまとめた読みやすいテキストを日本語で作成してください。

出力形式（これ以外の前置きや説明は一切不要）:
月: 主菜名（副菜名、副菜名...）
火: 主菜名（副菜名、副菜名...）
水: 主菜名（副菜名、副菜名...）
木: 主菜名（副菜名、副菜名...）
金: 主菜名（副菜名、副菜名...）

生データ:
${rawSnippet}`;

  const response = await client.send(
    new ConverseCommand({
      modelId: MODEL_ID,
      messages: [
        {
          role: "user",
          content: [{ text: prompt }],
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
