/**
 * Implementación de `CopilotStorage` sobre Supabase.
 *
 * Toda la org usa Supabase, así que ésta es la que va a usar cada sistema. El
 * adaptador existe igual para que un sistema con otra base pueda implementar la
 * interfaz sin tocar el paquete.
 *
 * Recibe el cliente ya construido —el paquete no decide cómo se autentica ni con
 * qué clave— y espera las dos tablas que crea la migración del paquete.
 *
 * `client` puede ser una función: los clientes de servicio suelen leer la clave
 * secreta al construirse, y si eso pasa al importar el módulo, el build se cae
 * en cualquier entorno que no tenga el secreto (CI, por ejemplo). Pasando la
 * fábrica, el cliente se construye recién en el primer request.
 */

import type {
  CopilotMessage,
  CopilotStorage,
  CopilotUsageRecord,
} from "../types";

/** Lo mínimo que se usa del cliente, para no atarse a una versión del SDK. */
type SupabaseLike = {
  from(table: string): any;
};

export type SupabaseStorageOptions = {
  /** El cliente, o una fábrica que lo construya perezosamente. */
  client: SupabaseLike | (() => SupabaseLike);
  /** Por si un sistema ya tiene las tablas con otro nombre. */
  conversationsTable?: string;
  usageTable?: string;
};

export function createSupabaseStorage(
  options: SupabaseStorageOptions
): CopilotStorage {
  const conversations = options.conversationsTable ?? "ai_help_conversations";
  const usage = options.usageTable ?? "ai_help_usage";

  let instance: SupabaseLike | null = null;
  const client: SupabaseLike = {
    from(table: string) {
      instance ??=
        typeof options.client === "function" ? options.client() : options.client;
      return instance.from(table);
    },
  };

  return {
    async countUsageSince(userId, since) {
      const { count } = await client
        .from(usage)
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", since.toISOString());
      return count ?? 0;
    },

    async sumCostSince(since) {
      // Se suma en memoria a propósito: son pocas filas por mes y evita
      // depender de una función agregada en la base.
      const { data } = await client
        .from(usage)
        .select("cost_usd")
        .gte("created_at", since.toISOString());
      const rows = (data ?? []) as Array<{ cost_usd: number | string }>;
      return rows.reduce((total, row) => total + Number(row.cost_usd ?? 0), 0);
    },

    async getOrCreateConversation(userId, conversationId, firstQuestion) {
      if (conversationId) {
        // El filtro por user_id es lo que impide leer el hilo de otra persona
        // pasando su id.
        const { data } = await client
          .from(conversations)
          .select("id, messages")
          .eq("id", conversationId)
          .eq("user_id", userId)
          .is("deleted_at", null)
          .maybeSingle();

        if (data) {
          const row = data as { id: string; messages: CopilotMessage[] | null };
          return { id: row.id, messages: row.messages ?? [] };
        }
      }

      const { data: created, error } = await client
        .from(conversations)
        .insert({ user_id: userId, title: firstQuestion.slice(0, 80), messages: [] })
        .select("id")
        .single();

      if (error || !created) {
        throw new Error(
          `No se pudo crear la conversación: ${error?.message ?? "sin detalle"}`
        );
      }
      return { id: (created as { id: string }).id, messages: [] };
    },

    async appendMessages(conversationId, messages) {
      await client
        .from(conversations)
        .update({ messages, updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    },

    async recordUsage(record: CopilotUsageRecord) {
      const { data } = await client
        .from(usage)
        .insert({
          user_id: record.userId,
          conversation_id: record.conversationId,
          model: record.model,
          question: record.question,
          answer: record.answer,
          route: record.route,
          input_tokens: record.usage.inputTokens,
          output_tokens: record.usage.outputTokens,
          cache_read_tokens: record.usage.cacheReadTokens,
          cache_creation_tokens: record.usage.cacheCreationTokens,
          cost_usd: record.costUsd,
          latency_ms: record.latencyMs,
          refused: record.refused,
          sections_used: record.sectionsUsed,
        })
        .select("id")
        .single();

      return (data as { id: string } | null)?.id ?? null;
    },

    async setFeedback(usageId, userId, value) {
      // El filtro por user_id impide votar la consulta de otra persona.
      await client
        .from(usage)
        .update({ feedback: value })
        .eq("id", usageId)
        .eq("user_id", userId);
    },

    async softDeleteConversation(conversationId, userId) {
      await client
        .from(conversations)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", conversationId)
        .eq("user_id", userId);
    },

    async listConversations(userId, limit) {
      const { data } = await client
        .from(conversations)
        .select("id, title, updated_at")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(limit);
      return (data ?? []) as Array<{
        id: string;
        title: string | null;
        updated_at: string;
      }>;
    },
  };
}
