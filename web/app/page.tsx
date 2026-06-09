import { AgeGate } from "@/components/AgeGate";
import { AppShell } from "@/components/AppShell";

export default function Home() {
  return (
    <AgeGate>
      <AppShell />
    </AgeGate>
  );
}
