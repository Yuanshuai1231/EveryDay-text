import { SpaceShell } from "@/components/layout/SpaceShell";
export default async function SpaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ spaceId: string }> }) { const { spaceId } = await params; return <SpaceShell spaceId={spaceId}>{children}</SpaceShell>; }
