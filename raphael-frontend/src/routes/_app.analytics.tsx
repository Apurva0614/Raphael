import { createFileRoute } from "@tanstack/react-router";
import AnalyticsView from "@/views/AnalyticsView";
export const Route = createFileRoute("/_app/analytics")({ component: AnalyticsView });
