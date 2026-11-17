import { AccountTabs } from "@/components/account/account-tabs";

/** The shared portal header: greeting, role badge, sign out, and sub-nav. */
export function AccountHeader({
  name,
  email,
  isWholesale,
}: {
  name: string | null;
  email: string;
  isWholesale: boolean;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Your account</p>
          <h1 className="mt-2 font-display text-3xl text-olive-900">
            {name ? `Hello, ${name.split(" ")[0]}` : "Hello"}
          </h1>
          <p className="mt-1 text-sm text-olive-600">{email}</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={
              "rounded-full px-3 py-1 text-xs font-medium " +
              (isWholesale ? "bg-emerald-50 text-emerald-700" : "bg-olive-100 text-olive-700")
            }
          >
            {isWholesale ? "Wholesale account" : "Retail customer"}
          </span>
          <form action="/logout" method="post">
            <button className="rounded-full border border-olive-200 px-3 py-1 text-xs font-medium text-olive-700 hover:bg-olive-50">
              Sign out
            </button>
          </form>
        </div>
      </div>
      <AccountTabs isWholesale={isWholesale} />
    </div>
  );
}
