"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { CLIENT_COOKIE } from "@/lib/current-client";
import { field } from "@/lib/forms";

/** Troca a empresa selecionada no topo. */
export async function selectClient(formData: FormData) {
  const id = field(formData, "client");
  if (!id) return;
  const cookieStore = await cookies();
  cookieStore.set(CLIENT_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
