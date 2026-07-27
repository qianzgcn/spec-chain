import { AppShell } from "@/components/app-shell/app-shell";
import { NavigationFeedbackProvider } from "@/components/app-shell/navigation-feedback";
import { requireUser } from "@/server/auth/session";
import {
  getActiveProjects,
  getCurrentProject,
} from "@/server/projects/current-project";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, projects, currentProject] = await Promise.all([
    requireUser(),
    getActiveProjects(),
    getCurrentProject(),
  ]);

  return (
    <NavigationFeedbackProvider>
      <AppShell
        user={user}
        projects={projects.map((project) => ({
          id: project.id,
          name: project.name,
        }))}
        currentProject={
          currentProject
            ? { id: currentProject.id, name: currentProject.name }
            : null
        }
      >
        {children}
      </AppShell>
    </NavigationFeedbackProvider>
  );
}
