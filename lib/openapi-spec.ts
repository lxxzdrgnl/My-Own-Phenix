import type { OpenAPIV3_1 } from "openapi-types";

export const MY_PHENIX_PATHS: OpenAPIV3_1.PathsObject = {
  // ── Auth ──
  "/api/auth/sync": {
    post: {
      tags: ["Auth"],
      summary: "Sync user after Firebase login",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                uid: { type: "string" },
                email: { type: "string" },
                name: { type: "string" },
              },
              required: ["uid", "email"],
            },
          },
        },
      },
      responses: { "200": { description: "User synced" } },
    },
  },

  // ── Chat ──
  "/api/user-threads": {
    get: {
      tags: ["Chat"],
      summary: "List chat threads",
      parameters: [
        { name: "userId", in: "query", required: true, schema: { type: "string" } },
        { name: "project", in: "query", schema: { type: "string" } },
      ],
      responses: { "200": { description: "Thread list" } },
    },
    post: {
      tags: ["Chat"],
      summary: "Create chat thread",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                userId: { type: "string" },
                langGraphThreadId: { type: "string" },
                title: { type: "string" },
                project: { type: "string" },
              },
              required: ["userId", "langGraphThreadId"],
            },
          },
        },
      },
      responses: { "200": { description: "Thread created" } },
    },
  },
  "/api/user-threads/{id}": {
    delete: {
      tags: ["Chat"],
      summary: "Delete chat thread",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { "200": { description: "Thread deleted" } },
    },
  },
  "/api/user-threads/{id}/messages": {
    get: {
      tags: ["Chat"],
      summary: "List messages in thread",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { "200": { description: "Message list" } },
    },
    post: {
      tags: ["Chat"],
      summary: "Add message to thread",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                role: { type: "string" },
                content: { type: "string" },
              },
              required: ["role", "content"],
            },
          },
        },
      },
      responses: { "200": { description: "Message added" } },
    },
  },
  "/api/llm": {
    post: {
      tags: ["Chat"],
      summary: "Call LLM (multi-provider)",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                messages: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      role: { type: "string" },
                      content: { type: "string" },
                    },
                  },
                },
                model: { type: "string", default: "gpt-4o-mini" },
                temperature: { type: "number", default: 0.7 },
                promptLabel: { type: "string" },
              },
              required: ["messages"],
            },
          },
        },
      },
      responses: { "200": { description: "LLM response (OpenAI-compatible format)" } },
    },
  },
  "/api/feedback": {
    get: {
      tags: ["Chat"],
      summary: "Get message feedback",
      parameters: [
        { name: "messageId", in: "query", required: true, schema: { type: "string" } },
        { name: "userId", in: "query", required: true, schema: { type: "string" } },
      ],
      responses: { "200": { description: "Feedback value" } },
    },
    post: {
      tags: ["Chat"],
      summary: "Submit message feedback",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                messageId: { type: "string" },
                userId: { type: "string" },
                value: { type: "string", enum: ["up", "down"] },
              },
              required: ["messageId", "userId", "value"],
            },
          },
        },
      },
      responses: { "200": { description: "Feedback saved" } },
    },
    delete: {
      tags: ["Chat"],
      summary: "Delete message feedback",
      responses: { "200": { description: "Feedback deleted" } },
    },
  },

  // ── Providers ──
  "/api/providers": {
    get: {
      tags: ["Providers"],
      summary: "List LLM providers",
      parameters: [
        {
          name: "decrypt",
          in: "query",
          schema: { type: "string", enum: ["true"] },
          description: "Return decrypted keys (internal use)",
        },
      ],
      responses: { "200": { description: "Provider list with masked API keys" } },
    },
    post: {
      tags: ["Providers"],
      summary: "Register LLM provider",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                provider: { type: "string", enum: ["openai", "anthropic", "google", "xai"] },
                apiKey: { type: "string" },
              },
              required: ["provider", "apiKey"],
            },
          },
        },
      },
      responses: { "200": { description: "Provider registered" } },
    },
  },
  "/api/providers/{id}": {
    put: {
      tags: ["Providers"],
      summary: "Update provider API key",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { "200": { description: "Provider updated" } },
    },
    delete: {
      tags: ["Providers"],
      summary: "Delete provider",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { "200": { description: "Provider deleted" } },
    },
  },
  "/api/providers/test": {
    post: {
      tags: ["Providers"],
      summary: "Test provider connection",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                provider: { type: "string" },
                apiKey: { type: "string" },
              },
              required: ["provider", "apiKey"],
            },
          },
        },
      },
      responses: { "200": { description: "Connection test result" } },
    },
  },

  // ── Annotations ──
  "/api/annotations": {
    post: {
      tags: ["Annotations"],
      summary: "Add human annotation to span",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                spanId: { type: "string" },
                name: { type: "string" },
                label: { type: "string" },
                score: { type: "number" },
                explanation: { type: "string" },
              },
              required: ["spanId", "name", "label"],
            },
          },
        },
      },
      responses: { "200": { description: "Annotation saved" } },
    },
  },

  // ── Evaluations ──
  "/api/eval-prompts": {
    get: {
      tags: ["Evaluations"],
      summary: "List eval prompts",
      responses: { "200": { description: "Eval prompt list" } },
    },
    put: {
      tags: ["Evaluations"],
      summary: "Create or update eval prompt",
      responses: { "200": { description: "Eval prompt saved" } },
    },
    delete: {
      tags: ["Evaluations"],
      summary: "Delete eval prompt",
      responses: { "200": { description: "Eval prompt deleted" } },
    },
  },
  "/api/eval-backfill": {
    post: {
      tags: ["Evaluations"],
      summary: "Run eval backfill on date range",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                projectId: { type: "string" },
                evalName: { type: "string" },
                startDate: { type: "string" },
                endDate: { type: "string" },
              },
              required: ["projectId", "evalName", "startDate", "endDate"],
            },
          },
        },
      },
      responses: { "200": { description: "Backfill results" } },
    },
  },
  "/api/eval-config": {
    get: {
      tags: ["Evaluations"],
      summary: "Get project eval config",
      parameters: [{ name: "projectId", in: "query", required: true, schema: { type: "string" } }],
      responses: { "200": { description: "Eval config list" } },
    },
    put: {
      tags: ["Evaluations"],
      summary: "Update project eval config",
      responses: { "200": { description: "Config updated" } },
    },
  },

  // ── Datasets ──
  "/api/datasets": {
    get: {
      tags: ["Datasets"],
      summary: "List datasets",
      responses: { "200": { description: "Dataset list" } },
    },
    post: {
      tags: ["Datasets"],
      summary: "Create dataset",
      responses: { "200": { description: "Dataset created" } },
    },
    put: {
      tags: ["Datasets"],
      summary: "Update dataset",
      responses: { "200": { description: "Dataset updated" } },
    },
    delete: {
      tags: ["Datasets"],
      summary: "Delete dataset",
      responses: { "200": { description: "Dataset deleted" } },
    },
  },
  "/api/datasets/rows": {
    get: {
      tags: ["Datasets"],
      summary: "Get dataset rows (paginated)",
      responses: { "200": { description: "Row list" } },
    },
    post: {
      tags: ["Datasets"],
      summary: "Add rows to dataset",
      responses: { "200": { description: "Rows added" } },
    },
    put: {
      tags: ["Datasets"],
      summary: "Update row",
      responses: { "200": { description: "Row updated" } },
    },
    delete: {
      tags: ["Datasets"],
      summary: "Delete rows",
      responses: { "200": { description: "Rows deleted" } },
    },
  },
  "/api/datasets/runs": {
    get: {
      tags: ["Datasets"],
      summary: "List dataset runs",
      responses: { "200": { description: "Run list" } },
    },
    post: {
      tags: ["Datasets"],
      summary: "Create dataset run",
      responses: { "200": { description: "Run created" } },
    },
  },
  "/api/datasets/runs/{runId}": {
    get: {
      tags: ["Datasets"],
      summary: "Get run with results",
      parameters: [{ name: "runId", in: "path", required: true, schema: { type: "string" } }],
      responses: { "200": { description: "Run details" } },
    },
    put: {
      tags: ["Datasets"],
      summary: "Update run",
      parameters: [{ name: "runId", in: "path", required: true, schema: { type: "string" } }],
      responses: { "200": { description: "Run updated" } },
    },
    delete: {
      tags: ["Datasets"],
      summary: "Delete run",
      parameters: [{ name: "runId", in: "path", required: true, schema: { type: "string" } }],
      responses: { "200": { description: "Run deleted" } },
    },
  },
  "/api/datasets/runs/{runId}/export": {
    get: {
      tags: ["Datasets"],
      summary: "Export run results as CSV",
      parameters: [{ name: "runId", in: "path", required: true, schema: { type: "string" } }],
      responses: { "200": { description: "CSV file" } },
    },
  },

  // ── Agents ──
  "/api/agent-config": {
    get: {
      tags: ["Agents"],
      summary: "List project-agent configs",
      responses: { "200": { description: "Config list" } },
    },
    put: {
      tags: ["Agents"],
      summary: "Upsert project-agent config",
      responses: { "200": { description: "Config saved" } },
    },
    delete: {
      tags: ["Agents"],
      summary: "Delete project-agent config",
      responses: { "200": { description: "Config deleted" } },
    },
  },
  "/api/agent-templates": {
    get: {
      tags: ["Agents"],
      summary: "List agent templates",
      responses: { "200": { description: "Template list" } },
    },
    post: {
      tags: ["Agents"],
      summary: "Create agent template",
      responses: { "200": { description: "Template created" } },
    },
    put: {
      tags: ["Agents"],
      summary: "Update agent template",
      responses: { "200": { description: "Template updated" } },
    },
    delete: {
      tags: ["Agents"],
      summary: "Delete agent template",
      responses: { "200": { description: "Template deleted" } },
    },
  },

  // ── Settings ──
  "/api/settings": {
    get: {
      tags: ["Settings"],
      summary: "Get app settings",
      responses: { "200": { description: "Settings key-value pairs" } },
    },
    put: {
      tags: ["Settings"],
      summary: "Update app settings",
      responses: { "200": { description: "Settings saved" } },
    },
  },

  // ── Dashboard ──
  "/api/dashboard/layout": {
    get: {
      tags: ["Dashboard"],
      summary: "Get dashboard layout",
      responses: { "200": { description: "Layout data" } },
    },
    put: {
      tags: ["Dashboard"],
      summary: "Save dashboard layout",
      responses: { "200": { description: "Layout saved" } },
    },
  },
};

export const MY_PHENIX_INFO: OpenAPIV3_1.InfoObject = {
  title: "My Own Phenix API",
  version: "1.0.0",
  description: "Unified API for LLM observability, evaluation, and chat — powered by Arize Phoenix",
};

export const SECURITY_SCHEMES: OpenAPIV3_1.ComponentsObject["securitySchemes"] = {
  BearerAuth: {
    type: "http",
    scheme: "bearer",
    bearerFormat: "Firebase ID Token",
  },
};
