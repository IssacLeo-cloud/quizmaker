import Link from "next/link";

export function InstructorHome() {
  return (
    <div className="min-h-svh">
      <header className="flex justify-end p-6">
        <Link href="/logout">Log out</Link>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6">
        <h1 className="text-2xl font-medium">Instructor home</h1>
        <p>
          This is the instructor home. Quiz making is next — there is no quiz
          editor here yet.
        </p>
      </main>
    </div>
  );
}
