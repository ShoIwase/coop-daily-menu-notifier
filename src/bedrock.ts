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
  const prompt = `以下はコープの宅配弁当メニュー表をPDFから抽出した生データです。2段組みレイアウトのPDFをテキスト化したもののため、「${courseLabel}」だけでなく、同じ行ブロックに掲載されている別コース（隣の列のコース）の品目も混在して含まれています。

あなたに抽出してほしいのは「${courseLabel}」のメニューだけです。他のコース名（見出し）が生データ中に出てきたら、そこから先はそのコースの記載なので無視してください。「${courseLabel}」は月・火・水・木・金の5日分のメニューが掲載されており、主菜1品＋副菜3品程度で構成されています。同じ行内のテキストはおおむね月→金の順に左から並んでいますが、複数行に分かれて折り返されていることもあります。

価格・カロリー・アレルギー表記・商品コードなどのメニューに関係のないノイズは無視し、実際の料理名だけを使って、「${courseLabel}」の月曜日から金曜日までの主菜・副菜をまとめた読みやすいテキストを日本語で作成してください。

出力形式（これ以外の前置きや説明は一切不要）:
月: 主菜名（副菜名、副菜名、副菜名）
火: 主菜名（副菜名、副菜名、副菜名）
水: 主菜名（副菜名、副菜名、副菜名）
木: 主菜名（副菜名、副菜名、副菜名）
金: 主菜名（副菜名、副菜名、副菜名）

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

export async function refineMenuFromImage(
  courseLabel: string,
  imagePng: Buffer
): Promise<string> {
  const prompt = `添付の画像は、コープの宅配弁当コース「${courseLabel}」の週替わりメニュー表（月〜金5日分）です。表には主菜1品と副菜が複数品、曜日ごとに列で並んでいます。

画像を読み取り、「${courseLabel}」の月曜日から金曜日までの主菜・副菜をまとめた読みやすいテキストを日本語で作成してください。価格・カロリー・アレルギー表記・商品コードなどのメニューに関係のない情報は出力に含めないでください。

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
