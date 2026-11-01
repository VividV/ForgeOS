"use client";
import { z } from "zod";
import { SchemaForm } from "@/components/forms/schema-form";
import { Button } from "@/components/ui/button";
import { signIn, signInWithGoogle, signUp } from "@/app/actions/session";

const loginSchema = z.object({ email: z.email("Enter a valid email address"), password: z.string().min(1, "Enter your password") });

export function LoginForm({ next }: { next?: string }) {
  return (
    <SchemaForm
      schema={loginSchema}
      columns={1}
      fields={[
        { name: "email", label: "Work email", type: "email", required: true, autoComplete: "email", autoFocus: true },
        { name: "password", label: "Password", type: "password", required: true, autoComplete: "current-password" },
      ]}
      action={(v) => signIn({ ...v, next })}
      submitLabel="Sign in"
      successMessage="Welcome back"
    />
  );
}

const signupSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name"),
  email: z.email("Enter a valid work email"),
  password: z.string().min(10, "Use at least 10 characters").regex(/[A-Za-z]/, "Include a letter").regex(/[0-9]/, "Include a number"),
});

export function SignupForm({ next }: { next?: string }) {
  return (
    <SchemaForm
      schema={signupSchema}
      columns={1}
      fields={[
        { name: "full_name", label: "Full name", required: true, autoComplete: "name", autoFocus: true },
        { name: "email", label: "Work email", type: "email", required: true, autoComplete: "email" },
        { name: "password", label: "Password", type: "password", required: true, autoComplete: "new-password", hint: "At least 10 characters, with a letter and a number." },
      ]}
      action={(v) => signUp({ ...v, next })}
      submitLabel="Create account"
      successMessage="Account created"
    />
  );
}

export function GoogleButton({ next }: { next?: string }) {
  return (
    <form action={async () => { await signInWithGoogle(next); }}>
      <Button type="submit" variant="secondary" className="w-full">
        Continue with Google
      </Button>
    </form>
  );
}
