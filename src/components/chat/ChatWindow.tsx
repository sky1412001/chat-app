import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "./UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send, ArrowLeft } from "lucide-react";
import { cn, formattedUserName } from "@/lib/utils";
import type { Profile } from "./UserList";
import { toast } from "sonner";

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
  is_seen?: boolean;
}

interface Props {
  currentUserId: string;
  otherUserId: string;
  onBack?: () => void;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

export function ChatWindow({ currentUserId, otherUserId, onBack }: Props) {
  const [other, setOther] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load peer profile + subscribe to their status changes
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("profiles")
      .select("*")
      .eq("id", otherUserId)
      .single()
      .then(({ data }) => {
        if (!cancelled && data) setOther(data as Profile);
      });

    const channel = supabase
      .channel(`profile-${otherUserId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${otherUserId}` },
        (payload) => setOther(payload.new as Profile),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [otherUserId]);

  // Load messages + subscribe
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMessages([]);

    const load = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${currentUserId},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${currentUserId})`,
        )
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) setError(error.message);
      else {
        const messagesData = (data as Message[]) ?? [];
        setMessages(
          messagesData.map((m) =>
            m.recipient_id === currentUserId && m.sender_id === otherUserId
              ? { ...m, is_seen: true }
              : m,
          ),
        );
      }
      setLoading(false);

      if (!cancelled) {
        try {
          await supabase
            .from("messages")
            .update({ is_seen: true })
            .eq("recipient_id", currentUserId)
            .eq("sender_id", otherUserId)
            .eq("is_seen", false);
        } catch (error) {
          console.error("Failed to mark messages as seen", error);
        }
      }
    };
    load();

    const channel = supabase
      .channel(`messages-${currentUserId}-${otherUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const m = payload.new as Message;
          const relevant =
            (m.sender_id === currentUserId && m.recipient_id === otherUserId) ||
            (m.sender_id === otherUserId && m.recipient_id === currentUserId);
          if (!relevant) return;

          const message = { ...m };
          if (m.recipient_id === currentUserId) {
            message.is_seen = true;
            try {
              await supabase.from("messages").update({ is_seen: true }).eq("id", m.id);
            } catch (error) {
              console.error("Failed to mark incoming message as seen", error);
            }
          }

          setMessages((prev) => (prev.some((x) => x.id === message.id) ? prev : [...prev, message]));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [currentUserId, otherUserId]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      sender_id: currentUserId,
      recipient_id: otherUserId,
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");

    const { data, error } = await supabase
      .from("messages")
      .insert({ sender_id: currentUserId, recipient_id: otherUserId, content: text })
      .select()
      .single();

    if (error) {
      toast.error("Failed to send message");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } else if (data) {
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? (data as Message) : m)),
      );
    }
    setSending(false);
  };

  return (
    <div className="flex h-full flex-col bg-[#020b06]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[#14ff9a]/20 bg-[#02130a]/95 px-4 py-4 shadow-[0_0_32px_rgba(18,255,140,0.16)] backdrop-blur-sm hacker-glow">
        {onBack && (
          <Button variant="ghost" size="icon" className="md:hidden text-[#94ffb8] hover:text-white" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        {other ? (
          <>
            <UserAvatar
              name={formattedUserName(other.display_name, other.id)}
              avatarUrl={other.avatar_url}
              isOnline={other.is_online}
              showStatus
            />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold leading-tight text-[#e8ffe4] terminal-text">{formattedUserName(other.display_name, other.id)}</p>
              <p className="text-xs text-[#8cffb1]/90 terminal-text">
                {other.is_online
                  ? "Online"
                  : `Last seen ${formatTime(other.last_seen)}`}
              </p>
            </div>
          </>
        ) : (
          <div className="h-10" />
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[#8cffb1]" />
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-[#8cffb1]/85 terminal-text">
              No messages yet. Say hi 👋
            </p>
          </div>
        ) : (
          <div className="flex w-full flex-col gap-3">
            {messages.map((m, i) => {
              const mine = m.sender_id === currentUserId;
              const prev = messages[i - 1];
              const showDate =
                !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
              return (
                <div key={m.id}>
                  {showDate && (
                    <div className="my-3 flex justify-center">
                      <span className="rounded-full bg-[#02130a]/95 px-3 py-1 text-xs font-medium text-[#8cffb1] shadow-[0_0_16px_rgba(46,255,154,0.14)] border border-[#18ff8d]/20">
                        {formatDateLabel(m.created_at)}
                      </span>
                    </div>
                  )}
                  <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[88%] rounded-3xl px-4 py-3 shadow-[0_0_28px_rgba(22,255,140,0.12)] sm:max-w-[72%] lg:max-w-[58%]",
                        mine
                          ? "rounded-br-[18px] bg-[#062918] text-[#d8ffd2] border border-[#16ff8d]/20"
                          : "rounded-bl-[18px] bg-[#092c16] text-[#c7ffd4] border border-[#13ff80]/15",
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed terminal-text">
                        {m.content}
                      </p>
                      <p
                        className={cn(
                          "mt-1 flex items-center justify-end gap-1 text-[10px] opacity-75 terminal-text",
                        )}
                      >
                        <span>{formatTime(m.created_at)}</span>
                        {mine ? (
                          <span className={cn(m.is_seen ? "text-[#7cff9b]" : "text-[#8cffb1]")}> 
                            {m.is_seen ? "✓✓" : "✓"}
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 border-t border-[#14ff9a]/20 bg-[#02130a]/95 px-3 py-3 sm:px-4"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message"
          className="flex-1 bg-[#081908] text-[#d8ffd2] placeholder:text-[#8cffb1]/50"
          disabled={sending}
        />
        <Button type="submit" size="icon" disabled={!input.trim() || sending} className="bg-[#14ff9a] text-[#02130a] hover:bg-[#0ce486]">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
