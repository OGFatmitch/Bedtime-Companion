import { prisma } from "@/lib/prisma";
import { StartSessionForm } from "@/components/StartSessionForm";

export default async function NewSessionPage() {
  const [profiles, devices] = await Promise.all([
    prisma.childProfile.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.deviceNode.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return <StartSessionForm profiles={profiles} devices={devices} />;
}

