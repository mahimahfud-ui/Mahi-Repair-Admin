"use client";

import { useState, useTransition, type FormEvent } from 'react';
import Link from 'next/link';
import { AlertTriangle, Copy, Sparkles, ShieldCheck } from 'lucide-react';
import { generateAiRecipeDraft } from '@/app/actions';
import type { RepairRecipe } from '@/lib/recipe/catalog';

const categories = [
  ['network', 'Network'], ['apps', 'Apps'], ['storage', 'Storage'],
  ['connectivity', 'Connectivity'], ['system', 'System'], ['guides', 'Guides'],
] as const;

export function RecipeAssistantClient() {
  const [symptom, setSymptom] = useState('');
  const [title, setTitle] = useState('Network Connectivity Check');
  const [toolId, setToolId] = useState('network-connectivity-check');
  const [category, setCategory] = useState<RepairRecipe['category']>('network');
  const [targetPackage, setTargetPackage] = useState('');
  const [minApi, setMinApi] = useState('23');
  const [minAppVersion, setMinAppVersion] = useState('1.0.0');
  const [recipe, setRecipe] = useState<RepairRecipe | null>(null);
  const [model, setModel] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setCopied(false);
    setRecipe(null);
    startTransition(async () => {
      try {
        const result = await generateAiRecipeDraft({
          symptom_description: symptom,
          tool_id: toolId,
          title,
          category,
          ...(targetPackage.trim() ? { target_app_package: targetPackage.trim() } : {}),
          min_android_api: Number(minApi),
          min_app_version: minAppVersion,
        });
        setRecipe(result.recipe);
        setModel(result.model);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Recipe generation failed. Please retry.');
      }
    });
  }

  async function copyRecipe() {
    if (!recipe) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(recipe, null, 2));
      setCopied(true);
      setError('');
    } catch {
      setError('Clipboard access was blocked. Select and copy the JSON manually.');
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
      <form onSubmit={submit} className="panel space-y-4 p-5">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={16} className="text-red-300" /> Describe the repair problem</h2>
          <p className="muted mt-1 text-xs">The text is sent to Gemini from the authenticated Edge Function. Do not include names, phone numbers, IMEIs, passwords or other personal data.</p>
        </div>
        <label className="muted block text-xs">
          Symptom description
          <textarea required minLength={8} maxLength={1200} value={symptom} onChange={event => setSymptom(event.target.value)} className="field mt-2 min-h-36" placeholder="Example: YouTube opens but reports that it cannot connect. Other apps can access the internet." />
          <span className="mt-1 block text-right">{symptom.length}/1200</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="muted block text-xs">Tool title
            <input required maxLength={100} value={title} onChange={event => setTitle(event.target.value)} className="field mt-2" />
          </label>
          <label className="muted block text-xs">Tool slug
            <input required maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={toolId} onChange={event => setToolId(event.target.value)} className="field mt-2 font-mono" />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="muted block text-xs">Category
            <select value={category} onChange={event => setCategory(event.target.value as RepairRecipe['category'])} className="field mt-2">
              {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="muted block text-xs">Target Android package (optional)
            <input maxLength={255} value={targetPackage} onChange={event => setTargetPackage(event.target.value)} className="field mt-2 font-mono" placeholder="com.example.app" />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="muted block text-xs">Minimum Android API
            <input type="number" min="23" max="100" required value={minApi} onChange={event => setMinApi(event.target.value)} className="field mt-2" />
          </label>
          <label className="muted block text-xs">Minimum app version
            <input required maxLength={30} value={minAppVersion} onChange={event => setMinAppVersion(event.target.value)} className="field mt-2" />
          </label>
        </div>
        <div className="rounded-lg border border-[#292d36] bg-[#0b0d11] p-3 text-xs muted">
          <div className="flex items-center gap-2 text-emerald-300"><ShieldCheck size={14} /> Server-side safety checks</div>
          <p className="mt-2">Only the compiled Android action allowlist is accepted. Generated recipes are capped at 12 steps, app package names are bound to the package you provide, and network hosts are restricted to a short allowlist.</p>
          <p className="mt-2">Generation does not save, publish, sign or send a recipe to a device.</p>
        </div>
        <button type="submit" disabled={pending} className="btn btn-primary w-full"><Sparkles size={15} /> {pending ? 'Generating draft…' : 'Generate recipe draft'}</button>
        {error && <div role="alert" className="rounded-lg border border-red-950 bg-red-950/20 p-3 text-xs text-red-200"><AlertTriangle size={13} className="mr-1 inline" />{error}</div>}
      </form>

      <section className="panel min-w-0 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-sm font-semibold">Generated recipe draft</h2><p className="muted mt-1 text-xs">{model ? 'Model: ' + model : 'No recipe generated yet.'}</p></div>
          {recipe && <button type="button" onClick={copyRecipe} className="btn btn-secondary text-xs"><Copy size={13} />{copied ? 'Copied' : 'Copy JSON'}</button>}
        </div>
        {recipe ? (
          <>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-full bg-[#292d36] px-2 py-1">{recipe.steps.length} steps</span>
              <span className="rounded-full bg-[#292d36] px-2 py-1">API {recipe.minAndroidApi}+</span>
              <span className="rounded-full bg-emerald-950 px-2 py-1 text-emerald-300">Validated</span>
              <span className="rounded-full bg-[#292d36] px-2 py-1">Unsaved draft</span>
            </div>
            <textarea aria-label="Generated repair recipe JSON" readOnly spellCheck={false} value={JSON.stringify(recipe, null, 2)} className="field mt-4 min-h-[540px] w-full font-mono text-xs leading-5" />
            <div className="mt-4 rounded-lg border border-[#292d36] bg-[#0b0d11] p-3 text-xs">
              <p className="font-medium">Next step: Owner review</p>
              <p className="muted mt-1">Copy this JSON, open the tool editor, paste it into the JSON view, then validate and save it as a DRAFT. Publishing remains a separate Owner action.</p>
              <Link href="/tools/new" className="btn btn-secondary mt-3 w-fit">Open tool editor</Link>
            </div>
          </>
        ) : (
          <div className="flex min-h-[480px] flex-col items-center justify-center text-center">
            <Sparkles size={26} className="text-[#626a77]" />
            <p className="mt-3 text-sm font-medium">Your draft will appear here</p>
            <p className="muted mt-1 max-w-sm text-xs">Generation returns JSON that has already passed the shared server recipe contract and the extra AI safety policy.</p>
          </div>
        )}
      </section>
    </div>
  );
}
