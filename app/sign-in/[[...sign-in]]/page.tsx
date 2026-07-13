import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="login-shell" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <SignIn />
    </main>
  );
}
