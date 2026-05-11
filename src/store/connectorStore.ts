import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Connector {
  id: string;
  name: string;
  type: "CRM" | "ERP" | "Database" | "API";
  status: "connected" | "disconnected" | "error";
  lastSync?: string;
  latency?: string;
  logoUrl?: string;
  /** REST / custom API */
  baseUrl?: string;
  apiKey?: string;
  headersJson?: string;
  /** Database */
  dbHost?: string;
  dbPort?: string;
  dbName?: string;
  dbUser?: string;
  dbPassword?: string;
  dbSsl?: boolean;
}

export interface FieldMapping {
  id: string;
  connectorId: string;
  externalField: string;
  aiField: string;
}

interface ConnectorState {
  connectors: Connector[];
  fieldMappings: FieldMapping[];
  toggleConnectorStatus: (id: string) => void;
  updateConnector: (id: string, patch: Partial<Connector>) => void;
  addFieldMapping: (connectorId: string, externalField: string, aiField: string) => void;
  updateFieldMapping: (id: string, patch: Partial<FieldMapping>) => void;
  removeFieldMapping: (id: string) => void;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useConnectorStore = create<ConnectorState>()(
  persist(
    (set, get) => ({
      connectors: [
        {
          id: "1",
          name: "HubSpot",
          type: "CRM",
          status: "connected",
          lastSync: "2m ago",
          latency: "120ms",
          baseUrl: "https://api.hubapi.com",
        },
        { id: "2", name: "Salesforce", type: "CRM", status: "disconnected", baseUrl: "" },
        {
          id: "3",
          name: "Odoo ERP",
          type: "ERP",
          status: "error",
          lastSync: "1h ago",
          latency: "400ms",
          baseUrl: "",
        },
        {
          id: "4",
          name: "Custom REST API",
          type: "API",
          status: "connected",
          lastSync: "10s ago",
          latency: "45ms",
          baseUrl: "https://api.example.com/v1",
        },
        {
          id: "5",
          name: "SQL Database",
          type: "Database",
          status: "connected",
          lastSync: "1m ago",
          latency: "12ms",
          dbHost: "db.internal",
          dbPort: "5432",
          dbName: "crm",
        },
      ],
      fieldMappings: [
        { id: "m1", connectorId: "1", externalField: "firstname", aiField: "first_name" },
        { id: "m2", connectorId: "1", externalField: "phone", aiField: "phone" },
        { id: "m3", connectorId: "4", externalField: "dealer_code", aiField: "dealer_code" },
      ],

      toggleConnectorStatus: (id) =>
        set((state) => ({
          connectors: state.connectors.map((c) =>
            c.id === id ? { ...c, status: c.status === "connected" ? "disconnected" : "connected" } : c
          ),
        })),

      updateConnector: (id, patch) =>
        set((state) => ({
          connectors: state.connectors.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),

      addFieldMapping: (connectorId, externalField, aiField) =>
        set({
          fieldMappings: [
            ...get().fieldMappings,
            { id: uid(), connectorId, externalField, aiField },
          ],
        }),

      updateFieldMapping: (id, patch) =>
        set({
          fieldMappings: get().fieldMappings.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        }),

      removeFieldMapping: (id) =>
        set({
          fieldMappings: get().fieldMappings.filter((m) => m.id !== id),
        }),
    }),
    { name: "connector-workspace-mvp" }
  )
);
