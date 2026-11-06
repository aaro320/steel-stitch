
import { NextRequest, NextResponse } from "next/server";
import { context, fail } from "@/lib/server";

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();

    const admin = [
      "job",
      "user",
      "adjust",
      "complete",
      "reset_clerk",
      "remove_user",
    ].includes(b.action);

    const { s, client } = await context(admin);

    let name = "";
    let args: Record<string, unknown> = {};

    if (b.action === "stock" || b.action === "adjust") {
      name = "post_stock";
      args = {
        p_actor: s.id,
        p_material: b.material,
        p_quantity: Number(b.quantity),
        p_kind: b.action === "adjust" ? "adjust" : b.kind,
        p_note: b.note || "",
      };
    } else if (b.action === "job") {
      name = "create_job";
      args = {
        p_actor: s.id,
        p_customer: b.customer,
        p_contact: b.contact || "",
        p_details: b.details || "",
        p_items: b.items,
        p_materials: b.materials,
      };
    } else if (b.action === "complete") {
      name = "complete_job";
      args = {
        p_actor: s.id,
        p_job: b.id,
        p_status: b.status,
      };
    } else if (b.action === "user") {
      name = "create_profile";
      args = {
        p_actor: s.id,
        p_name: b.name,
        p_nickname: b.nickname,
        p_role: b.role,
        p_pin: b.pin,
        p_question: b.question,
        p_answer: b.answer,
      };
    } else if (b.action === "reset_clerk") {
      name = "admin_reset_clerk_pin";
      args = {
        p_actor: s.id,
        p_target: b.id,
        p_pin: b.pin,
      };
    } else if (b.action === "remove_user") {
      if (s.role !== "owner") {
        throw Error("Owner only");
      }

      name = "owner_deactivate_profile";
      args = {
        p_owner: s.id,
        p_target: b.id,
        p_pin: b.pin,
      };
    } else {
      throw Error("Invalid action");
    }

    const { data, error } = await client.rpc(name, args);

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (e) {
    return fail(e);
  }
}
