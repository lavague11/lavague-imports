"use server";

import { z } from "zod";

import { requirePrisma } from "@/lib/db";
import {
  optionalString,
  requiredString,
  toFieldErrors,
  type FormState,
} from "@/lib/form";
import { makeReference } from "@/lib/utils";

const contactSchema = z.object({
  name: z.string().min(2, "Please tell us your name."),
  email: z.email("Enter a valid email address."),
  phone: z.string().optional(),
  topic: z.enum(["GENERAL", "WHOLESALE", "ORDER", "PRODUCT", "DELIVERY"]),
  message: z.string().min(10, "Tell us a little more so we can help."),
});

export async function submitContactMessage(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = contactSchema.safeParse({
    name: requiredString(formData, "name"),
    email: requiredString(formData, "email"),
    phone: optionalString(formData, "phone"),
    topic: requiredString(formData, "topic") || "GENERAL",
    message: requiredString(formData, "message"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check the highlighted fields and try again.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const reference = makeReference("LVM");

  try {
    const prisma = requirePrisma();
    await prisma.contactMessage.create({
      data: { reference, ...parsed.data },
    });
  } catch (error) {
    console.error("[contact] failed to save message", { reference, error });
    return {
      status: "error",
      message:
        "We couldn't send that. Please call 646-396-0775 or email Sales@lavagueimports.com directly.",
    };
  }

  // TODO: notify Sales@lavagueimports.com once an email provider is configured.

  return {
    status: "success",
    message: "Thanks — we've got your message and will reply shortly.",
    reference,
  };
}
