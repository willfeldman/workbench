import { redirect } from "next/navigation";
import { hosted, localMode } from "@/lib/server/config";
import { userId } from "@/lib/server/supabase";
import Workbench from "@/components/workshop";
export const dynamic = "force-dynamic";
export default async function Home() {
  if (!hosted() && !localMode()) return <Workbench preview />;
  try {
    await userId();
  } catch {
    redirect("/login");
  }
  return <Workbench local={localMode()} />;
}
