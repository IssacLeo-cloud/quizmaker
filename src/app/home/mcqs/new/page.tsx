import Link from "next/link";
import { redirect } from "next/navigation";

import { McqForm } from "@/components/mcq/mcq-form";
import { getSessionUserId } from "@/lib/session";

export default async function NewMcqPage() {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/login");
  }

  return (
    <div className="min-h-svh">
      <header className="flex justify-end p-6">
        <Link href="/logout">Log out</Link>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
        <McqForm />
      </main>
    </div>
  );
}
