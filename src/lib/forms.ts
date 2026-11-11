import { redirect } from "next/navigation";

/** Lê um campo de texto do formulário, já sem espaços nas pontas. */
export function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/** Texto opcional: vazio vira null. */
export function optional(formData: FormData, name: string): string | null {
  const value = field(formData, name);
  return value === "" ? null : value;
}

/** "a, b , c" vira ["a", "b", "c"]. */
export function list(formData: FormData, name: string): string[] {
  return field(formData, name)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Volta à página com uma mensagem de erro visível. */
export function fail(path: string, message: string): never {
  redirect(`${path}?erro=${encodeURIComponent(message)}`);
}

/**
 * Mensagem para mostrar a partir de um erro do banco. Erros levantados pelas
 * nossas próprias regras (código P0001) já vêm em português.
 */
export function dbMessage(
  error: { code?: string; message: string },
  fallback: string,
): string {
  if (error.code === "P0001" || error.code === "P0002") return error.message;
  console.error("Erro do banco:", error.code, error.message);
  return fallback;
}
