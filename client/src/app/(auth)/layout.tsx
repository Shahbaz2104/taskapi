import { GridPattern } from "@/components/kokonut/grid-pattern";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-6 py-12">
      <GridPattern className="opacity-70" />
      {children}
    </main>
  );
}
