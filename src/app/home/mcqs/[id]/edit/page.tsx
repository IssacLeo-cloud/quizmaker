import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { McqForm } from "@/components/mcq/mcq-form";
import { getSessionUserId } from "@/lib/session";
import { getMcq } from "@/lib/services/mcqs";

export default async function EditMcqPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/login");
  }

  const { id } = await params;
  const question = await getMcq(userId, id);
  if (!question) {
    notFound();
  }

  return (
    <div className="min-h-svh">
      <header className="flex justify-end p-6">
        <Link href="/logout">Log out</Link>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
        <McqForm question={question} />
      </main>
    </div>
  );
}
