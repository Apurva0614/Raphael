import { createFileRoute } from "@tanstack/react-router";
import RiskIntelligenceView from "@/views/RiskIntelligenceView";
export const Route = createFileRoute("/_app/risk")({ component: RiskIntelligenceView });
