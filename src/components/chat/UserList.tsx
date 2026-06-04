import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "./UserAvatar";
import { Input } from "@/components/ui/input";
import { cn, formattedUserName } from "@/lib/utils";
import { Loader2, Search } from "lucide-react";

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_online: boolean;
  last_seen: string;
  last_message_at?: string | null;
  unread?: number;
  last_message_content?: string | null;
}

interface Props {
  currentUserId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function UserList({ currentUserId, selectedId, onSelect }: Props) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const previousSelectedId = useRef<string | null>(null);

  function formatTime(iso?: string | null) {
    if (!iso) return "unknown";
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .neq("id", currentUserId);
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      const baseProfiles = (data as Profile[]) ?? [];

      // Load recent messages to compute last_message_at and unread counts
      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .or(`recipient_id.eq.${currentUserId},sender_id.eq.${currentUserId}`)
        .order("created_at", { ascending: false });

      const latest: Record<string, string> = {};
      const latestContent: Record<string, string> = {};
      const unread: Record<string, number> = {};
      (msgs as any[] | null)?.forEach((m) => {
        const otherId = m.sender_id === currentUserId ? m.recipient_id : m.sender_id;
        if (!latest[otherId]) latest[otherId] = m.created_at;
        if (!latestContent[otherId]) latestContent[otherId] = m.content;
        if (m.recipient_id === currentUserId && m.sender_id !== currentUserId && m.is_seen === false) {
          unread[m.sender_id] = (unread[m.sender_id] || 0) + 1;
        }
      });

      const enriched = baseProfiles.map((p) => ({
        ...p,
        last_message_at: latest[p.id] ?? null,
        last_message_content: latestContent[p.id] ?? null,
        unread: p.id === selectedId ? 0 : unread[p.id] ?? 0,
      }));

      setProfiles(
        enriched.sort((a, b) => {
          // sort by last_message_at desc, then name
          if (a.last_message_at && b.last_message_at) return b.last_message_at.localeCompare(a.last_message_at);
          if (a.last_message_at) return -1;
          if (b.last_message_at) return 1;
          return a.display_name.localeCompare(b.display_name);
        }),
      );

      setLoading(false);
    };
    load();

    const channel = supabase
      .channel("profiles-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        (payload) => {
          const row = payload.new as Profile;
          if (!row?.id || row.id === currentUserId) return;
          setProfiles((prev) => {
            const idx = prev.findIndex((p) => p.id === row.id);
            if (idx === -1) return [...prev, { ...row, last_message_at: null, unread: 0 }].sort((a, b) => a.display_name.localeCompare(b.display_name));
            const next = [...prev];
            next[idx] = { ...next[idx], ...row };
            return next;
          });
        },
      )
      .subscribe();

    // Subscribe to messages to update ordering and unread counts
    const msgChannel = supabase
      .channel("messages-list")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as any;
          const otherId = m.sender_id === currentUserId ? m.recipient_id : m.sender_id;
          if (!otherId || otherId === currentUserId) return;
          setProfiles((prev) => {
            const next = prev.map((p) => ({ ...p }));
            const idx = next.findIndex((p) => p.id === otherId);
            if (idx === -1) return prev;
            next[idx].last_message_at = m.created_at;
            next[idx].last_message_content = m.content;
            // increment unread only if the current user is recipient and the conversation is not currently open
            if (m.recipient_id === currentUserId && !m.is_seen) {
              next[idx].unread = otherId === selectedId ? 0 : (next[idx].unread || 0) + 1;
            }
            // move to top
            next.sort((a, b) => {
              if (a.last_message_at && b.last_message_at) return b.last_message_at.localeCompare(a.last_message_at);
              if (a.last_message_at) return -1;
              if (b.last_message_at) return 1;
              return a.display_name.localeCompare(b.display_name);
            });
            return next;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as any;
          if (m.recipient_id !== currentUserId || !m.is_seen) return;
          const otherId = m.sender_id;
          setProfiles((prev) =>
            prev.map((p) =>
              p.id === otherId ? { ...p, unread: p.id === selectedId ? 0 : p.unread } : p,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      supabase.removeChannel(msgChannel);
    };
  }, [currentUserId, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      previousSelectedId.current = selectedId;
      return;
    }

    setProfiles((prev) =>
      prev.map((p) =>
        p.id === selectedId || p.id === previousSelectedId.current
          ? { ...p, unread: 0 }
          : p,
      ),
    );
    previousSelectedId.current = selectedId;
  }, [selectedId]);

  const filtered = profiles
    .filter((p) => p.display_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a.last_message_at && b.last_message_at) return b.last_message_at.localeCompare(a.last_message_at);
      if (a.last_message_at) return -1;
      if (b.last_message_at) return 1;
      return a.display_name.localeCompare(b.display_name);
    });

  return (
    <div className="flex h-full flex-col bg-card/90 px-1 py-2 shadow-inner shadow-[#0a2914]/40 ring-1 ring-[#14ff9a]/10">
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8cffb1]/80" />
          <Input
            placeholder="Search people"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-[#02130a]/95 text-foreground ring-1 ring-[#14ff9a]/20 text-sm terminal-text"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="px-4 py-6 text-sm text-destructive">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No users found
          </p>
        ) : (
          <ul>
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => {
                    setProfiles((prev) => prev.map((q) => (q.id === p.id ? { ...q, unread: 0 } : q)));
                    onSelect(p.id);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-3xl border border-[#0f401f]/60 bg-[#02130a]/95 px-3 py-3 text-left transition duration-200 hover:bg-[#06321f]/90 focus:outline-none focus:ring-2 focus:ring-[#24ff9e]/40",
                    selectedId === p.id && "bg-[#0e4523]/80 border-[#24ff9e]/40",
                    p.unread && "ring-1 ring-[#24ff9e]/25",
                  )}
                >
                  <UserAvatar
                    name={formattedUserName(p.display_name, p.id)}
                    avatarUrl={p.avatar_url}
                    isOnline={p.is_online}
                    showStatus
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className={cn("truncate text-sm font-medium terminal-text", p.unread && "font-semibold text-foreground")}>{formattedUserName(p.display_name, p.id)}</p>
                      {p.unread ? (
                        <span className="ml-2 inline-flex items-center rounded-full bg-[#22ff92] px-2 py-0.5 text-xs font-medium text-[#03150f] shadow-[0_0_14px_rgba(34,255,146,0.18)]">{p.unread}</span>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-[#8cffb1]/80 terminal-text">
                      {p.last_message_content ? (
                        <span className="text-[#b3ffcb]/75">{p.last_message_content.length > 50 ? `${p.last_message_content.slice(0, 50)}…` : p.last_message_content}</span>
                      ) : p.is_online ? (
                        "Active now"
                      ) : (
                        `Last seen ${formatTime(p.last_seen)}`
                      )}
                    </p>
                  </div>
                  
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
