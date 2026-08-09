import { createFileRoute } from "@tanstack/react-router";
import ComparisonView from "@/views/ComparisonView";
export const Route = createFileRoute("/_app/compare")({ component: ComparisonView });
