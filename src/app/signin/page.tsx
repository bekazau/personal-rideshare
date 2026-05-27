import { SignInForm } from "./SignInForm";

interface Props {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function SignInPage({ searchParams }: Props) {
  const { next, error } = await searchParams;

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      <div className="max-w-sm w-full space-y-6">
        <header className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="text-sm text-neutral-400">
            Enter your email. We&apos;ll send a magic link.
          </p>
        </header>
        <SignInForm next={next} />
        {error && (
          <p className="text-sm text-rose-400 text-center">
            {decodeURIComponent(error)}
          </p>
        )}
      </div>
    </main>
  );
}
