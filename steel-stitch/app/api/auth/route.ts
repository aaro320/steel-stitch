
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sign, session } from "@/lib/auth";

// GET: Retrieve available user profiles
export async function GET() {
  const { data, error } = await db()
    .from("profiles_public")
    .select("*")
    .order("role");

  return NextResponse.json(
    error ? { error: error.message } : { data },
    { status: error ? 400 : 200 }
  );
}

// POST: Login, Logout, Change PIN, Reset PIN
export async function POST(req: NextRequest) {
  const b = await req.json();

  // Logout
  if (b.action === "logout") {
    const r = NextResponse.json({ ok: true });

    r.cookies.delete("shop_session");

    return r;
  }

  // Change current user's PIN
  if (b.action === "change") {
    const s = await session();

    if (!s) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { error } = await db().rpc("change_own_pin", {
      p_user: s.id,
      p_old: b.oldPin,
      p_new: b.newPin,
    });

    return NextResponse.json(
      error ? { error: error.message } : { ok: true },
      { status: error ? 400 : 200 }
    );
  }

  // Verify PIN or reset forgotten PIN
  const fn =
    b.action === "reset"
      ? "reset_pin_with_answer"
      : "verify_profile_pin";

  const args =
    b.action === "reset"
      ? {
          p_user: b.id,
          p_answer: b.answer,
          p_new: b.newPin,
        }
      : {
          p_user: b.id,
          p_pin: b.pin,
        };

  const { data, error } = await db().rpc(fn, args);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }

  // Successful PIN reset
  if (b.action === "reset") {
    return NextResponse.json({ ok: true });
  }

  // Invalid PIN
  if (!data?.ok) {
    return NextResponse.json(
      { error: data?.error || "Invalid PIN" },
      { status: 401 }
    );
  }

  // Create signed login session
  const token = await sign({
    id: data.id,
    role: data.role,
    name: data.name,
  });

  const r = NextResponse.json({ ok: true });

  // Store session securely in HTTP-only cookie
  r.cookies.set("shop_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 28800,
  });

  return r;
}
