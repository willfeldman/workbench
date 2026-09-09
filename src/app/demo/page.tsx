import Workbench from "@/components/workshop";
import { hosted, localMode } from "@/lib/server/config";
import { userId } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export default async function Demo() {
  if (hosted() && !localMode()) {
    try {
      await userId();
      return <Workbench />;
    } catch { /* Public examples remain available without an account. */ }
  }
  return <Workbench preview />;
}
