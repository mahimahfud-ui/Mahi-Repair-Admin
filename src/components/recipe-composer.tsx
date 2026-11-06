"use client";

import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Braces, ListPlus, ShieldCheck, Trash2 } from 'lucide-react';
import {
  RepairRecipeSchema,
  type RepairRecipe,
  type RepairStep,
  validateRecipe,
} from '@/lib/recipe/catalog';

type ActionRisk = 'read_only' | 'guided' | 'permission';
type ActionDefinition = {
  params: Record<string, unknown>;
  risk: ActionRisk;
  requiresConfirmation: boolean;
};

const defaults = {
  CHECK_INTERNET: { params: {}, risk: 'read_only', requiresConfirmation: false },
  DNS_LOOKUP: { params: { host: 'example.com' }, risk: 'read_only', requiresConfirmation: false },
  HTTPS_PROBE: { params: { host: 'example.com', timeoutMs: 5000 }, risk: 'read_only', requiresConfirmation: false },
  CHECK_APP_INSTALLED: { params: { packageName: 'com.example.app' }, risk: 'read_only', requiresConfirmation: false },
  CHECK_STORAGE: { params: {}, risk: 'read_only', requiresConfirmation: false },
  OPEN_APP: { params: { packageName: 'com.example.app' }, risk: 'guided', requiresConfirmation: true },
  OPEN_APP_DETAILS: { params: { packageName: 'com.example.app' }, risk: 'guided', requiresConfirmation: true },
  OPEN_ANDROID_SETTINGS: { params: { screen: 'internet' }, risk: 'guided', requiresConfirmation: true },
  SHOW_GUIDE: { params: { title: 'Troubleshooting', instructions: ['Follow this instruction.'] }, risk: 'guided', requiresConfirmation: false },
  ASK_USER_CONFIRMATION: { params: { title: 'Confirm action', message: 'Do you want to continue?' }, risk: 'guided', requiresConfirmation: true },
  REQUEST_OWN_APP_PERMISSION: { params: { permission: 'POST_NOTIFICATIONS' }, risk: 'permission', requiresConfirmation: true },
  VERIFY_INTERNET: { params: {}, risk: 'read_only', requiresConfirmation: false },
  VERIFY_DNS: { params: { host: 'example.com' }, risk: 'read_only', requiresConfirmation: false },
} satisfies Record<string, ActionDefinition>;

type ActionName = keyof typeof defaults;
const actionNames = Object.keys(defaults) as ActionName[];

const initialRecipe: RepairRecipe = RepairRecipeSchema.parse({
  schemaVersion: 1,
  toolId: 'network-check',
  title: 'Network Check',
  version: 1,
  category: 'network',
  minAndroidApi: 23,
  minAppVersion: '1.0.0',
  estimatedSeconds: 30,
  steps: [{
    id: 'step-1',
    action: 'CHECK_INTERNET',
    params: {},
    risk: 'read_only',
    requiresConfirmation: false,
  }],
});

