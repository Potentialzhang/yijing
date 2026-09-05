import { TrigramIndex } from "@/components/trigram/TrigramIndex";

/** Keep a dedicated tool route so the return link preserves the tool context. */
export default function TrigramToolPage() {
  return <TrigramIndex backHref="/tools" backLabel="← 工具" />;
}
