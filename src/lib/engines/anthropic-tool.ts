import { postJson, requireKey } from "./http";
import { EngineError, isRecord } from "./types";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const KEY = "ANTHROPIC_API_KEY";

type ToolCall = {
  /** Nome que aparece nas mensagens de erro: "analisador", "gerador do relatório". */
  label: string;
  model: string;
  system: string;
  user: string;
  tool: { name: string; description: string; input_schema: unknown };
  maxTokens: number;
  timeoutMs?: number;
};

/** Primeiro objeto JSON completo dentro de um texto, ou nulo. */
export function firstJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** O que o modelo registrou: a chamada da ferramenta ou, na falta dela, um JSON escrito no texto. */
export function readStructured(payload: unknown, toolName: string): unknown {
  const content = isRecord(payload) && Array.isArray(payload.content) ? payload.content : [];
  const call = content.find((item) => isRecord(item) && item.type === "tool_use" && item.name === toolName);
  if (isRecord(call) && isRecord(call.input)) return call.input;
  const text = content
    .filter((item): item is Record<string, unknown> => isRecord(item) && item.type === "text" && typeof item.text === "string")
    .map((item) => item.text as string)
    .join("\n");
  return firstJsonObject(text);
}

/**
 * Pede ao Claude uma saída estruturada por meio de uma ferramenta. Os modelos
 * mais novos não aceitam que a chamada da ferramenta seja forçada, então o
 * pedido usa a escolha automática e a instrução manda chamar a ferramenta. Se
 * o modelo responder em texto, tenta ler o JSON do texto e, por fim, pede de
 * novo uma vez.
 */
export async function callAnthropicTool(params: ToolCall): Promise<{ input: unknown; model: string }> {
  const headers = { "x-api-key": requireKey(KEY), "anthropic-version": "2023-06-01" };
  const system = `${params.system}\n\nResponda sempre chamando a ferramenta ${params.tool.name}, uma única vez, com todos os campos. Não responda em texto.`;
  const messages: { role: "user" | "assistant"; content: string }[] = [{ role: "user", content: params.user }];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const payload = await postJson({
      engine: params.label,
      keyName: KEY,
      url: ENDPOINT,
      headers,
      timeoutMs: params.timeoutMs,
      body: {
        model: params.model,
        max_tokens: params.maxTokens,
        system,
        tools: [params.tool],
        tool_choice: { type: "auto" },
        messages,
      },
    });
    const input = readStructured(payload, params.tool.name);
    if (input !== null) {
      const used = isRecord(payload) && typeof payload.model === "string" ? payload.model : params.model;
      return { input, model: used };
    }
    messages.push(
      { role: "assistant", content: "Vou registrar agora pela ferramenta." },
      { role: "user", content: `Chame a ferramenta ${params.tool.name} agora, com todos os campos preenchidos.` },
    );
  }
  throw new EngineError(`O ${params.label} não devolveu a saída no formato esperado.`);
}
