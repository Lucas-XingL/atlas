import { NewAtlasForm } from "./new-atlas-form";

export default function NewAtlasPage() {
  return (
    <div className="mx-auto max-w-xl px-8 py-14">
      <h1 className="text-2xl font-semibold tracking-tight">新建 Atlas</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        一个 Atlas = 一个主题 + 一份 thesis。简单起步，后续随时修改。
      </p>
      <div className="mt-8">
        <NewAtlasForm />
      </div>
    </div>
  );
}
