import { formatMoney } from '../payroll/money';
import { formatThaiDate } from '../payroll/dates';

export interface AttendanceDailySummaryData {
  dateKey: string;
  shopName: string;
  isHoliday?: boolean;
  holidayName?: string;
  totalStaff: number;
  presentFull: number;
  presentHalf: number;
  absent: number;
  specialStaff?: Array<{
    name: string;
    status: string;
    advanceSatang?: number;
    deductionSatang?: number;
  }>;
  dailyWagesSatang: number;
  dailyAdvanceSatang: number;
  monthlyNetPayrollSatang: number;
}

export interface TruckTripSummary {
  plateNumber: string;
  driverName: string;
  tripCount: number;
  routesSummary?: string;
  tripRows?: Array<{ route: string; driverPaySatang: number | null }>;
  driverPaySatang: number;
  fuelCostSatang: number;
}

export interface TruckDailySummaryData {
  dateKey: string;
  companyName?: string;
  activeTruckCount: number;
  totalTrips: number;
  totalDriverPaySatang: number;
  totalFuelCostSatang: number;
  trucks: TruckTripSummary[];
  monthTotalTrips?: number;
  monthDriverPaySatang?: number;
  monthFuelCostSatang?: number;
}

/**
 * Builds Flex Message Bubble card for Attendance daily summary.
 * Theme: Deep Navy (#003566) Header
 */
export function buildAttendanceDailyFlex(data: AttendanceDailySummaryData) {
  const thaiDate = formatThaiDate(data.dateKey);
  const altText = `สรุปการเช็คชื่อพนักงานประจำวัน ${thaiDate} (${data.shopName})`;

  const statusRows: any[] = [];

  if (data.isHoliday) {
    statusRows.push({
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#FEF3C7',
      cornerRadius: 'md',
      paddingAll: 'md',
      margin: 'md',
      contents: [
        {
          type: 'text',
          text: `วันหยุดร้าน${data.holidayName ? `: ${data.holidayName}` : ''}`,
          weight: 'bold',
          color: '#92400E',
          size: 'sm'
        }
      ]
    });
  } else {
    statusRows.push({
      type: 'box',
      layout: 'horizontal',
      margin: 'md',
      spacing: 'sm',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          flex: 1,
          backgroundColor: '#F0FDF4',
          cornerRadius: 'md',
          paddingAll: 'sm',
          contents: [
            { type: 'text', text: 'มาเต็มวัน', size: 'xs', color: '#166534', align: 'center' },
            { type: 'text', text: `${data.presentFull} คน`, size: 'sm', weight: 'bold', color: '#2E7D32', align: 'center' }
          ]
        },
        {
          type: 'box',
          layout: 'vertical',
          flex: 1,
          backgroundColor: '#FFFBEB',
          cornerRadius: 'md',
          paddingAll: 'sm',
          contents: [
            { type: 'text', text: 'ครึ่งวัน', size: 'xs', color: '#B45309', align: 'center' },
            { type: 'text', text: `${data.presentHalf} คน`, size: 'sm', weight: 'bold', color: '#D97706', align: 'center' }
          ]
        },
        {
          type: 'box',
          layout: 'vertical',
          flex: 1,
          backgroundColor: '#FEF2F2',
          cornerRadius: 'md',
          paddingAll: 'sm',
          contents: [
            { type: 'text', text: 'ไม่มา/ลา', size: 'xs', color: '#991B1B', align: 'center' },
            { type: 'text', text: `${data.absent} คน`, size: 'sm', weight: 'bold', color: '#C62828', align: 'center' }
          ]
        }
      ]
    });
  }

  // Special notes list (if any)
  const specialList: any[] = [];
  if (data.specialStaff && data.specialStaff.length > 0) {
    specialList.push(
      { type: 'separator', margin: 'md' },
      {
        type: 'text',
        text: 'รายการพิเศษประจำวัน',
        size: 'xs',
        weight: 'bold',
        color: '#4B5563',
        margin: 'md'
      }
    );

    data.specialStaff.forEach(staff => {
      const notes: string[] = [staff.status];
      if (staff.advanceSatang && staff.advanceSatang > 0) {
        notes.push(`เบิก ${formatMoney(staff.advanceSatang)} บาท`);
      }
      if (staff.deductionSatang && staff.deductionSatang > 0) {
        notes.push(`หัก ${formatMoney(staff.deductionSatang)} บาท`);
      }

      specialList.push({
        type: 'box',
        layout: 'horizontal',
        margin: 'xs',
        contents: [
          { type: 'text', text: staff.name, size: 'xs', color: '#111827', flex: 2 },
          { type: 'text', text: notes.join(' • '), size: 'xs', color: '#6B7280', flex: 3, align: 'end' }
        ]
      });
    });
  }

  return {
    type: 'flex',
    altText,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#003566',
        paddingAll: 'lg',
        contents: [
          {
            type: 'text',
            text: 'ระบบเช็คชื่อพนักงาน',
            color: '#FFC300',
            size: 'xs',
            weight: 'bold'
          },
          {
            type: 'text',
            text: data.shopName || 'สรุปการเช็คชื่อพนักงาน',
            weight: 'bold',
            size: 'lg',
            color: '#FFFFFF',
            margin: 'xs'
          },
          {
            type: 'text',
            text: thaiDate,
            size: 'xs',
            color: '#E0E7FF',
            margin: 'xs'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'lg',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: 'พนักงานทั้งหมด', size: 'xs', color: '#6B7280' },
              { type: 'text', text: `${data.totalStaff} คน`, size: 'xs', weight: 'bold', color: '#111827', align: 'end' }
            ]
          },
          ...statusRows,
          ...specialList,
          { type: 'separator', margin: 'lg' },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            spacing: 'xs',
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'ค่าแรงรวมวันนี้', size: 'sm', color: '#374151' },
                  { type: 'text', text: `${formatMoney(data.dailyWagesSatang)} บาท`, size: 'sm', weight: 'bold', color: '#003566', align: 'end' }
                ]
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'ยอดเบิกล่วงหน้าวันนี้', size: 'xs', color: '#6B7280' },
                  { type: 'text', text: `${formatMoney(data.dailyAdvanceSatang)} บาท`, size: 'xs', color: '#B45309', align: 'end' }
                ]
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'ค่าจ้างสุทธิสะสมเดือนนี้', size: 'xs', color: '#6B7280' },
                  { type: 'text', text: `${formatMoney(data.monthlyNetPayrollSatang)} บาท`, size: 'xs', weight: 'bold', color: '#111827', align: 'end' }
                ]
              }
            ]
          }
        ]
      }
    }
  };
}

