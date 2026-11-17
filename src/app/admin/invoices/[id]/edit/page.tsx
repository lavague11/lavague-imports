import { redirect } from "next/navigation";

// The invoice editor merged into the main invoice page. Keep /edit working by
// redirecting to it (old links, bookmarks).
export default async function EditRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/invoices/${id}`);
}
