import Link from "next/link";

export function InstructorHome() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-medium">Instructor home</h1>
      <p>
        This is the instructor home. Quiz making is next — there is no quiz
        editor here yet.
      </p>
      <p>
        <Link href="/logout">Log out</Link>
      </p>
    </main>
  );
}
