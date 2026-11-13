import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

// Cada passo é uma chamada a um motor, que pode demorar com as tentativas.
export const maxDuration = 300;

/** Endereço por onde o Inngest executa as tarefas em segundo plano. */
export const { GET, POST, PUT } = serve({ client: inngest, functions });
