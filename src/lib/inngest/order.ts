/** Pergunta como foi fotografada no início da rodada. */
export type RunPrompt = { id: string; text: string; search_enabled: boolean };

/** Ordem das chamadas de um motor: uma repetição inteira de cada vez, para
 *  que as repetições da mesma pergunta fiquem afastadas no tempo. */
export function callOrder(prompts: RunPrompt[], repetitions: number) {
  const calls: { prompt: RunPrompt; repetition: number }[] = [];
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    for (const prompt of prompts) calls.push({ prompt, repetition });
  }
  return calls;
}
