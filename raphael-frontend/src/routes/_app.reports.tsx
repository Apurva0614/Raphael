import { createFileRoute } from "@tanstack/react-router";
import ReportsView from "@/views/ReportsView";
export const Route = createFileRoute("/_app/reports")({ component: ReportsView });
