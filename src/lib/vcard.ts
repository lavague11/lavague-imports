// Minimal vCard (.vcf) parser — enough to import contacts as customers.
// Handles vCard 2.1/3.0/4.0 basics: line unfolding, property params, multiple
// cards per file, ADR structured address, and common value escaping.

export interface VCardContact {
  name: string | null; // FN (contact person)
  org: string | null; // ORG (business)
  email: string | null;
  phone: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

// Unescape vCard TEXT values (\, \; \n \\).
function unescape(v: string): string {
  return v
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

// Unfold folded lines (continuation lines begin with a space or tab).
function unfold(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

interface RawProp {
  name: string;
  params: string[];
  value: string;
}

function parseLine(line: string): RawProp | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = head.split(";");
  const name = (parts[0].split(".").pop() || parts[0]).toUpperCase(); // drop group prefix (e.g. item1.TEL)
  return { name, params: parts.slice(1), value };
}

function firstNonEmpty(...vals: (string | undefined)[]): string | null {
  for (const v of vals) {
    const t = (v ?? "").trim();
    if (t) return t;
  }
  return null;
}

export function parseVCards(raw: string): VCardContact[] {
  const lines = unfold(raw);
  const contacts: VCardContact[] = [];
  let cur: Partial<VCardContact> | null = null;
  let nParts: string[] | null = null; // N: Family;Given;...

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^BEGIN:VCARD$/i.test(trimmed)) {
      cur = {};
      nParts = null;
      continue;
    }
    if (/^END:VCARD$/i.test(trimmed)) {
      if (cur) {
        const name = firstNonEmpty(
          cur.name ?? undefined,
          nParts ? [nParts[1], nParts[0]].filter(Boolean).join(" ") : undefined,
        );
        if (name || cur.org || cur.email || cur.phone) {
          contacts.push({
            name: name,
            org: cur.org ?? null,
            email: cur.email ?? null,
            phone: cur.phone ?? null,
            street: cur.street ?? null,
            city: cur.city ?? null,
            state: cur.state ?? null,
            zip: cur.zip ?? null,
          });
        }
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const prop = parseLine(line);
    if (!prop) continue;
    const val = unescape(prop.value);

    switch (prop.name) {
      case "FN":
        if (!cur.name) cur.name = val;
        break;
      case "N":
        nParts = prop.value.split(";").map((s) => unescape(s));
        break;
      case "ORG":
        if (!cur.org) cur.org = prop.value.split(";").map((s) => unescape(s)).filter(Boolean)[0] ?? null;
        break;
      case "EMAIL":
        if (!cur.email) cur.email = val.toLowerCase();
        break;
      case "TEL":
        if (!cur.phone) cur.phone = val;
        break;
      case "ADR": {
        // ADR = PO Box;Extended;Street;City;State;Zip;Country
        const a = prop.value.split(";").map((s) => unescape(s));
        if (!cur.street) {
          cur.street = firstNonEmpty(a[2], a[1]);
          cur.city = firstNonEmpty(a[3]);
          cur.state = firstNonEmpty(a[4]);
          cur.zip = firstNonEmpty(a[5]);
        }
        break;
      }
    }
  }

  return contacts;
}
