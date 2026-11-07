import { createFileRoute } from "@tanstack/react-router";
import { FounderView } from "@/components/FounderView";

export const Route = createFileRoute("/_authenticated/fondateur")({
  head: () => ({ meta: [{ title: "Vue Fondateur — MBGEduGuinée" }, { name: "description", content: "Vue de pilotage en consultation seule pour les fondateurs." }] }),
  component: FounderView,
});
