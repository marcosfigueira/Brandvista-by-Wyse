import assert from "node:assert/strict";
import { test } from "node:test";
import { callOrder } from "./order";

test("callOrder faz uma repetição inteira antes de começar a próxima", () => {
  const prompts = [
    { id: "a", text: "A", search_enabled: true },
    { id: "b", text: "B", search_enabled: false },
  ];
  const calls = callOrder(prompts, 3).map((call) => `${call.prompt.id}${call.repetition}`);
  assert.deepEqual(calls, ["a1", "b1", "a2", "b2", "a3", "b3"]);
});
