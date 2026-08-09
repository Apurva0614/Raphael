import { createFileRoute, useNavigate } from "@tanstack/react-router";
import LoadingScreen from "@/components/LoadingScreen";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RAPHAEL — Environmental Intelligence" },
      { name: "description", content: "Understanding Earth. Observe. Protect." },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  return (
    <main className="min-h-screen bg-background">
      <LoadingScreen onComplete={() => navigate({ to: "/dashboard" })} />
    </main>
  );
}