function format(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function isParameterRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function RecipeComposer({
  mode = 'create',
  id = '',
  initialName = 'Network Check',
  initialSlug = 'network-check',
  initialCategory = 'network',
  initialDescription = '',
  initialIcon = 'wrench',
  initialRecipe: providedRecipe,
  action,
}: {
  mode?: 'create' | 'edit';
  id?: string;
  initialName?: string;
  initialSlug?: string;
  initialCategory?: string;
  initialDescription?: string;
  initialIcon?: string;
  initialRecipe?: unknown;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const provided = RepairRecipeSchema.safeParse(providedRecipe);
  const seed: RepairRecipe = provided.success
    ? provided.data
    : {
        ...initialRecipe,
        title: initialName,
        toolId: initialSlug,
        category: RepairRecipeSchema.shape.category.parse(initialCategory),
      };

  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [category, setCategory] = useState<RepairRecipe['category']>(seed.category);
  const [description, setDescription] = useState(initialDescription);
  const [iconName, setIconName] = useState(initialIcon);
  const [recipe, setRecipe] = useState<RepairRecipe>(seed);
  const [raw, setRaw] = useState(() => format(seed));
  const [view, setView] = useState<'builder' | 'json'>('builder');
  const [issues, setIssues] = useState<string[]>([]);

  const parsed = useMemo(() => {
    try {
      const value: unknown = JSON.parse(raw);
      const checked = RepairRecipeSchema.safeParse(value);
      return checked.success ? checked.data : null;
    } catch {
      return null;
    }
  }, [raw]);

  function commit(next: RepairRecipe) {
    const checked = RepairRecipeSchema.safeParse(next);
    if (!checked.success) {
      setIssues(checked.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`));
      return;
    }
    setRecipe(checked.data);
    setRaw(format(checked.data));
    setIssues([]);
  }

  function changeMetadata(field: 'title' | 'toolId' | 'category', value: string) {
    const next: RepairRecipe = field === 'category'
      ? { ...recipe, category: value as RepairRecipe['category'] }
      : { ...recipe, [field]: value };
    commit(next);
  }

  function changeRoot(field: 'minAndroidApi' | 'minAppVersion' | 'estimatedSeconds', value: string) {
    const next: RepairRecipe = field === 'minAndroidApi' || field === 'estimatedSeconds'
      ? { ...recipe, [field]: Number(value) }
      : { ...recipe, minAppVersion: value };
    commit(next);
  }

  function addStep(actionName: ActionName) {
    const base = defaults[actionName];
    const next: RepairRecipe = {
      ...recipe,
      toolId: slug,
      title: name,
      category,
      steps: [
        ...recipe.steps,
        {
          id: `step-${crypto.randomUUID().slice(0, 8)}`,
          action: actionName,
          params: { ...base.params },
          risk: base.risk,
          requiresConfirmation: base.requiresConfirmation,
        } as RepairStep,
      ],
    };
    commit(next);
  }

  function updateStep(index: number, patch: Partial<RepairStep>) {
    const steps = [...recipe.steps];
    const current = steps[index];
    if (!current) return;
    steps[index] = { ...current, ...patch };
    commit({ ...recipe, steps });
  }

  function removeStep(index: number) {
    commit({ ...recipe, steps: recipe.steps.filter((_, stepIndex) => stepIndex !== index) });
  }

  function moveStep(index: number, delta: number) {
    const steps = [...recipe.steps];
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= steps.length) return;
    [steps[index], steps[nextIndex]] = [steps[nextIndex], steps[index]];
    commit({ ...recipe, steps });
  }

  function chooseView(next: 'builder' | 'json') {
    if (next === 'builder') {
      if (!parsed) {
        setIssues(['Recipe JSON is invalid or does not match the supported schema.']);
        return;
      }
      commit(parsed);
    }
    setView(next);
  }

  function validate() {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      setIssues(['JSON syntax is invalid.']);
      return false;
    }
    const result = validateRecipe(value);
    if (!result.success) {
      setIssues(result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`));
      return false;
    }
    if (result.data.toolId !== slug) {
      setIssues(['Recipe toolId must match the slug field.']);
      return false;
    }
    setIssues([]);
    return true;
  }

  return (
    <form
      action={action}
      onSubmit={event => {
        if (!validate()) event.preventDefault();
      }}
      className="grid grid-cols-1 gap-4 xl:grid-cols-[.72fr_1.28fr]"
    >
      <section className="panel space-y-4 p-5">
        <h2 className="text-sm font-semibold">Tool metadata</h2>
        <label className="muted block text-xs">
          Tool name
          <input name="name" required maxLength={100} className="field mt-2" value={name} onChange={event => { setName(event.target.value); changeMetadata('title', event.target.value); }} />
        </label>
        <label className="muted block text-xs">
          Unique slug
          <input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" className="field mt-2" value={slug} onChange={event => { setSlug(event.target.value); changeMetadata('toolId', event.target.value); }} />
        </label>
        <label className="muted block text-xs">
          Category
          <select name="category" className="field mt-2" value={category} onChange={event => { setCategory(event.target.value as RepairRecipe['category']); changeMetadata('category', event.target.value); }}>
            <option value="apps">Apps</option>
            <option value="network">Network</option>
            <option value="storage">Storage</option>
            <option value="connectivity">Connectivity</option>
            <option value="system">System</option>
            <option value="guides">Guides</option>
          </select>
        </label>
        <label className="muted block text-xs">
          Description
          <textarea name="description" className="field mt-2 min-h-28" maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} />
        </label>
        <label className="muted block text-xs">
          Lucide icon name
          <input name="icon" className="field mt-2" maxLength={40} pattern="[a-z0-9-]+" value={iconName} onChange={event => setIconName(event.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="muted block text-xs">
            Minimum Android API
            <input type="number" min="23" max="100" className="field mt-2" value={recipe.minAndroidApi} onChange={event => changeRoot('minAndroidApi', event.target.value)} />
          </label>
          <label className="muted block text-xs">
            Estimated seconds
            <input type="number" min="1" max="3600" className="field mt-2" value={recipe.estimatedSeconds} onChange={event => changeRoot('estimatedSeconds', event.target.value)} />
          </label>
        </div>
        <label className="muted block text-xs">
          Minimum Android app version
          <input className="field mt-2" maxLength={30} value={recipe.minAppVersion} onChange={event => changeRoot('minAppVersion', event.target.value)} />
        </label>
        <input type="hidden" name="recipe" value={raw} readOnly />
        <input type="hidden" name="id" value={id} />
        <p className="muted text-[11px]">
          {mode === 'create' ? 'New tools start as DRAFT.' : 'Saving updates the draft only; the published version remains immutable.'}
        </p>
        <button type="submit" className="btn btn-primary w-full">
          {mode === 'create' ? 'Save draft tool' : 'Validate and save draft'}
        </button>
      </section>

      <section className="panel min-w-0 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Repair recipe</h2>
            <p className="muted mt-1 text-xs">Declarative JSON · Native actions only</p>
          </div>
          <div className="flex gap-1 rounded-lg bg-[#0b0d11] p-1">
            <button type="button" onClick={() => chooseView('builder')} className={`rounded-md px-3 py-2 text-xs ${view === 'builder' ? 'bg-[#292d36] text-white' : 'muted'}`}>Step builder</button>
            <button type="button" onClick={() => setView('json')} className={`rounded-md px-3 py-2 text-xs ${view === 'json' ? 'bg-[#292d36] text-white' : 'muted'}`}>
              <Braces size={13} className="mr-1 inline" />JSON
            </button>
          </div>
        </div>

        {view === 'builder' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <select id="new-action" className="field max-w-[280px] text-xs">
                {actionNames.map(actionName => <option key={actionName} value={actionName}>{actionName}</option>)}
              </select>
              <button type="button" onClick={() => {
                const element = document.getElementById('new-action');
                if (element instanceof HTMLSelectElement && actionNames.includes(element.value as ActionName)) addStep(element.value as ActionName);
              }} className="btn btn-secondary text-xs">
                <ListPlus size={14} />Add step
              </button>
            </div>
            {recipe.steps.map((step, index) => (
              <div key={step.id} className="rounded-xl border border-[#292d36] bg-[#0b0d11] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <select
                      aria-label={`Action for step ${index + 1}`}
                      value={step.action}
                      onChange={event => {
                        const actionName = event.target.value as ActionName;
                        if (Object.prototype.hasOwnProperty.call(defaults, actionName)) {
                          const base = defaults[actionName];
                          updateStep(index, {
                            action: actionName,
                            params: { ...base.params },
                            risk: base.risk,
                            requiresConfirmation: base.requiresConfirmation,
                          });
                        }
                      }}
                      className="field py-2 font-mono text-[11px]"
                    >
                      {actionNames.map(actionName => <option key={actionName} value={actionName}>{actionName}</option>)}
                    </select>
                    <div className="muted mt-1 text-[10px]">
                      {step.id} · {step.risk} · {step.requiresConfirmation ? 'confirmation required' : 'no confirmation'}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => moveStep(index, -1)} className="btn btn-secondary p-2"><ArrowUp size={13} /></button>
                    <button type="button" onClick={() => moveStep(index, 1)} className="btn btn-secondary p-2"><ArrowDown size={13} /></button>
                    <button type="button" onClick={() => removeStep(index)} className="btn btn-secondary p-2 text-red-300"><Trash2 size={13} /></button>
                  </div>
                </div>
                <label className="muted mt-3 block text-[10px]">
                  Action parameters (JSON)
                  <textarea
                    key={`${step.id}-${format(step.params)}`}
                    className="field mt-1 min-h-20 font-mono text-[11px]"
                    defaultValue={format(step.params)}
                    onBlur={event => {
                      try {
                        const params: unknown = JSON.parse(event.currentTarget.value);
                        if (!isParameterRecord(params)) {
                          setIssues([`Step ${index + 1}: params must be a JSON object.`]);
                          return;
                        }
                        updateStep(index, { params });
                      } catch {
                        setIssues([`Step ${index + 1}: params must be valid JSON.`]);
                      }
                    }}
                  />
                </label>
                <label className="muted mt-3 inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={Boolean(step.requiresConfirmation)} onChange={event => updateStep(index, { requiresConfirmation: event.target.checked })} />
                  Require user confirmation
                </label>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[#292d36]">
            <textarea
              aria-label="Recipe JSON"
              spellCheck={false}
              value={raw}
              onChange={event => setRaw(event.target.value)}
              className="field min-h-[540px] w-full resize-y font-mono text-xs leading-5"
            />
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="muted flex items-center gap-1 text-[11px]"><ShieldCheck size={13} />Server re-validates before accepting.</span>
          <button type="button" onClick={validate} className="btn btn-secondary text-xs">Validate recipe</button>
        </div>
        {issues.length > 0 && (
          <div className="mt-3 rounded-lg border border-red-950 bg-red-950/20 p-3">
            {issues.map((issue, index) => (
              <div key={index} className="mt-1 flex items-start gap-2 text-xs text-red-200">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />{issue}
              </div>
            ))}
          </div>
        )}
      </section>
    </form>
  );
}
