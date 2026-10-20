import { Suspense } from "react";
import { EditarRepuesto } from "@/components/EditarRepuesto";

export default function Page({ params }: PageProps<"/repuesto/[id]">) {
  return (
    <Suspense fallback={<div className="m-4 h-96 animate-pulse rounded-xl bg-surface" />}>
      <EditarRepuesto params={params} />
    </Suspense>
  );
}
