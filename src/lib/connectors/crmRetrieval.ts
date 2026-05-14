import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { searchKbChunks } from "@/lib/supabase/kb";

interface CrmRetrievalParams {
  fromE164: string;
  query: string;
  connectorIds: string[];
  agentId: string;
}

/**
 * Retrieves CRM context for a voice call by:
 *   1. Searching kb_chunks that are tagged with the connector's source_id
 *   2. Using semantic similarity search to find relevant records
 *   3. Formatting the results as plain text for prompt injection
 *
 * This replaces the old single-endpoint PRODUCTS_API_BASE proxy with a
 * multi-connector, embedding-backed retrieval system.
 */
export async function fetchConnectorCrmContext(
  params: CrmRetrievalParams
): Promise<string> {
  const { fromE164, query, connectorIds } = params;
  const admin = getSupabaseAdmin();
  if (!admin || connectorIds.length === 0) return "";

  try {
    // Search kb_chunks that have connector source metadata
    const snippets: string[] = [];

    // 1. Search by caller phone number in connector-synced data
    if (fromE164) {
      const { data: phoneMatches } = await admin
        .from("kb_chunks")
        .select("content,meta")
        .or(
          connectorIds.map((id) => `meta->connector_id.eq.${id}`).join(",") +
          `,content.ilike.%${fromE164.replace(/\D/g, "").slice(-10)}%`
        )
        .limit(3);

      if (phoneMatches && phoneMatches.length > 0) {
        snippets.push(
          ...(phoneMatches as { content: string }[]).map((r) => r.content)
        );
      }
    }

    // 2. Semantic query search across connector-tagged chunks
    const queryResults = await searchKbChunks(query, 4);
    if (queryResults) snippets.push(queryResults);

    if (snippets.length === 0) return "";

    // Deduplicate and join
    const unique = Array.from(new Set(snippets.filter(Boolean)));
    return unique.join("\n\n").slice(0, 6000);
  } catch (e) {
    console.warn("[crmRetrieval] failed", e instanceof Error ? e.message : e);
    return "";
  }
}

/**
 * Directly fetches fresh data from a connector's external REST API.
 * Used by the sync job and by on-demand retrieval when cache is stale.
 */
export async function fetchLiveConnectorData(
  connectorId: string
): Promise<{ records: unknown[]; error?: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { records: [], error: "no_admin_client" };

  const { data: connector, error } = await admin
    .from("crm_connectors")
    .select("*")
    .eq("id", connectorId)
    .maybeSingle();

  if (error || !connector) {
    return { records: [], error: error?.message ?? "connector_not_found" };
  }

  const cfg = (connector as Record<string, unknown>).config as ConnectorConfig;
  return fetchFromConnectorConfig(cfg);
}

export interface ConnectorConfig {
  base_url: string;
  endpoint: string;
  method?: "GET" | "POST";
  auth_type?: "none" | "api_key" | "bearer" | "basic";
  api_key?: string;
  bearer_token?: string;
  username?: string;
  password?: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  pagination?: {
    type: "page" | "cursor" | "offset";
    page_param?: string;
    limit_param?: string;
    limit?: number;
    max_pages?: number;
  };
  response_data_path?: string;
}

/**
 * Executes a REST API fetch according to the connector config.
 * Handles auth, pagination, and response extraction.
 */
export async function fetchFromConnectorConfig(
  cfg: ConnectorConfig
): Promise<{ records: unknown[]; error?: string }> {
  if (!cfg?.base_url || !cfg?.endpoint) {
    return { records: [], error: "invalid_connector_config" };
  }

  const method = cfg.method ?? "GET";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...cfg.headers,
  };

  // Apply authentication
  if (cfg.auth_type === "bearer" && cfg.bearer_token) {
    headers["Authorization"] = `Bearer ${cfg.bearer_token}`;
  } else if (cfg.auth_type === "api_key" && cfg.api_key) {
    headers["X-API-Key"] = cfg.api_key;
  } else if (cfg.auth_type === "basic" && cfg.username && cfg.password) {
    const b64 = Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64");
    headers["Authorization"] = `Basic ${b64}`;
  }

  const baseUrl = cfg.base_url.replace(/\/$/, "");
  const endpoint = cfg.endpoint.startsWith("/") ? cfg.endpoint : `/${cfg.endpoint}`;
  const url = `${baseUrl}${endpoint}`;

  const maxPages = cfg.pagination?.max_pages ?? 3;
  const allRecords: unknown[] = [];

  try {
    for (let page = 1; page <= maxPages; page++) {
      let fetchUrl = url;
      let bodyStr: string | undefined;

      if (cfg.pagination?.type === "page") {
        const sep = fetchUrl.includes("?") ? "&" : "?";
        const pageParam = cfg.pagination.page_param ?? "page";
        const limitParam = cfg.pagination.limit_param ?? "limit";
        const limit = cfg.pagination.limit ?? 100;
        fetchUrl = `${fetchUrl}${sep}${pageParam}=${page}&${limitParam}=${limit}`;
      } else if (cfg.pagination?.type === "offset") {
        const sep = fetchUrl.includes("?") ? "&" : "?";
        const offsetParam = cfg.pagination.page_param ?? "offset";
        const limit = cfg.pagination.limit ?? 100;
        fetchUrl = `${fetchUrl}${sep}${offsetParam}=${(page - 1) * limit}&limit=${limit}`;
      }

      if (method === "POST" && cfg.body) {
        bodyStr = JSON.stringify(cfg.body);
      }

      const res = await fetch(fetchUrl, {
        method,
        headers,
        body: bodyStr,
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        return {
          records: allRecords,
          error: `HTTP ${res.status} from ${fetchUrl}`,
        };
      }

      const json = await res.json() as unknown;

      // Extract records from nested path if configured
      let records: unknown[] = [];
      if (cfg.response_data_path) {
        const pathParts = cfg.response_data_path.split(".");
        let current: unknown = json;
        for (const part of pathParts) {
          if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
            current = (current as Record<string, unknown>)[part];
          } else {
            current = null;
            break;
          }
        }
        records = Array.isArray(current) ? current : current ? [current] : [];
      } else {
        records = Array.isArray(json) ? json : [json];
      }

      allRecords.push(...records);

      // Stop paginating if we got fewer records than the limit (last page)
      const limit = cfg.pagination?.limit ?? 100;
      if (!cfg.pagination || records.length < limit) break;
    }

    return { records: allRecords };
  } catch (e) {
    return {
      records: allRecords,
      error: e instanceof Error ? e.message : "fetch_failed",
    };
  }
}
