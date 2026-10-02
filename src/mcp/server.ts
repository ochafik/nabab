#!/usr/bin/env node
/**
 * MCP server factory for Nabab: a Bayesian modelling toolbox for LLMs.
 *
 * Transports live in platform-specific entries:
 *   - src/mcp/node.ts   (stdio, express HTTP — Node)
 *   - src/mcp/worker.ts (Cloudflare Workers: one Durable Object per session)
 *
 * Tools are stateless with respect to evidence: every call passes its full
 * evidence. Networks are referenced by `network`: inline XMLBIF/BIF/JSON, an
 * http(s) URL, a bundled example name, or a handle returned by an earlier call.
 * `query` renders the interactive viewer (MCP App).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { toXmlBif } from '../lib/xmlbif-writer.js';
import { toJSON } from '../lib/json-export.js';
import { EXAMPLES, findExample } from './examples.js';
import {
  NetworkRegistry, NetworkRefError, fetchLimited,
  type McpAssets, type SessionStore, type NetworkEntry,
} from './networks.js';
import { buildNetworkFromSpec, SpecError } from './build-spec.js';
import {
  ToolError, DEFAULT_LIMITS, queryNetwork, explainNetwork, whatToObserve, sensitivityReport,
  interveneReport, learnFromCsvText, describeNetwork, summarizeBuilt, toEvidence, toSoftEvidence,
  type AnalysisLimits,
} from './analysis.js';

export type { McpAssets, SessionStore, SourceRecord } from './networks.js';

// ─── Server factory ─────────────────────────────────────────────────

export interface CreateServerOptions {
  assets: McpAssets;
  /** Persists handle -> source so handles survive process eviction (Workers). */
  store?: SessionStore;
  /** Override the exact-inference budget (largest clique, in table entries). */
  limits?: Partial<AnalysisLimits>;
}

const RESOURCE_URI = 'ui://nabab/mcp-app.html';

// Shared input fragments
const networkArg = z.string().describe(
  'The network: a handle (bn_…) returned by build_network / learn_from_csv / a previous call, a bundled example name (see list_examples, e.g. "asia", "alarm.xml", "bench/insurance.bif"), an http(s) URL to an XMLBIF/BIF file, or inline XMLBIF / BIF / nabab-JSON text.',
);
const scalar = z.union([z.string(), z.number(), z.boolean()]);
const evidenceArg = z.record(z.string(), scalar).optional().describe(
  'Hard evidence: { variableName: observedOutcome }, e.g. {"Smoking": "yes"}. Pass ALL evidence on every call (tools keep no evidence state).',
);
const softEvidenceArg = z.record(z.string(), z.record(z.string(), z.number())).optional().describe(
  'Soft (likelihood) evidence for uncertain observations: { variable: { outcome: relative weight } }, e.g. {"Alarm": {"on": 0.8, "off": 0.2}}. Unlisted outcomes default to weight 1.',
);

