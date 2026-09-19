import { requireViewer } from "@/lib/auth";
import { AssistantChat } from "@/components/assistant-chat";
import { Card, SectionTitle } from "@/components/ui";
import type { AssistantMessage } from "@/lib/types";

export default async function AssistantPage() {
  const viewer = await requireViewer();
  const { supabase, userId } = viewer;

  const { data } = await supabase
    .from("tb_assistant_messages")
    .select("*")
    .eq("employee_id", userId)
    .order("created_at", { ascending: true })
    .limit(50);

  const messages = ((data ?? []) as AssistantMessage[]).map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Career assistant</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Grounded in your own profile and the open roles. It quotes the real fit
          scores and will say when it does not know something rather than inventing
          an answer.
        </p>
      </div>

      <AssistantChat initialMessages={messages} />

      <Card>
        <SectionTitle>Privacy</SectionTitle>
        <p className="text-sm leading-relaxed text-muted">
          These conversations are yours. The row level security policy on the
          message table scopes both reading and writing to your own user id, and no
          HR policy overrides it — HR administrators cannot read this thread, by
          design.
        </p>
      </Card>
    </div>
  );
}
