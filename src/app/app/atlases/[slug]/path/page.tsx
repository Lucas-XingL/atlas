import { redirect } from "next/navigation";

export default function PathRedirect({ params }: { params: { slug: string } }) {
  redirect(`/app/atlases/${params.slug}/recommendations?tab=plan`);
}
