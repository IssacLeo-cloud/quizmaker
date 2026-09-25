import { redirect } from "next/navigation";

import { InstructorHome } from "@/components/home/instructor-home";
import { getSessionUserId } from "@/lib/session";
import { listMcqs } from "@/lib/services/mcqs";

export default async function HomePage() {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/login");
  }

  const questions = await listMcqs(userId);
  return <InstructorHome questions={questions} />;
}