const BUILD_DESCRIPTION = `Build a Bayesian network from a JSON spec and get a handle to use with the other tools. You write parameters, not full tables.

spec = { "name": "...", "variables": [ { "name", "outcomes": [2+ strings] | "temporal": {...}, "parents": [names], "cpt": ... } ] }

"cpt" kinds (parents may be listed in any order; the DAG must be acyclic):
- Root variable: [p1, p2, ...] or {"yes": 0.3, "no": 0.7} (aligned with outcomes; must sum to 1).
- Explicit table: [[row per parent configuration], ...] or flat; first parent varies slowest, each row lists the child's outcomes in order and sums to 1.
- {"type":"conditional","rows":[{"when":{"Parent":"outcome"},"probs":{"yes":0.9,"no":0.1}}, ...],"default":{...}}: rules, first matching row wins ("when" may mention only some parents). Least error-prone for tables.
- {"type":"noisyOr","leak":0.01,"weights":{"Cause1":0.8,"Cause2":0.6}}: binary child, each parent's second outcome counts as active (or give "activeOutcomes":{"P":"outcome"}). Use for many independent causes.
- {"type":"gatedLogistic","base":{"o1":1,"o2":3},"gate":[[{"parent":"P","outcomes":["yes"]}]],"shifts":[{"parent":"Q","outcome":"high","logOdds":{"o1":1.5}}],"nullOutcome":"o1"}: softmax of log(base) + log-odds shifts for the parent outcomes present; if the gate (an AND of OR-groups of {parent,outcomes}) is not satisfied the child is forced to nullOutcome (default: first outcome). A logOdds of "-Infinity" forbids an outcome.
- Temporal events ("what happens, and when, or never"): declare "temporal":{"outcomes":["success","failure"],"buckets":["Q1","Q2","Q3"]} instead of "outcomes"; outcomes become none, success@Q1, ... A root prior: {"type":"hazardPrior","pOccur":0.7,"outcomes":{"success":3,"failure":1},"hazard":[1,2,1],"hazardMode":"weights"|"rates"}. A child with parents uses gatedLogistic with "base":{"pOccur":..,"hazard":[..]} and "delays":[{"parent":"P","delay":1}] (child cannot resolve earlier than parent + delay buckets).
- {"type":"uniform"}.

Example:
{"name":"Sprinkler","variables":[
 {"name":"Rain","outcomes":["yes","no"],"cpt":[0.2,0.8]},
 {"name":"Sprinkler","outcomes":["on","off"],"parents":["Rain"],"cpt":{"type":"conditional","rows":[{"when":{"Rain":"yes"},"probs":{"on":0.01,"off":0.99}},{"when":{"Rain":"no"},"probs":{"on":0.4,"off":0.6}}]}},
 {"name":"WetGrass","outcomes":["wet","dry"],"parents":["Rain","Sprinkler"],"cpt":{"type":"noisyOr","leak":0.0,"weights":{"Rain":0.9,"Sprinkler":0.8},"activeOutcomes":{"Rain":"yes","Sprinkler":"on"},"nullOutcome":"dry"}}]}

Errors list every problem found with the expected shape, so fix them all and retry. Returns the handle, the structure and prior marginals; use export_network for XMLBIF/JSON.`;

