"use client";

import { useState } from 'react';
import { saveValidationHistory } from '@/app/actions';
import { recipePermissionReport, validateRecipe } from '@/lib/recipe/catalog';

const example = JSON.stringify({
  schemaVersion: 1,
  toolId: 'sample-network-check',
  title: 'Sample Network Check',
  version: 1,
  category: 'network',
  minAndroidApi: 23,
  minAppVersion: '1.0.0',
  estimatedSeconds: 20,
  steps: [{ id: 'check-internet', action: 'CHECK_INTERNET', params: {}, risk: 'read_only', requiresConfirmation: false }],
}, null, 2);

type HistoryItem = {
  id: string;
  recipe_hash: string;
  validation_status: string;
  simulated_step_count: number;
  tested_at: string;
  issues: unknown[];
};

export function TestLabClient({ history }: { history: HistoryItem[] }) {
  const [input, setInput] = useState(example);
  const [result, setResult] = useState<ReturnType<typeof validateRecipe> | null>(null);
  const [syntaxError, setSyntaxError] = useState(false);
  const [targetApi, setTargetApi] = useState('35');
  const compatible = result?.success ? Number(targetApi) >= result.data.minAndroidApi : false;

  function runValidation() {
    try {
      const value: unknown = JSON.parse(input);
      setResult(validateRecipe(value));
      setSyntaxError(false);
    } catch {
      setResult(null);
      setSyntaxError(true);
    }
  }

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="panel p-5">
          <h2 className="text-sm font-semibold">Recipe input</h2>
          <div className="muted mt-3 flex items-center gap-2 text-xs">
            <label>
              Target Android API
              <input className="field ml-2 inline w-20" type="number" min="23" max="100" value={targetApi} onChange={event => setTargetApi(event.target.value)} />
            </label>
          </div>
          <textarea value={input} onChange={event => setInput(event.target.value)} spellCheck={false} className="field mt-4 min-h-[520px] font-mono text-xs leading-5" />
          <button className="btn btn-primary mt-4" onClick={runValidation}>Validate & simulate</button>
          {(result !== null || syntaxError) && (
            <form action={saveValidationHistory} className="ml-2 inline-block">
              <input type="hidden" name="recipe" value={input} readOnly />
              <button className="btn btn-secondary mt-4">Save test result</button>
            </form>
          )}
        </section>

        <section className="panel p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Validation report</h2>
            {(result !== null || syntaxError) && (
              <span className={`text-xs ${result?.success ? 'text-emerald-300' : 'text-red-300'}`}>
                {result?.success ? 'VALID' : 'INVALID'}
              </span>
            )}
          </div>
          {syntaxError ? (
            <div className="mt-5 rounded-lg border border-red-950 bg-red-950/20 p-3 text-xs text-red-200">
              JSON syntax is invalid.
            </div>
          ) : !result ? (
            <p className="muted mt-6 text-sm">Run static validation to inspect action support, parameters, ordering, risk and required confirmations.</p>
          ) : result.success ? (
            <>
              <div className="mt-5 rounded-xl border border-emerald-900 bg-emerald-950/30 p-4 text-sm text-emerald-200">
                Schema validation passed. {compatible ? 'The recipe meets the selected Android API level.' : 'The recipe requires a newer Android API.'} This is a local dry run only; no Android device was contacted.
              </div>
              <div className="mt-5">
                <div className="muted text-xs">STEPS IN SIMULATED ORDER</div>
                {result.data.steps.map((step, index) => (
                  <div key={step.id} className="mt-2 rounded-lg border border-[#292d36] bg-[#0b0d11] p-3">
                    <div className="flex justify-between gap-3 text-xs">
                      <b>{index + 1}. {step.action}</b>
                      <span className="muted">{step.risk}</span>
                    </div>
                    <div className="muted mt-2 text-[11px]">Confirmation: {step.requiresConfirmation ? 'required' : 'not required'}</div>
                  </div>
                ))}
              </div>
              <div className="mt-5 text-xs">
                <span className="muted">Permissions: </span>
                {recipePermissionReport(result.data).join(', ') || 'None'}
              </div>
            </>
          ) : (
            <div className="mt-5 space-y-2">
              {result.error.issues.map((issue, index) => (
                <div key={index} className="rounded-lg border border-red-950 bg-red-950/20 p-3 text-xs text-red-200">
                  <b>{issue.path.map(String).join('.') || 'Recipe'}</b>
                  <div className="mt-1">{issue.message}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="panel mt-4 p-5">
        <h2 className="text-sm font-semibold">Recent test history</h2>
        {history.length ? (
          <div className="mt-3 divide-y divide-[#252830]">
            {history.map(item => (
              <div key={item.id} className="flex justify-between gap-4 py-3 text-xs">
                <div>
                  <b className={item.validation_status === 'VALID' ? 'text-emerald-300' : 'text-red-300'}>{item.validation_status}</b>
                  <div className="muted mt-1">{item.simulated_step_count} simulated steps · {item.recipe_hash.slice(0, 16)}…</div>
                </div>
                <time className="muted">{new Date(item.tested_at).toLocaleString()}</time>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted mt-3 text-xs">No validation runs saved yet.</p>
        )}
      </section>
    </>
  );
}