/**
 * Builds Flex Message Bubble card for Truck daily summary.
 * Theme: Deep Slate-Navy (#0F2942) Header with Signal Amber (#D97706) Accent
 */
export function buildTruckDailyFlex(data: TruckDailySummaryData) {
  const thaiDate = formatThaiDate(data.dateKey);
  const altText = `สรุปงานรถสิบล้อประจำวัน ${thaiDate}`;

  const truckRows: any[] = [];

  if (data.trucks && data.trucks.length > 0) {
    truckRows.push(
      { type: 'separator', margin: 'md' },
      {
        type: 'text',
        text: 'รายละเอียดรายคัน',
        size: 'xs',
        weight: 'bold',
        color: '#4B5563',
        margin: 'md'
      }
    );

    data.trucks.forEach(t => {
      truckRows.push({
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#F9FAFB',
        cornerRadius: 'md',
        paddingAll: 'sm',
        margin: 'xs',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: `ทะเบียน ${t.plateNumber}`, size: 'xs', weight: 'bold', color: '#0F2942' },
              { type: 'text', text: `${t.tripCount} เที่ยว`, size: 'xs', weight: 'bold', color: '#D97706', align: 'end' }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'xs',
            contents: [
              { type: 'text', text: `คนขับ: ${t.driverName}`, size: 'xs', color: '#6B7280', flex: 3 },
              { type: 'text', text: `${formatMoney(t.driverPaySatang)} บ.`, size: 'xs', color: '#111827', align: 'end', flex: 2 }
            ]
          },
          ...(t.tripRows?.length ? t.tripRows.map(trip => ({
            type: 'box', layout: 'horizontal', margin: 'xs', spacing: 'sm',
            contents: [
              { type: 'text', text: trip.route, wrap: true, size: 'xs', color: '#9CA3AF', flex: 3 },
              { type: 'text', text: trip.driverPaySatang == null ? 'ยังไม่ตั้งราคา' : `${formatMoney(trip.driverPaySatang)} บ.`, wrap: true, size: 'xs', color: '#9CA3AF', align: 'end', flex: 2 }
            ]
          })) : [t.routesSummary
            ? {
                type: 'text',
                text: t.routesSummary,
                wrap: true,
                size: 'xs',
                color: '#475569',
                margin: 'xs'
              }
            : null])
        ].filter(Boolean) as any[]
      });
    });
  }

  // Monthly summary strip
  const monthStrip: any[] = [];
  if (data.monthTotalTrips !== undefined) {
    monthStrip.push(
      { type: 'separator', margin: 'lg' },
      {
        type: 'box',
        layout: 'vertical',
        margin: 'md',
        spacing: 'xs',
        contents: [
          {
            type: 'text',
            text: 'ยอดสะสมเดือนปัจจุบัน',
            size: 'xs',
            weight: 'bold',
            color: '#4B5563'
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: 'เที่ยววิ่งสะสม', size: 'xs', color: '#6B7280' },
              { type: 'text', text: `${data.monthTotalTrips} เที่ยว`, size: 'xs', weight: 'bold', color: '#111827', align: 'end' }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: 'ค่าเที่ยวสะสม', size: 'xs', color: '#6B7280' },
              { type: 'text', text: `${formatMoney(data.monthDriverPaySatang || 0)} บาท`, size: 'xs', weight: 'bold', color: '#0F2942', align: 'end' }
            ]
          },
        ]
      }
    );
  }

  return {
    type: 'flex',
    altText,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0F2942',
        paddingAll: 'lg',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'text',
                text: 'สรุปงานรถสิบล้อ',
                color: '#D97706',
                size: 'xs',
                weight: 'bold'
              }
            ]
          },
          {
            type: 'text',
            text: data.companyName || 'ระบบบันทึกงานรถสิบล้อ',
            weight: 'bold',
            size: 'lg',
            color: '#FFFFFF',
            margin: 'xs'
          },
          {
            type: 'text',
            text: thaiDate,
            size: 'xs',
            color: '#CBD5E1',
            margin: 'xs'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'lg',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              {
                type: 'box',
                layout: 'vertical',
                flex: 1,
                backgroundColor: '#F1F5F9',
                cornerRadius: 'md',
                paddingAll: 'sm',
                contents: [
                  { type: 'text', text: 'รถวิ่งวันนี้', size: 'xs', color: '#475569', align: 'center' },
                  { type: 'text', text: `${data.activeTruckCount} คัน`, size: 'sm', weight: 'bold', color: '#0F2942', align: 'center' }
                ]
              },
              {
                type: 'box',
                layout: 'vertical',
                flex: 1,
                backgroundColor: '#FFFBEB',
                cornerRadius: 'md',
                paddingAll: 'sm',
                contents: [
                  { type: 'text', text: 'รวมเที่ยววิ่ง', size: 'xs', color: '#B45309', align: 'center' },
                  { type: 'text', text: `${data.totalTrips} เที่ยว`, size: 'sm', weight: 'bold', color: '#D97706', align: 'center' }
                ]
              }
            ]
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            spacing: 'xs',
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'ค่าเที่ยวคนขับรวมวันนี้', size: 'sm', color: '#334155' },
                  { type: 'text', text: `${formatMoney(data.totalDriverPaySatang)} บาท`, size: 'sm', weight: 'bold', color: '#0F2942', align: 'end' }
                ]
              },
            ]
          },
          ...truckRows,
          ...monthStrip
        ]
      }
    }
  };
}
