import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun, Snowflake, Sun } from "lucide-react";
import { weatherIconKind } from "@/lib/weather/codes";

export function WeatherIcon({ code, className = "size-6" }: { code: number; className?: string }) {
  const kind = weatherIconKind(code);
  const props = { className, "aria-hidden": true } as const;
  switch (kind) {
    case "sun":
      return <Sun {...props} className={`${className} text-wheat`} />;
    case "partly":
      return <CloudSun {...props} className={`${className} text-wheat`} />;
    case "fog":
      return <CloudFog {...props} className={`${className} text-subtle`} />;
    case "drizzle":
      return <CloudDrizzle {...props} className={`${className} text-info`} />;
    case "rain":
      return <CloudRain {...props} className={`${className} text-info`} />;
    case "storm":
      return <CloudLightning {...props} className={`${className} text-clay`} />;
    case "snow":
      return <Snowflake {...props} className={`${className} text-info`} />;
    default:
      return <Cloud {...props} className={`${className} text-subtle`} />;
  }
}
