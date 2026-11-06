
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sign, session } from "@/lib/auth";

// GET: List available profiles
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

// POST: Authentication and account settings
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();

    // Logout
    if (b.action === "logout") {
      const response = NextResponse.json({ ok: true });
      response.cookies.delete("shop_session");
      return response;
    }

    // Change PIN or Security Question
    if (
      b.action === "change" ||
      b.action === "change_security_question"
    ) {
      const s = await session();

      if (!s) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }

      // Check that the logged-in profile is active
      const { data: profile, error: profileError } = await db()
        .from("profiles")
        .select("is_active, role")
        .eq("id", s.id)
        .maybeSingle();

      if (
        profileError ||
        !profile?.is_active ||
        profile.role !== s.role
      ) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }

      // Change PIN
      if (b.action === "change") {
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

      // Validate Security Question fields
      if (
        typeof b.currentPin !== "string" ||
        typeof b.question !== "string" ||
        typeof b.answer !== "string" ||
        b.question.trim().length < 5 ||
        b.question.trim().length > 200 ||
        b.answer.trim().length < 2 ||
        b.answer.trim().length > 200
      ) {
        return NextResponse.json(
          {
            error:
              "Enter a valid PIN, question (5-200 characters), and answer (2-200 characters).",
          },
          { status: 400 }
        );
      }

      // Change Security Question
      const { error } = await db().rpc(
        "change_own_security_question",
        {
          p_user: s.id,
          p_pin: b.currentPin,
          p_question: b.question,
          p_answer: b.answer,
        }
      );

      return NextResponse.json(
        error ? { error: error.message } : { ok: true },
        { status: error ? 400 : 200 }
      );
    }

    // Reject unknown actions
    if (
      b.action &&
      b.action !== "reset" &&
      b.action !== "login"
    ) {
      return NextResponse.json(
        { error: "Invalid action" },
        { status: 400 }
      );
    }

    // Login or Forgot PIN
    const resetting = b.action === "reset";

    const fn = resetting
      ? "reset_pin_with_answer"
      : "verify_profile_pin";

    const args = resetting
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

    if (resetting) {
      return NextResponse.json({ ok: true });
    }

    if (!data?.ok) {
      return NextResponse.json(
        { error: data?.error || "Invalid PIN" },
        { status: 401 }
      );
    }

    // Create signed session
    const token = await sign({
      id: data.id,
      role: data.role,
      name: data.name,
    });

    const response = NextResponse.json({ ok: true });

    response.cookies.set("shop_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 28800,
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}
