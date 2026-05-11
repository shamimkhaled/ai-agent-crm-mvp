import { cn } from "@/lib/utils";

type Props = {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  className?: string;
};

export function SettingsSectionHeader({ title, subtitle, children, className }: Props) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between pb-2", className)}>
      <div className="space-y-1 max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted-foreground text-sm leading-relaxed">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
