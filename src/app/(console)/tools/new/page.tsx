import { ConsoleShell } from '@/components/console-shell';
import { RecipeComposer } from '@/components/recipe-composer';
import { createTool } from '@/app/actions';
export default function NewToolPage() { return <ConsoleShell active="/tools" title="Create New Tool" subtitle="A recipe is data, not executable code"><RecipeComposer action={createTool}/></ConsoleShell>; }
