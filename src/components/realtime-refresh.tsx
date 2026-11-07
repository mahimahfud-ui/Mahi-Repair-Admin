"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type BroadcastMessage = {
  payload?: unknown;
};

function eventIdFromMessage(message: BroadcastMessage): string | null {
  if (!message.payload || typeof message.payload !== "object") return null;
  const value = (message.payload as Record<string, unknown>).event_id;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Active Owner-only realtime invalidation. Database triggers publish opaque
 * event IDs; the console always reloads its data through Owner-guarded SSR.
 * A short polling fallback covers websocket/network interruptions.
 */
export function RealtimeRefresh() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let disposed = false;
    let connected = false;
    let retryMs = 2_000;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const processedEvents = new Set<string>();

    const scheduleReconnect = () => {
      if (disposed || retryTimer) return;
      connected = false;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        void connect();
      }, retryMs);
      retryMs = Math.min(retryMs * 2, 30_000);
    };

    const connect = async () => {
      if (disposed || channel) return;
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session) {
          scheduleReconnect();
          return;
        }

        supabase.realtime.setAuth(data.session.access_token);
        channel = supabase
          .channel("mahi-repair:admin", { config: { private: true } })
          .on("broadcast", { event: "admin_data_changed" }, (message: BroadcastMessage) => {
            const eventId = eventIdFromMessage(message);
            if (eventId) {
              if (processedEvents.has(eventId)) return;
              processedEvents.add(eventId);
              if (processedEvents.size > 256) {
                const oldest = processedEvents.values().next().value;
                if (oldest) processedEvents.delete(oldest);
              }
            }
            router.refresh();
          })
          .subscribe((status: string) => {
            if (status === "SUBSCRIBED") {
              connected = true;
              retryMs = 2_000;
              router.refresh();
              return;
            }

            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              connected = false;
              const failedChannel = channel;
              channel = null;
              if (failedChannel) void supabase.removeChannel(failedChannel);
              scheduleReconnect();
            }
          });
      } catch {
        scheduleReconnect();
      }
    };

    const authListener = supabase.auth.onAuthStateChange((event: string, session: { access_token: string } | null) => {
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      if (event === "SIGNED_OUT") {
        connected = false;
        const activeChannel = channel;
        channel = null;
        if (activeChannel) void supabase.removeChannel(activeChannel);
      } else if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && !channel) {
        scheduleReconnect();
      }
    });

    const fallbackTimer = setInterval(() => {
      if (!connected) router.refresh();
    }, 15_000);

    void connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (fallbackTimer) clearInterval(fallbackTimer);
      authListener.data.subscription.unsubscribe();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
