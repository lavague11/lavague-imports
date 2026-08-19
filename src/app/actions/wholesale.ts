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

// Note: a "use server" module may only export async functions, so the form's
// option lists live in @/lib/wholesale-options.

const applicationSchema = z.object({
  businessName: z.string().min(2, "Enter your registered business name."),
  businessType: z.enum([
    "GROCERY",
    "RESTAURANT",
    "CAFE",
    "DISTRIBUTOR",
    "CATERER",
    "OTHER",
  ]),
  contactName: z.string().min(2, "Who should we speak to?"),
  email: z.email("Enter a valid email address."),
  phone: z.string().min(7, "Enter a phone number we can reach you on."),
  website: z.string().optional(),
  addressLine1: z.string().min(3, "Enter your street address."),
  addressLine2: z.string().optional(),
  city: z.string().min(2, "Enter a city."),
  state: z.string().min(2, "Enter a state."),
  postalCode: z.string().min(5, "Enter a ZIP code."),
  taxId: z.string().optional(),
  resaleCertNumber: z.string().optional(),
  estimatedMonthlyVolume: z.string().optional(),
  productInterest: z.array(z.string()).default([]),
  message: z.string().max(2000).optional(),
});

export async function submitWholesaleApplication(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = applicationSchema.safeParse({
    businessName: requiredString(formData, "businessName"),
    businessType: requiredString(formData, "businessType") || "OTHER",
    contactName: requiredString(formData, "contactName"),
    email: requiredString(formData, "email"),
    phone: requiredString(formData, "phone"),
    website: optionalString(formData, "website"),
    addressLine1: requiredString(formData, "addressLine1"),
    addressLine2: optionalString(formData, "addressLine2"),
    city: requiredString(formData, "city"),
    state: requiredString(formData, "state"),
    postalCode: requiredString(formData, "postalCode"),
    taxId: optionalString(formData, "taxId"),
    resaleCertNumber: optionalString(formData, "resaleCertNumber"),
    estimatedMonthlyVolume: optionalString(formData, "estimatedMonthlyVolume"),
    productInterest: formData
      .getAll("productInterest")
      .filter((value): value is string => typeof value === "string"),
    message: optionalString(formData, "message"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check the highlighted fields and try again.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const reference = makeReference("LVW");

  try {
    const prisma = requirePrisma();
    await prisma.wholesaleApplication.create({
      data: { reference, ...parsed.data },
    });
  } catch (error) {
    console.error("[wholesale] failed to save application", {
      reference,
      error,
    });
    return {
      status: "error",
      message:
        "We couldn't save your application. Please email Sales@lavagueimports.com or call 646-396-0775 and we'll set you up directly.",
    };
  }

  // TODO: notify Sales@lavagueimports.com once an email provider is configured.

  return {
    status: "success",
    message:
      "Application received. We review new accounts within two business days and will send the current line sheet with your approval.",
    reference,
  };
}
