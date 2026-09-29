import { describe, expect, it, vi } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initClientHelpers } from "paseo-plugin-helper/client";
import { TopTimelineTelemetryCard } from "./telemetry";
import {
  topSettingsContract,
  TOP_TIMELINE_KIND,
  TOP_TIMELINE_VERSION,
  type TopTimelineTelemetryData,
} from "../shared/resources";

let agent: Record<string, unknown> = {};

vi.mock("@getpaseo/plugin/client", () => ({
  useAgent: (_id: string, sel: (a: unknown) => unknown) => sel(agent),
}));
vi.mock("@getpaseo/plugin/client/react-native", () => ({
  Icon: (props: { name?: string }) => React.createElement("mock-icon", { name: props.name }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

initClientHelpers({
  Icon: (props: { name?: string }) => React.createElement("mock-icon", { name: props.name }),
  Modal: Object.assign(() => null, { Content: () => null }),
  useRpc: () => async () => topSettingsContract.defaultSettings,
  useToast: () => ({}),
} as unknown as Parameters<typeof initClientHelpers>[0]);

function textOf(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (node && typeof node === "object") {
    const el = node as { type?: unknown; children?: unknown };
    if (el.type === "mock-icon") return "";
    if ("children" in el) return textOf(el.children);
  }
  return "";
}

const theme = {
  colors: new Proxy({}, { get: () => "#888888" }),
} as unknown as Parameters<typeof TopTimelineTelemetryCard>[0]["theme"];

const base: TopTimelineTelemetryData = {
  turnId: "t1",
  agentId: "abcdef1234567890",
  outcomeKind: "completed",
  timestamp: "2026-09-29T13:32:29.000Z",
  cpuPercent: 27,
  memUsedBytes: 1024 ** 3,
  memTotalBytes: 8 * 1024 ** 3,
  memPercent: 12.5,
  loadAvg1m: 0.42,
};

async function renderCard(data: TopTimelineTelemetryData): Promise<string> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <QueryClientProvider client={queryClient}>
        <TopTimelineTelemetryCard
          {...({
            item: { type: "plugin", kind: TOP_TIMELINE_KIND, version: TOP_TIMELINE_VERSION, data },
            theme,
            layout: { compact: false, platform: "web", width: 1200, height: 800 },
            timestamp: new Date(data.timestamp ?? 0),
          } as unknown as Parameters<typeof TopTimelineTelemetryCard>[0])}
        />
      </QueryClientProvider>,
    );
  });
  return textOf(renderer.toJSON());
}

// The card mounts collapsed, so these assert on the always-visible header.
describe("TopTimelineTelemetryCard throughput", () => {
  it("renders tok/s beside the turn duration in the collapsed header", async () => {
    agent = {};
    const text = await renderCard({ ...base, outputTokens: 2600, durationMs: 41400 });
    expect(text).toContain("41.4s");
    expect(text).toContain("63 tok/s");
  });

  it("omits tok/s when the turn has no duration", async () => {
    agent = {};
    const text = await renderCard({ ...base, outputTokens: 2600 });
    expect(text).not.toContain("tok/s");
  });

  it("omits tok/s when output tokens only come from live usage", async () => {
    agent = { lastUsage: { outputTokens: 9000 } };
    const text = await renderCard({ ...base, durationMs: 41400 });
    expect(text).toContain("41.4s");
    expect(text).not.toContain("tok/s");
  });
});
