import { createFileRoute } from "@tanstack/react-router";
import AlertsView from "@/views/AlertsView";
export const Route = createFileRoute("/_app/alerts")({ component: AlertsView });
