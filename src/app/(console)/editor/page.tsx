import { ConsoleShell } from '@/components/console-shell';
import { RecipeComposer } from '@/components/recipe-composer';
import { createTool } from '@/app/actions';
export default function EditorPage() {
  return <ConsoleShell active="/editor" title="Script Editor" subtitle="Visual step builder and JSON editor · Safe Repair Recipe DSL"><RecipeComposer action={createTool} /></ConsoleShell>;
}
