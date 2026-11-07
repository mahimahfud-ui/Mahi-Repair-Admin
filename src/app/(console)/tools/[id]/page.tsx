import { notFound } from 'next/navigation';
import { ConsoleShell } from '@/components/console-shell';
import { requireOwner } from '@/lib/auth/require-owner';
import { saveToolDraft } from '@/app/actions';
import { RecipeComposer } from '@/components/recipe-composer';

export const dynamic = 'force-dynamic';

export default async function ToolEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireOwner();
  const { data, error } = await supabase
    .from('repair_tools')
    .select('id,name,slug,category,description,icon,status,version,draft_recipe')
    .eq('id', id)
    .single();

  if (error || !data) notFound();

  return (
    <ConsoleShell
      active="/tools"
      title={`Edit ${data.name}`}
      subtitle={`Draft recipe · Current published version v${data.version}`}
    >
      <RecipeComposer
        mode="edit"
        id={data.id}
        initialName={data.name}
        initialSlug={data.slug}
        initialCategory={data.category}
        initialDescription={data.description ?? ''}
        initialIcon={data.icon ?? 'wrench'}
        action={saveToolDraft}
        initialRecipe={data.draft_recipe}
      />
    </ConsoleShell>
  );
}
