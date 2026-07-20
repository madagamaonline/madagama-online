import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { defaultLandingPath } from "@/lib/authorization";

export default async function Home() {
  const user = await requireUser();
  redirect(defaultLandingPath(user.role));
}
