/** Stored master labels are "code — name"; remove only that label prefix for customer-facing output. */
export function placeName(value?: string | null): string {
  const text = typeof value === 'string' ? value.trim() : '';
  const coded = text.match(/^\S+\s+[—–]\s+(.+)$/u) || text.match(/^[A-Za-z0-9_.\/-]+\s+-\s+(.+)$/u);
  return coded ? coded[1].trim() : text;
}

export function tripLocationNames(trip: {
  fromLocation?: string; originNameSnapshot?: string; origin?: string;
  destinationName?: string; destinationNameSnapshot?: string; destination?: string; destinationMode?: string;
  locationNamesOnly?: boolean;
}) {
  const originText = trip.originNameSnapshot || trip.fromLocation || trip.origin || '';
  const origin = (trip.locationNamesOnly ? originText.trim() : placeName(originText)) || 'ไม่ระบุต้นทาง';
  const destination = trip.destinationNameSnapshot || trip.destinationName || trip.destination || '';
  return { origin, destination: (trip.locationNamesOnly || trip.destinationMode === '__OTHER__' ? destination.trim() : placeName(destination)) || 'ไม่ระบุปลายทาง' };
}
