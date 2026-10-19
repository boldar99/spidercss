import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(DOCS_ROOT, '..');
const SPIDERCSS_DIR = path.join(REPO_ROOT, 'spidercss');
const PUBLIC_DATA_DIR = path.join(DOCS_ROOT, 'public', 'data');
const GENERATED_DATA_DIR = path.join(DOCS_ROOT, 'src', 'generated');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Wilson score 95% confidence interval (matches spidercss/results_parser.py)
 */
function wilsonScoreInterval(p, n, z = 1.95996) {
  if (p === null || p === undefined || ! n || n <= 0) {
    return [p, p];
  }
  const denominator = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const inside = Math.max(0, (p * (1 - p)) / n + (z * z) / (4 * n * n));
  const spread = z * Math.sqrt(inside);
  return [(center - spread) / denominator, (center + spread) / denominator];
}

/**
 * 1. Sync QECC preset files from spidercss/assets/qeccs/{FAO,MQT,misc}
 */
function syncQeccs() {
  const qeccSrcRoot = path.join(SPIDERCSS_DIR, 'assets', 'qeccs');
  const qeccOutRoot = path.join(PUBLIC_DATA_DIR, 'qeccs');
  ensureDir(qeccOutRoot);

  const categories = ['FAO', 'MQT', 'misc'];
  const allEntries = [];
  const byCodeLookup = new Map();

  for (const category of categories) {
    const catSrcDir = path.join(qeccSrcRoot, category);
    if (!fs.existsSync(catSrcDir)) continue;

    const catOutDir = path.join(qeccOutRoot, category);
    ensureDir(catOutDir);

    const files = fs.readdirSync(catSrcDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const codeId = path.basename(file, '.json');
      const rawContent = fs.readFileSync(path.join(catSrcDir, file), 'utf8');
      const parsed = JSON.parse(rawContent);

      // Copy individual file
      fs.writeFileSync(path.join(catOutDir, file), rawContent, 'utf8');

      const entry = {
        id: `${category}/${codeId}`,
        codeId,
        category,
        full_name: parsed.full_name ?? `[[${parsed.n}, ${parsed.k}, ${parsed.d}]]`,
        abbr_name: parsed.abbr_name ?? '',
        n: parsed.n,
        k: parsed.k,
        d: parsed.d,
        is_self_dual: Boolean(parsed.is_self_dual),
        H_x: parsed.H_x,
        H_z: parsed.H_z,
        L_x: parsed.L_x ?? [],
        L_z: parsed.L_z ?? [],
      };

      allEntries.push(entry);

      // Prefer FAO first, then MQT, then misc for canonical lookup by codeId
      if (!byCodeLookup.has(codeId)) {
        byCodeLookup.set(codeId, entry);
      }
    }
  }

  const categoryRank = { FAO: 0, MQT: 1, misc: 2 };
  allEntries.sort((a, b) => {
    const catDiff = (categoryRank[a.category] ?? 9) - (categoryRank[b.category] ?? 9);
    if (catDiff !== 0) return catDiff;
    if (a.d !== b.d) return a.d - b.d;
    if (a.n !== b.n) return a.n - b.n;
    return a.k - b.k;
  });

  const indexPath = path.join(qeccOutRoot, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(allEntries, null, 2), 'utf8');

  ensureDir(GENERATED_DATA_DIR);
  fs.writeFileSync(
    path.join(GENERATED_DATA_DIR, 'qeccsIndex.json'),
    JSON.stringify(allEntries),
    'utf8'
  );

  console.log(`[sync-assets] Synced ${allEntries.length} QECC presets across ${categories.join(', ')}`);
  return byCodeLookup;
}

/**
 * 2. Sync precomputed Well-Ordered Cat States from spidercss/cat_states_data/
 */
function syncCatStates() {
  const catSrcDir = path.join(SPIDERCSS_DIR, 'cat_states_data');
  const catOutDir = path.join(PUBLIC_DATA_DIR, 'cat_states');
  ensureDir(catOutDir);

  const files = fs
    .readdirSync(catSrcDir)
    .filter((f) => f.startsWith('well_ordered_state_') && f.endsWith('.json'))
    .sort();

  const bundle = {};

  for (const file of files) {
    const rawContent = fs.readFileSync(path.join(catSrcDir, file), 'utf8');
    const parsed = JSON.parse(rawContent);
    const key = `t${parsed.t}_n${parsed.n}`;
    bundle[key] = parsed;

    fs.writeFileSync(path.join(catOutDir, file), rawContent, 'utf8');
  }

  fs.writeFileSync(
    path.join(catOutDir, 'cat_states_bundle.json'),
    JSON.stringify(bundle),
    'utf8'
  );
  ensureDir(GENERATED_DATA_DIR);
  fs.writeFileSync(
    path.join(GENERATED_DATA_DIR, 'catStatesBundle.json'),
    JSON.stringify(bundle),
    'utf8'
  );

  console.log(`[sync-assets] Synced ${files.length} precomputed well-ordered cat states`);
}

/**
 * 3. Sync and summarize simulation benchmarks from spidercss/simulation_results/
 */
