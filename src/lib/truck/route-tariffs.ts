interface Location { locationId: string; status?: string; code?: string }
interface Customer { customerId: string; status?: string }
interface Tariff { tariffId: string; originId: string; destinationId: string; customerId?: string | null; status?: string; [key: string]: unknown }

/** Missing route prices are drafts, never zero-valued financial records. */
export function withAutomaticRoutes(locations: Location[], customers: Customer[], tariffs: Tariff[]): Tariff[] {
  const result = tariffs.map(tariff => ({ ...tariff, generated: false } as Tariff));
  const key = (origin: string, destination: string, customer: string | null) => JSON.stringify([origin, destination, customer]);
  const existing = new Set(tariffs.filter(t => t.status === 'ACTIVE').map(t => key(t.originId, t.destinationId, t.customerId || null)));
  const activeLocations = locations.filter(location => location.status === 'ACTIVE')
    .sort((a, b) => (a.code || a.locationId).localeCompare(b.code || b.locationId, 'th', { numeric: true }));
  const customerIds = [null, ...customers.filter(customer => customer.status === 'ACTIVE').map(customer => customer.customerId)];
  for (const origin of activeLocations) for (const destination of activeLocations) {
    if (origin.locationId === destination.locationId) continue;
    for (const customerId of customerIds) {
      const route = key(origin.locationId, destination.locationId, customerId);
      if (existing.has(route)) continue;
      result.push({ tariffId: `auto:${route}`, originId: origin.locationId, destinationId: destination.locationId, customerId,
        driverPaySatang: null, customerRateSatang: null, revision: 0, status: 'ACTIVE', generated: true });
      existing.add(route);
    }
  }
  const rank = new Map(activeLocations.map((location, index) => [location.locationId, index]));
  const position = (id: string) => rank.get(id) ?? Number.MAX_SAFE_INTEGER;
  return result.sort((a, b) => position(a.originId) - position(b.originId) || position(a.destinationId) - position(b.destinationId) || (a.customerId || '').localeCompare(b.customerId || ''));
}
