import Link from "next/link";

import { McqList, type McqListQuestion } from "@/components/mcq/mcq-list";

export function InstructorHome({ questions }: { questions: McqListQuestion[] }) {
  return (
    <div className="min-h-svh">
      <header className="flex justify-end p-6">
        <Link href="/logout">Log out</Link>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
        <h1 className="text-2xl font-medium">Instructor home</h1>
        <McqList questions={questions} />
      </main>
    </div>
  );
}
