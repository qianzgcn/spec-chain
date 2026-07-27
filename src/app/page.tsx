import { redirect } from "next/navigation";

import { getCurrentUser } from "@/server/auth/session";
import { getCurrentProject } from "@/server/projects/current-project";

export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const currentProject = await getCurrentProject();
  redirect(currentProject ? "/requirements" : "/projects");
}
