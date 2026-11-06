
import { NextResponse } from "next/server";
import { session, privileged } from "./auth";
import { db } from "./db";

export async function context(admin = false) {
  const s = await session();

  if (!s) {
    throw Error("Unauthorized");
  }

  // Verify that the session still belongs
  // to an active user.
  const { data, error } = await db()
    .from("profiles")
    .select("is_active, role")
    .eq("id", s.id)
    .maybeSingle();

  if (
    error ||
    !data?.is_active ||
    data.role !== s.role
  ) {
    throw Error("Unauthorized");
  }

  if (admin && !privileged(s)) {
    throw Error("Unauthorized");
  }

  return { s, client: db() };
}

export function fail(e: unknown) {
  const message =
    e instanceof Error ? e.message : "Request failed";

  return NextResponse.json(
    { error: message },
    {
      status: message === "Unauthorized" ? 403 : 400,
    }
  );
}
