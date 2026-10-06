export async function mutationData(response: Response, message: string): Promise<any> {
  const json = await response.json().catch(() => null);
  if (!response.ok || !json || json.ok === false) throw new Error(json?.error?.message || json?.message || message);
  return json.data || json;
}
