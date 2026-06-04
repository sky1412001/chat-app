import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface Props {
  name: string;
  avatarUrl?: string | null;
  isOnline?: boolean;
  size?: "sm" | "md" | "lg";
  showStatus?: boolean;
}

const sizeMap = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
};

export function UserAvatar({ name, avatarUrl, isOnline, size = "md", showStatus = false }: Props) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Use provided avatarUrl if available, otherwise generate a unique avatar
  // per user using DiceBear (seeded by name so it's consistent per user).
  const seed = encodeURIComponent(name || "user");
  const generated = `https://api.dicebear.com/8.x/identicon/svg?seed=${seed}`;
  const src = avatarUrl ?? generated;

  return (
    <div className="relative shrink-0">
      <Avatar className={cn(sizeMap[size])}>
        {src ? <AvatarImage src={src} alt={name} /> : null}
        <AvatarFallback className="bg-primary/15 font-semibold text-primary">
          {initials || "?"}
        </AvatarFallback>
      </Avatar>
      {showStatus && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background",
            isOnline ? "bg-online" : "bg-muted-foreground/40",
          )}
        />
      )}
    </div>
  );
}
