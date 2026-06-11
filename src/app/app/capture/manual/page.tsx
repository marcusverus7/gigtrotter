import { ManualAddForm } from "@/features/capture/manual-add-form";

export default function ManualAddPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Add manually</h1>
        <p className="text-sm text-muted-foreground">
          For everything that was never a screenshot — club nights, paper
          tickets long gone. Sub-15-second target.
        </p>
      </header>
      <ManualAddForm />
    </div>
  );
}
