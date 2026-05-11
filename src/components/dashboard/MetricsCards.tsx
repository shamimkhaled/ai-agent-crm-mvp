import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, CheckCircle, AlertTriangle, Clock } from "lucide-react";

const metrics = [
  {
    title: "Total Calls Today",
    value: "1,245",
    change: "+12.5%",
    trend: "up",
    icon: Phone,
  },
  {
    title: "AI Resolution Rate",
    value: "82.4%",
    change: "+4.1%",
    trend: "up",
    icon: CheckCircle,
  },
  {
    title: "Escalations to Human",
    value: "219",
    change: "-2.5%",
    trend: "down",
    icon: AlertTriangle,
  },
  {
    title: "Avg Response Time",
    value: "1.2s",
    change: "-0.4s",
    trend: "down",
    icon: Clock,
  },
];

export function MetricsCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.title} className="glass">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {metric.title}
            </CardTitle>
            <metric.icon className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metric.value}</div>
            <p className={`text-xs mt-1 ${metric.trend === 'up' ? 'text-green-500' : 'text-primary'}`}>
              {metric.change} from yesterday
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
