export function FormMessage({ error, notice }: { error?: string; notice?: string }) {
  if (error) return <p className="banner banner-error" role="alert">{error}</p>;
  if (notice) return <p className="banner banner-ok" role="status">{notice}</p>;
  return null;
}
