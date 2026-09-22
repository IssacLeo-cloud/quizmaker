import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string }>;
}) {
  const { registered } = await searchParams;

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        {registered ? (
          <p className="mb-4 text-center text-sm text-muted-foreground">
            Account created. You can log in now.
          </p>
        ) : null}
        <LoginForm />
      </div>
    </div>
  );
}
