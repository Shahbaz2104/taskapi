import { AuthGuard } from "@/components/auth-guard";
import { AppNav } from "@/components/app-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppNav />
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </AuthGuard>
  );
}
