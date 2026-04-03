import { NextRequest, NextResponse } from "next/server";

const PHOENIX = process.env.PHOENIX_URL ?? "http://localhost:6006";

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 500 },
    );
  }

  const { messages, model, temperature, promptLabel } = await req.json();

  const startTime = new Date().toISOString();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      messages,
      temperature: temperature ?? 0.7,
    }),
  });

  const data = await res.json();
  const endTime = new Date().toISOString();

  // Record span to Phoenix playground project
  if (!data.error) {
    try {
      const traceId = crypto.randomUUID().replace(/-/g, "");
      const spanId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

      await fetch(`${PHOENIX}/v1/projects/playground/spans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [
            {
              name: promptLabel || "playground-run",
              context: { trace_id: traceId, span_id: spanId },
              span_kind: "LLM",
              parent_id: null,
              start_time: startTime,
              end_time: endTime,
              status_code: "OK",
              status_message: "",
              attributes: {
                "input.value": JSON.stringify(messages),
                "output.value": data.choices?.[0]?.message?.content ?? "",
                "llm.model_name": model || "gpt-4o-mini",
                "llm.token_count.prompt": data.usage?.prompt_tokens ?? 0,
                "llm.token_count.completion": data.usage?.completion_tokens ?? 0,
                "llm.token_count.total": data.usage?.total_tokens ?? 0,
                "metadata.source": "playground",
                "metadata.prompt_label": promptLabel || "",
              },
              events: [],
            },
          ],
        }),
      });
    } catch (e) {
      // Don't fail the response if tracing fails
      console.error("Failed to record playground span:", e);
    }
  }

  return NextResponse.json(data);
}