function syncSimulationResults(qeccByCode) {
  const simSrcDir = path.join(SPIDERCSS_DIR, 'simulation_results');
  const simOutDir = path.join(PUBLIC_DATA_DIR, 'simulation_results');
  const byCodeOutDir = path.join(simOutDir, 'by_code');
  ensureDir(byCodeOutDir);

  const files = fs
    .readdirSync(simSrcDir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  const runsByCode = new Map();
  let totalRuns = 0;

  for (const file of files) {
    const filePath = path.join(simSrcDir, file);
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      continue;
    }

    const code = parsed.code;
    if (!code) continue;

    const qeccMeta = qeccByCode.get(code) ?? {
      n: Number(code.split('_')[0]) || 0,
      k: Number(code.split('_')[1]) || 0,
      d: Number(code.split('_')[2]) || 0,
      abbr_name: '',
      full_name: `[[${code.replaceAll('_', ', ')}]]`,
    };

    const ler = parsed.logical_error_rate ?? null;
    const ar = parsed.acceptance_rate ?? null;
    const nSamples = parsed.num_samples ?? 0;
    const acceptedShots = ar !== null ? nSamples * ar : 0;

    const [lerCiLow, lerCiHigh] = wilsonScoreInterval(ler, acceptedShots);
    const [arCiLow, arCiHigh] = wilsonScoreInterval(ar, nSamples);

    const methodRaw = parsed.method ?? '';
    const isFaO = methodRaw === 'FaO';
    const heuristicMatch = methodRaw.match(/^SpiderCSS\s*\((.+)\)$/);
    const heuristic = heuristicMatch ? heuristicMatch[1].trim() : isFaO ? 'FaO' : methodRaw;

    const runSummary = {
      file,
      code,
      n: qeccMeta.n,
      k: qeccMeta.k,
      d: qeccMeta.d,
      label: qeccMeta.abbr_name,
      full_name: qeccMeta.full_name,
      target_basis: code === '49_1_5' || code === '95_1_7' ? 'X' : 'Z',
      method: methodRaw,
      heuristic,
      p: parsed.p,
      num_samples: nSamples,
      total_flagged: parsed.total_flagged ?? 0,
      total_discarded: parsed.total_discarded ?? 0,
      total_incorrect: parsed.total_incorrect ?? null,
      logical_error_rate: ler,
      ler_ci_low: lerCiLow,
      ler_ci_high: lerCiHigh,
      acceptance_rate: ar,
      ar_ci_low: arCiLow,
      ar_ci_high: arCiHigh,
      raw_acceptance_rate: parsed.raw_acceptance_rate ?? ar,
      num_cx: parsed.num_cx ?? null,
      num_flags: parsed.num_flags ?? null,
      num_qubits_original: parsed.num_qubits_original ?? null,
      num_qubits_max: parsed.num_qubits_max ?? null,
      depth_max: parsed.depth_max ?? null,
      num_qubits_min: parsed.num_qubits_min ?? null,
      depth_min: parsed.depth_min ?? null,
      circuit_hash: parsed.circuit_hash ?? null,
    };

    const runWithStim = {
      ...runSummary,
      perfect_stim: parsed.perfect_stim ?? null,
    };

    if (!runsByCode.has(code)) {
      runsByCode.set(code, { summaries: [], withStim: [] });
    }
    runsByCode.get(code).summaries.push(runSummary);
    runsByCode.get(code).withStim.push(runWithStim);
    totalRuns++;
  }

  const codeGroups = [];
  for (const [code, { summaries, withStim }] of runsByCode.entries()) {
    // Write per-code detailed JSON (including perfect_stim, omitting multi-MB noisy_circuit)
    fs.writeFileSync(
      path.join(byCodeOutDir, `${code}.json`),
      JSON.stringify(withStim, null, 2),
      'utf8'
    );

    const first = summaries[0];
    const faoRuns = summaries.filter((r) => r.method === 'FaO');
    const spiderRuns = summaries.filter((r) => r.method.startsWith('SpiderCSS'));

    // Pick canonical FaO run (prefer p=0.001 if multiple)
    const faoBest =
      faoRuns.find((r) => r.p === 0.001) ?? faoRuns[0] ?? null;

    // Pick best SpiderCSS run by lowest LER (matching generate_table.py)
    const validSpider = spiderRuns.filter(
      (r) => r.logical_error_rate !== null && (r.num_qubits_max ?? 0) > 0
    );
    const fallbackSpider = spiderRuns.filter((r) => r.logical_error_rate !== null);
    const pool = validSpider.length > 0 ? validSpider : fallbackSpider;
    const bestSpider =
      pool.length > 0
        ? pool.reduce((best, cur) =>
            cur.logical_error_rate < best.logical_error_rate ? cur : best
          )
        : spiderRuns[0] ?? null;

    codeGroups.push({
      code,
      n: first.n,
      k: first.k,
      d: first.d,
      label: first.label,
      full_name: first.full_name,
      target_basis: first.target_basis,
      fao: faoBest,
      best_spidercss: bestSpider,
      runs: summaries,
    });
  }

  codeGroups.sort((a, b) => {
    if (a.d !== b.d) return a.d - b.d;
    if (a.n !== b.n) return a.n - b.n;
    return a.k - b.k;
  });

  const summaryPayload = {
    generated_at: new Date().toISOString(),
    total_codes: codeGroups.length,
    total_runs: totalRuns,
    codes: codeGroups,
  };

  fs.writeFileSync(
    path.join(simOutDir, 'summary.json'),
    JSON.stringify(summaryPayload, null, 2),
    'utf8'
  );
  ensureDir(GENERATED_DATA_DIR);
  fs.writeFileSync(
    path.join(GENERATED_DATA_DIR, 'simulationSummary.json'),
    JSON.stringify(summaryPayload),
    'utf8'
  );

  console.log(
    `[sync-assets] Synced ${totalRuns} simulation runs across ${codeGroups.length} QEC codes`
  );
}

function main() {
  const qeccByCode = syncQeccs();
  syncCatStates();
  syncSimulationResults(qeccByCode);
}

main();
