/**
 * Data contracts and TypeScript interfaces for the Truck App domain.
 */

export interface TruckDoc {
  truckId: string;
  plateNumber: string;
  driverName: string;
  notes?: string;
  status: 'ACTIVE' | 'SUSPENDED';
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface TruckOriginDoc {
  originId: string;
  name: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface TruckDestinationDoc {
  destinationId: string;
  name: string;
  driverPaySatang: number; // Integer satang
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface TruckTripItem {
  tripIndex: number;
  fromLocation: string;
  destinationMode: string; // 'DEST_<id>' | '__OTHER__'
  destinationId?: string | null;
  destinationName: string;
  driverPaySatang: number; // Integer satang
  note: string;
}

export interface TruckPhotoMeta {
  photoId: string;
  sizeKb: number;
  width: number;
  height: number;
  contentType: 'image/webp';
  createdAt: string;
}

export interface TruckDailyRecordDoc {
  recordId: string; // `${dateKey}_${truckId}`
  dateKey: string;  // YYYY-MM-DD
  monthKey: string; // YYYY-MM
  truckId: string;
  plateNumberSnapshot: string;
  driverNameSnapshot: string;
  fuelCostSatang: number; // Integer satang
  totalDriverPaySatang: number; // Sum of trips[i].driverPaySatang
  tripCount: number;
  trips: TruckTripItem[];
  photos: TruckPhotoMeta[];
  revision: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface TruckPhotoDoc {
  photoId: string;
  data: string; // Base64 WebP string
  contentType: 'image/webp';
  sizeKb: number;
  width: number;
  height: number;
  createdAt: string;
  updatedBy: string;
}

export interface TruckProfileDoc {
  companyName: string;
  revision: number;
  updatedAt: string;
}

export interface LineSettingsDoc {
  channelAccessToken: string;
  defaultTargetId: string;
  attendanceTargetId?: string;
  truckTargetId?: string;
  dailySummaryEnabled: boolean;
  dailySummaryHour: number;
  revision: number;
  updatedAt: string;
}

export interface TruckMonthDoc {
  monthKey: string;
  recordCount: number;
  totalTrips: number;
  totalDriverPaySatang: number;
  totalFuelCostSatang: number;
  updatedAt: string;
}

export interface TruckMonthlyRow {
  truckId: string;
  plateNumber: string;
  driverName: string;
  tripCount: number;
  totalDriverPaySatang: number;
  totalFuelCostSatang: number;
}

export interface TruckMonthlyTotals {
  totalTrips: number;
  totalDriverPaySatang: number;
  totalFuelCostSatang: number;
  totalCostSatang: number;
  activeTruckCount: number;
}

export interface TruckMonthlyReport {
  monthKey: string;
  totals: TruckMonthlyTotals;
  perTruck: TruckMonthlyRow[];
  records: TruckDailyRecordDoc[];
}

export type TruckReportPeriod = 'day' | 'month' | 'year';

export interface TruckAnalyticsBucket {
  key: string; // 'YYYY-MM-DD' | 'YYYY-MM' | 'YYYY'
  tripCount: number;
  driverPaySatang: number;
  fuelCostSatang: number;
  totalCostSatang: number;
}

export interface TruckAnalyticsTotals {
  tripCount: number;
  driverPaySatang: number;
  fuelCostSatang: number;
  totalCostSatang: number;
}

export interface TruckAnalyticsTruck {
  truckId: string;
  plateNumber: string;
  driverName: string;
  totals: TruckAnalyticsTotals;
  buckets: TruckAnalyticsBucket[];
}

export interface TruckAnalyticsResult {
  period: TruckReportPeriod;
  today: string;
  months: string[];
  totals: TruckAnalyticsTotals;
  buckets: TruckAnalyticsBucket[];
  trucks: TruckAnalyticsTruck[];
}
