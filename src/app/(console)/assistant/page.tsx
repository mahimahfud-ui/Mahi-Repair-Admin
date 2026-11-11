import { ConsoleShell } from '@/components/console-shell';
import { RecipeAssistantClient } from '@/components/recipe-assistant-client';

export default function AiRecipeAssistantPage() {
  return (
    <ConsoleShell active="/assistant" title="AI Recipe Assistant" subtitle="Generate a constrained recipe draft for Owner review">
      <RecipeAssistantClient />
    </ConsoleShell>
  );
}