export function createServer(opts: CreateServerOptions): McpServer {
  const { assets } = opts;
  const limits: AnalysisLimits = { ...DEFAULT_LIMITS, ...opts.limits };
  const registry = new NetworkRegistry(assets, opts.store);
  const server = new McpServer({ name: 'nabab', version: '1.0.0' });

  /** Run a tool body; turn expected failures into `isError` results the model can act on. */
  async function guarded(fn: () => Promise<CallToolResult> | CallToolResult): Promise<CallToolResult> {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof ToolError || e instanceof NetworkRefError || e instanceof SpecError
        ? e.message
        : e instanceof Error ? e.message.replace(/^nabab: /, '') : String(e);
      return { content: [{ type: 'text', text: msg }], isError: true };
    }
  }

  const ok = (text: string, structured?: Record<string, unknown>): CallToolResult =>
    ({ content: [{ type: 'text', text }], ...(structured ? { structuredContent: structured } : {}) });

  const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;

  // ── list_examples ─────────────────────────────────────────────────

  server.registerTool('list_examples', {
    title: 'List example networks',
    description: 'List the bundled example Bayesian networks and datasets (the same ones the web viewer offers, including the bnlearn benchmark models). Pass a name as `network` to any tool, or a dataset name to learn_from_csv.',
    inputSchema: {},
    annotations: READ_ONLY,
  }, async () => {
    const nets = EXAMPLES.filter(e => e.kind === 'network');
    const csvs = EXAMPLES.filter(e => e.kind === 'csv');
    const line = (e: typeof EXAMPLES[number]) => `  ${e.name} - ${e.title}, ${e.variables} ${e.kind === 'csv' ? 'columns' : 'variables'}`;
    return ok([
      `Example networks (pass the name as \`network\`; extension and "bench/" prefix are optional when unambiguous):`,
      ...nets.map(line),
      'Datasets for learn_from_csv:',
      ...csvs.map(line),
      'Large networks may require method:"sampling" in query.',
    ].join('\n'), { examples: EXAMPLES.map(e => ({ ...e })) });
  });

  // ── describe_network ──────────────────────────────────────────────

  server.registerTool('describe_network', {
    title: 'Describe a network',
    description: 'Show the structure of a network (variables, outcomes, parents), whether exact inference is feasible, and optionally the CPTs of chosen variables. Use it to learn the variable and outcome names before setting evidence. Returns a handle for reuse.',
    inputSchema: {
      network: networkArg,
      cpts: z.array(z.string()).optional().describe('Variable names whose conditional probability tables to print.'),
    },
    annotations: READ_ONLY,
  }, ({ network, cpts }) => guarded(async () => {
    const entry = await registry.resolve(network);
    return ok(describeNetwork(entry.network, entry.handle, limits, cpts), { network: entry.handle });
  }));

  // ── build_network ─────────────────────────────────────────────────

  server.registerTool('build_network', {
    title: 'Build a Bayesian network',
    description: BUILD_DESCRIPTION,
    inputSchema: {
      spec: z.object({
        name: z.string().optional(),
        variables: z.array(z.object({
          name: z.string(),
          outcomes: z.array(scalar).optional(),
          temporal: z.object({
            outcomes: z.array(z.string()),
            buckets: z.array(z.string()),
            nullOutcome: z.string().optional(),
          }).optional(),
          parents: z.array(z.string()).optional(),
          cpt: z.unknown().describe('Conditional probability spec; see the tool description.'),
        })),
      }).describe('Network specification; see the tool description for the cpt kinds and an example.'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, ({ spec }) => guarded(async () => {
    const { network, kinds } = buildNetworkFromSpec(spec);
    const entry = await registry.register(network);
    return ok(
      summarizeBuilt(network, entry.handle, limits, kinds) + '\nNext: query / explain / what_to_observe / sensitivity / intervene with network="' + entry.handle + '", or export_network.',
      { network: entry.handle },
    );
  }));

  // ── learn_from_csv ────────────────────────────────────────────────

  server.registerTool('learn_from_csv', {
    title: 'Learn a network from CSV',
    description: 'Learn structure (hill climbing, BIC) and parameters from categorical CSV data (header row of variable names, one row per observation; comma, tab or semicolon separated). `csv` is the CSV text itself, an http(s) URL, or a bundled dataset name (see list_examples). Continuous columns must be discretized first. Returns a handle and the learned edges; the structure reflects association, not necessarily causation.',
    inputSchema: {
      csv: z.string().describe('CSV text, an http(s) URL, or a dataset name such as "bench/weather.csv".'),
      name: z.string().optional().describe('Name for the learned network.'),
      maxParents: z.number().int().min(1).max(6).optional().describe('Maximum parents per variable (default 3).'),
      scoreFunction: z.enum(['bic', 'aic', 'k2']).optional().describe('Structure score (default bic).'),
      restarts: z.number().int().min(0).max(20).optional().describe('Random restarts of the hill climb (default 0).'),
    },
    annotations: READ_ONLY,
  }, ({ csv, name, maxParents, scoreFunction, restarts }) => guarded(async () => {
    let text: string;
    let defaultName = 'learned';
    const trimmed = csv.trim();
    if (/^https?:\/\//i.test(trimmed) && !trimmed.includes('\n')) {
      text = await fetchLimited(trimmed);
    } else if (!trimmed.includes('\n')) {
      const info = findExample(trimmed);
      if (!info || info.kind !== 'csv') {
        throw new ToolError(`"${trimmed.slice(0, 60)}" is not CSV text (no newline), a URL or a bundled dataset (${EXAMPLES.filter(e => e.kind === 'csv').map(e => e.name).join(', ')}).`);
      }
      const t = await assets.readExample(info.name);
      if (t == null) throw new ToolError(`Dataset "${info.name}" is not available on this deployment.`);
      text = t;
      defaultName = info.name.replace(/^bench\//, '').replace(/\.csv$/, '');
    } else {
      text = csv;
    }
    const { network, text: summary } = learnFromCsvText(text, { name: name ?? defaultName, maxParents, scoreFunction, restarts });
    const entry = await registry.register(network);
    return ok(`${summary}\nHandle: ${entry.handle}. ${summarizeBuilt(network, entry.handle, limits)}`, { network: entry.handle });
  }));

  // ── query (MCP App tool with UI) ──────────────────────────────────

  registerAppTool(server, 'query', {
    title: 'Query Bayesian Network',
    description: 'Compute posterior probabilities P(variable | evidence) and show the interactive network viewer. Output lists each variable\'s distribution with the change versus the prior (percentage points) and P(evidence). `network` is a handle, example name, URL or inline XMLBIF/BIF. Pass the full `evidence` (hard) and `softEvidence` every call. `variables` limits the output (recommended for big networks). method "exact" (default) refuses networks whose junction tree is too large and suggests "sampling" (likelihood weighting, approximate); "auto" picks exact when affordable.',
    inputSchema: z.object({
      network: networkArg,
      evidence: evidenceArg,
      softEvidence: softEvidenceArg,
      variables: z.array(z.string()).optional().describe('Variables to report (default: all, first 40 shown in text).'),
      method: z.enum(['exact', 'sampling', 'auto']).optional().describe('Inference method (default exact).'),
      samples: z.number().int().min(100).max(1_000_000).optional().describe('Sample count for method "sampling" (default 20000).'),
      seed: z.number().int().optional().describe('Seed for reproducible sampling.'),
    }),
    annotations: READ_ONLY,
    _meta: { ui: { resourceUri: RESOURCE_URI } },
  }, ({ network, evidence, softEvidence, variables, method, samples, seed }) => guarded(async () => {
    const entry = await registry.resolve(network);
    const ev = toEvidence(evidence);
    const soft = toSoftEvidence(softEvidence);
    const r = queryNetwork(entry.network, entry.handle, {
      evidence: ev, soft, variables, method: method ?? 'exact', samples: samples ?? 20_000, seed, limits, priors: entry.priors,
    });
    if (r.priors && !entry.priors) entry.priors = r.priors;
    return {
      content: [{ type: 'text', text: r.text }],
      structuredContent: viewerData(entry, ev, r.posteriors, r.method, r.probabilityOfEvidence),
    };
  }));

  /** structuredContent consumed by src/viewer/mcp-app.ts (`source`, `evidence`) and the host. */
  function viewerData(
    entry: NetworkEntry,
    ev: Map<string, string>,
    posteriors: Record<string, Record<string, number>>,
    method: string,
    probabilityOfEvidence?: number,
  ): Record<string, unknown> {
    const n = entry.network;
    return {
      source: entry.xmlbif(),
      evidence: Object.fromEntries(ev),
      network: {
        name: n.name,
        handle: entry.handle,
        variables: n.variables.map(v => ({ name: v.name, outcomes: [...v.outcomes], parents: n.getParents(v).map(p => p.name) })),
      },
      posteriors,
      method,
      ...(probabilityOfEvidence !== undefined ? { probabilityOfEvidence } : {}),
    };
  }

  // ── explain ───────────────────────────────────────────────────────

  server.registerTool('explain', {
    title: 'Most probable explanation',
    description: 'Most probable joint explanation (MPE) of the evidence: the single most likely full assignment of all unobserved variables, or the k best (k up to 20, shown as differences from #1). Differs from query, which gives per-variable marginals that need not form a consistent scenario. Needs exact inference.',
    inputSchema: {
      network: networkArg,
      evidence: evidenceArg,
      softEvidence: softEvidenceArg,
      k: z.number().int().min(1).max(20).optional().describe('Number of explanations (default 1).'),
      variables: z.array(z.string()).optional().describe('Only print these variables of the explanation.'),
    },
    annotations: READ_ONLY,
  }, ({ network, evidence, softEvidence, k, variables }) => guarded(async () => {
    const entry = await registry.resolve(network);
    const r = explainNetwork(entry.network, entry.handle, {
      evidence: toEvidence(evidence), soft: toSoftEvidence(softEvidence), k: k ?? 1, variables, limits,
    });
    return ok(r.text, { network: entry.handle, explanations: r.explanations });
  }));

  // ── what_to_observe ───────────────────────────────────────────────

  server.registerTool('what_to_observe', {
    title: 'Value of information',
    description: 'Which unobserved variable is most worth observing next to reduce uncertainty about the target variable(s)? Ranks variables by expected entropy reduction in bits (value of information) given the current hard evidence. Use it to decide which question to ask or test to run.',
    inputSchema: {
      network: networkArg,
      target: z.union([z.string(), z.array(z.string())]).describe('Variable(s) you want to learn about.'),
      evidence: evidenceArg,
      candidates: z.array(z.string()).optional().describe('Restrict the ranking to these variables.'),
      top: z.number().int().min(1).max(50).optional().describe('How many to list (default 10).'),
    },
    annotations: READ_ONLY,
  }, ({ network, target, evidence, candidates, top }) => guarded(async () => {
    const entry = await registry.resolve(network);
    const r = whatToObserve(entry.network, entry.handle, {
      targets: Array.isArray(target) ? target : [target], evidence: toEvidence(evidence), candidates, top: top ?? 10, limits,
    });
    return ok(r.text, { network: entry.handle, ranking: r.ranking });
  }));

  // ── sensitivity ───────────────────────────────────────────────────

  server.registerTool('sensitivity', {
    title: 'Parameter sensitivity',
    description: 'Which CPT parameters most influence P(target=outcome | evidence)? Default mode "derivative" gives exact slopes (rational-function fit, 3 inferences per parameter) plus the target value if the parameter were 0 or 1; mode "tornado" sweeps each parameter 0..1. Use it to find which numbers in your model deserve careful elicitation. Needs exact inference; limited to ~800 parameters.',
    inputSchema: {
      network: networkArg,
      target: z.string().describe('Target variable.'),
      outcome: z.string().optional().describe('Target outcome (default: the first outcome).'),
      evidence: evidenceArg,
      top: z.number().int().min(1).max(50).optional().describe('How many parameters to list (default 10).'),
      mode: z.enum(['derivative', 'tornado']).optional().describe('Default derivative.'),
    },
    annotations: READ_ONLY,
  }, ({ network, target, outcome, evidence, top, mode }) => guarded(async () => {
    const entry = await registry.resolve(network);
    const r = sensitivityReport(entry.network, entry.handle, {
      target, outcome, evidence: toEvidence(evidence), top: top ?? 10, mode: mode ?? 'derivative', limits,
    });
    return ok(r.text, { network: entry.handle, parameters: r.parameters });
  }));

  // ── intervene ─────────────────────────────────────────────────────

  server.registerTool('intervene', {
    title: 'Causal intervention (do-operator)',
    description: 'Pearl\'s do-operator: P(variables | do(X=x)) by graph surgery (X is forced, cutting it from its causes), compared with merely observing X=x. Treat the network\'s edges as causal. Optionally pass `effect` (with a single intervention) for the effect distribution under every value of the cause and the average causal effect.',
    inputSchema: {
      network: networkArg,
      interventions: z.record(z.string(), scalar).describe('Variables to force: { variable: outcome }.'),
      evidence: evidenceArg.describe('Other observations to condition on (not on intervened variables).'),
      variables: z.array(z.string()).optional().describe('Variables to report (default: all non-intervened).'),
      effect: z.string().optional().describe('Effect variable for the per-cause-value table and average causal effect.'),
    },
    annotations: READ_ONLY,
  }, ({ network, interventions, evidence, variables, effect }) => guarded(async () => {
    const entry = await registry.resolve(network);
    const r = interveneReport(entry.network, entry.handle, {
      interventions, observations: toEvidence(evidence), variables, effect, limits,
    });
    return ok(r.text, { network: entry.handle, posteriors: r.posteriors, ...(r.averageCausalEffect !== undefined ? { averageCausalEffect: r.averageCausalEffect } : {}) });
  }));

  // ── export_network ────────────────────────────────────────────────

  server.registerTool('export_network', {
    title: 'Export a network',
    description: 'Export a network as XMLBIF 0.3 (default; loads in the viewer and most BN tools) or nabab JSON ({name, variables, edges, cpts}). Accepts the same `network` references as other tools, e.g. a handle from build_network.',
    inputSchema: {
      network: networkArg,
      format: z.enum(['xmlbif', 'json']).optional().describe('Default xmlbif.'),
    },
    annotations: READ_ONLY,
  }, ({ network, format }) => guarded(async () => {
    const entry = await registry.resolve(network);
    const fmt = format ?? 'xmlbif';
    const content = fmt === 'json'
      ? JSON.stringify(toJSON(entry.network), null, entry.network.variables.length <= 100 ? 2 : undefined)
      : toXmlBif(entry.network);
    return ok(content, { network: entry.handle, format: fmt, content });
  }));

  // ── UI resource ───────────────────────────────────────────────────

  registerAppResource(
    server,
    RESOURCE_URI,
    RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = (await assets.readMcpAppHtml())
        ?? '<html><body><p>MCP App not built. Run: npm run build:mcp</p></body></html>';
      return { contents: [{ uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: html }] };
    },
  );

  return server;
}
