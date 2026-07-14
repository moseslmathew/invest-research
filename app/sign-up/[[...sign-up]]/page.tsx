import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="login-shell" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <SignUp forceRedirectUrl="/dashboard" fallbackRedirectUrl="/dashboard" />
    </main>
  );
}
