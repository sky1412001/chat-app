import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useAuth } from "@/lib/auth-context";
import { UserList } from "@/components/chat/UserList";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { UserAvatar } from "@/components/chat/UserAvatar";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, LogOut } from "lucide-react";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn, formattedUserName } from "@/lib/utils";

const searchSchema = z.object({
  peer: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/chat")({
  validateSearch: searchSchema,
  component: ChatPage,
});

function ChatPage() {
  const { user, signOut } = useAuth();
  const { peer } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [me, setMe] = useState<{ display_name: string; avatar_url: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .single()
      .then(({ data }) => data && setMe(data));
  }, [user]);

  if (!user) return null;

  const selectPeer = (id: string) => navigate({ search: { peer: id } });
  const clearPeer = () => navigate({ search: {} });

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#020b06]">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex h-full w-full flex-col border-r border-[#14ff9a]/20 bg-[#03130a]/95 md:w-[340px] md:shrink-0",
          peer && "hidden md:flex",
        )}
      >
        <div className="border-b border-[#14ff9a]/15 bg-[#02130a]/95 px-4 py-4 backdrop-blur-sm hacker-glow">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-gradient-to-br from-[#12ff8b] to-[#0dfaa1] text-[#02130a] shadow-[0_0_28px_rgba(18,255,136,0.25)]">
                <span className="text-lg font-bold">I</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground terminal-text">Imperial Digitech</p>
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#8cffb1]/75">deveilport sfftawrew yteam</p>
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                  <LogOut className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Sign out?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to log out and return to the login screen?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleLogout}>Yes, sign out</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar
              name={formattedUserName(me?.display_name ?? user.email ?? "Me", user.id)}
              avatarUrl={me?.avatar_url}
              size="md"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {formattedUserName(me?.display_name ?? user.email ?? "Me", user.id)}
              </p>
              <p className="text-xs text-muted-foreground">You</p>
            </div>
          </div>
        </div>
        <UserList currentUserId={user.id} selectedId={peer ?? null} onSelect={selectPeer} />
      </aside>

      {/* Main */}
      <main className={cn("flex h-full flex-1 flex-col", !peer && "hidden md:flex")}>
        {peer ? (
          <ChatWindow currentUserId={user.id} otherUserId={peer} onBack={clearPeer} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center bg-chat-bg p-6 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <MessageCircle className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-semibold">Select a conversation</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Pick someone from the list to start chatting. Messages update in real time.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
