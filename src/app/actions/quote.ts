"use server";

import { z } from "zod";

import { getVariantsByIds } from "@/lib/catalog";
import { requirePrisma } from "@/lib/db";
import {
  optionalString,
  requiredString,
  toFieldErrors,
  type FormState,
} from "@/lib/form";
import { makeReference } from "@/lib/utils";

const lineSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().min(1).max(9999),
});

const quoteSchema = z.object({
  name: z.string().min(2, "Please tell us your name."),
  email: z.email("Enter a valid email address."),
  phone: z.string().min(7, "Enter a phone number we can reach you on."),
  company: z.string().optional(),
  customerType: z.enum(["RETAIL", "WHOLESALE"]),
  deliveryCity: z.string().optional(),
  deliveryState: z.string().optional(),
  deliveryPostalCode: z.string().optional(),
  message: z.string().max(2000).optional(),
  lines: z.array(lineSchema).min(1, "Your quote list is empty."),
});

export async function submitQuoteRequest(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  let parsedLines: unknown = [];
  try {
    parsedLines = JSON.parse(requiredString(formData, "lines") || "[]");
  } catch {
    return {
      status: "error",
      message: "We couldn't read your quote list. Please refresh and try again.",
    };
  }

  const parsed = quoteSchema.safeParse({
    name: requiredString(formData, "name"),
    email: requiredString(formData, "email"),
    phone: requiredString(formData, "phone"),
    company: optionalString(formData, "company"),
    customerType: requiredString(formData, "customerType") || "RETAIL",
    deliveryCity: optionalString(formData, "deliveryCity"),
    deliveryState: optionalString(formData, "deliveryState"),
    deliveryPostalCode: optionalString(formData, "deliveryPostalCode"),
    message: optionalString(formData, "message"),
    lines: parsedLines,
  });

  if (!parsed.success) {
    const fieldErrors = toFieldErrors(parsed.error);
    return {
      status: "error",
      message:
        fieldErrors.lines ?? "Please check the highlighted fields and try again.",
      fieldErrors,
    };
  }

  const data = parsed.data;

  // Re-price server-side; the browser's copy of the cart is untrusted.
  const priced = await getVariantsByIds(data.lines.map((line) => line.variantId));
  const items = data.lines.flatMap((line) => {
    const variant = priced.get(line.variantId);
    if (!variant) return [];
    const unit = variant.unitPriceCents;
    return [
      {
        variantId: variant.variantId,
        productName: variant.productName,
        variantName: variant.variantName,
        sku: variant.sku,
        quantity: line.quantity,
        // Null price = quote-only line; the total reflects only priced lines.
        unitPriceCents: unit,
        lineTotalCents: unit === null ? null : unit * line.quantity,
      },
    ];
  });

  if (items.length === 0) {
    return {
      status: "error",
      message:
        "None of those products are available any more. Please rebuild your quote list.",
    };
  }

  const reference = makeReference("LVQ");
  const estimatedTotalCents = items.reduce(
    (sum, item) => sum + (item.lineTotalCents ?? 0),
    0,
  );

  try {
    const prisma = requirePrisma();
    await prisma.quoteRequest.create({
      data: {
        reference,
        customerType: data.customerType,
        name: data.name,
        email: data.email,
        phone: data.phone,
        company: data.company,
        message: data.message,
        deliveryCity: data.deliveryCity,
        deliveryState: data.deliveryState,
        deliveryPostalCode: data.deliveryPostalCode,
        estimatedTotalCents,
        items: {
          create: items.map((item) => ({
            variantId: item.variantId,
            productName: item.productName,
            variantName: item.variantName,
            sku: item.sku,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            lineTotalCents: item.lineTotalCents,
          })),
        },
      },
    });
  } catch (error) {
    console.error("[quote] failed to save request", { reference, items, error });
    return {
      status: "error",
      message:
        "We couldn't save your request. Please call 646-396-0775 or email Sales@lavagueimports.com and we'll take it down directly.",
    };
  }

  // TODO: notify Sales@lavagueimports.com — wire up an email provider (Resend,
  // Postmark, SES) here once credentials are available.

  return {
    status: "success",
    message:
      "Your quote request is in. We'll reply with pricing, freight, and lead time — usually within one business day.",
    reference,
  };
}
