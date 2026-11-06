import { assertKidAccess } from "@/lib/kid-auth";

export default async function KidLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  await assertKidAccess(childId);
  return children;
}
