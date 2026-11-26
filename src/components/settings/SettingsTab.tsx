'use client';
import { useHistoryState } from '@/components/shared/useHistoryState';
import { usePendingAction } from '@/components/shared/usePendingAction';
import { mutationData } from '@/lib/client/mutation-response';
import { getBangkokToday } from '@/lib/payroll/dates';
import { moneySatang } from '@/lib/payroll/money';
import { employeeExtraTemplates } from '@/lib/client/form-money';
import { useModalInteraction } from '@/components/shared/useModalInteraction';
import { MutationIntent } from '@/lib/client/mutation-intent';
import { notifyDataChanged } from '@/lib/client/data-events';
import { LineSettings } from '@/components/shared/LineSettings';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import {
  Plus,
  User,
  ChevronDown,
  ChevronUp,
  Trash2,
  Camera,
  CheckCircle2,
  AlertCircle,
  Pencil
} from 'lucide-react';
import styles from './settings.module.css';
import { DEFAULT_SHOP_NAME, displayShopName } from '@/lib/shop-name';

interface ExtraTemplate {
  name: string;
  amountSatang: number;
}

interface RateHistory {
  effectiveDate: string;
  rateSatang: number;
}

interface Employee {
  id: string;
  name: string;
  nickname: string;
  position: string;
  notes?: string;
  startDate: string;
  endDate?: string | null;
  dailyRateSatang: number;
  rateHistory?: RateHistory[];
  extraTemplates?: ExtraTemplate[];
  photoPath?: string | null;
  photoVersion?: number;
  revision: number;
  status?: 'ACTIVE' | 'SUSPENDED';
  suspended?: boolean;
  suspendedAt?: string | null;
}

interface ShopSettings {
  shopName: string;
  workDays: number[];
  revision: number;
}

interface SettingsTabProps {
  active: boolean;
  onUpdateShopName?: (name: string) => void;
}

const DAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

export default function SettingsTab({ active, onUpdateShopName }: SettingsTabProps) {
  const { idToken } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filterStatus, setFilterStatus] = useState<'active' | 'suspended' | 'ended'>('active');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [view, setView] = useHistoryState<'list' | 'add' | 'edit'>('settings-view', 'list', true);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const [calendarOpen, setCalendarOpen] = useState<boolean>(false);
  const [shopNameOpen, setShopNameOpen] = useState<boolean>(false);

  const [shopSettings, setShopSettings] = useState<ShopSettings>({
    shopName: DEFAULT_SHOP_NAME,
    workDays: [1, 2, 3, 4, 5, 6],
    revision: 1
  });
  const [shopNameInput, setShopNameInput] = useState<string>(DEFAULT_SHOP_NAME);
  const [selectedWorkDays, setSelectedWorkDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);

  const [formName, setFormName] = useState<string>('');
  const [formNickname, setFormNickname] = useState<string>('');
  const [formPosition, setFormPosition] = useState<string>('');
  const [formNotes, setFormNotes] = useState<string>('');
  const [formStartDate, setFormStartDate] = useState<string>('');
  const [formDailyRate, setFormDailyRate] = useState<string>('500');
  const [formRateEffectiveDate, setFormRateEffectiveDate] = useState<string>('');
  const [formExtraTemplates, setFormExtraTemplates] = useState<{ name: string; amount: string }[]>([]);
  const [formPhotoFile, setFormPhotoFile] = useState<File | null>(null);
  const [formPhotoPreview, setFormPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [photoPending, setPhotoPending] = useState(false);
  const { pending: settingsPending, run: runSettingsAction } = usePendingAction();

  const [showEndModal, setShowEndModal] = useHistoryState<boolean>('end-employment', false);
  const [endDateInput, setEndDateInput] = useState<string>('');
  useModalInteraction(active && showEndModal, () => setShowEndModal(false));
  const [showSuspendModal, setShowSuspendModal] = useHistoryState<boolean>('suspend-employment', false);
  const [suspendTargetState, setSuspendTargetState] = useState<boolean>(true);
  useModalInteraction(active && showSuspendModal, () => setShowSuspendModal(false));

  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadSequence = useRef(0);
  const loadController = useRef<AbortController | null>(null);
  const submitLock = useRef(false);
  const addIntent = useRef(new MutationIntent());
  const photoSequence = useRef(0);
  const [hasLoaded, setHasLoaded] = useState(false);

  const loadData = async () => {
    if (!idToken) return;
    const sequence = ++loadSequence.current;
    loadController.current?.abort();
    const controller = new AbortController(); loadController.current = controller;
    setLoading(true);
    setError(null);
    try {
      const [res, bootRes] = await Promise.all([
        fetch('/api/employees', { signal: controller.signal, headers: { Authorization: `Bearer ${idToken}` } }),
        fetch('/api/settings?calendar=1', { signal: controller.signal, headers: { Authorization: `Bearer ${idToken}` } })
      ]);
      if (!res.ok) throw new Error('โหลดรายชื่อพนักงานไม่สำเร็จ');
      if (!bootRes.ok) throw new Error('โหลดการตั้งค่าไม่สำเร็จ');
      const data = await res.json();
      const rawList = Array.isArray(data.data)
        ? data.data
        : Array.isArray(data.employees)
        ? data.employees
        : Array.isArray(data.data?.employees)
        ? data.data.employees
        : Array.isArray(data)
        ? data
        : [];

      const mappedList: Employee[] = rawList.map((emp: any) => ({
        id: emp.id || emp.employeeId,
        name: emp.name || '',
        nickname: emp.nickname || '',
        position: emp.position || '',
        notes: emp.notes || '',
        startDate: emp.startDate || '',
        endDate: emp.endDate || null,
        dailyRateSatang: typeof emp.dailyRateSatang === 'number' ? emp.dailyRateSatang : (emp.currentRate?.dailySatang || 0),
        photoPath: emp.photoPath || (emp.photo ? `/api/employees/${emp.id || emp.employeeId}/photo` : null),
        photoVersion: emp.photoVersion || emp.photo?.version || 1,
        revision: emp.revision || 1,
        status: emp.status || (emp.suspended ? 'SUSPENDED' : 'ACTIVE'),
        suspended: Boolean(emp.suspended || emp.status === 'SUSPENDED'),
        suspendedAt: emp.suspendedAt || null,
        extraTemplates: (emp.extraTemplates || []).map((t: any) => ({
          name: t.name || t.label || '',
          amountSatang: typeof t.amountSatang === 'number' ? t.amountSatang : 0
        }))
      }));
      if (sequence !== loadSequence.current) return;
      setEmployees(mappedList);
      setHasLoaded(true);

      if (bootRes.ok) {
        const bootJson = await bootRes.json();
        if (sequence !== loadSequence.current) return;
        const bootData = bootJson.data || bootJson;
        const profile = bootData.profile || bootData.shop || {};
        const currentShopName = displayShopName(profile.shopName || profile.displayName);
        const currentRev = typeof profile.revision === 'number' ? profile.revision : 1;
        const calVersions = bootData.calendarVersions || [];
        const latestCal = Array.isArray(calVersions) && calVersions.length > 0
          ? [...calVersions].sort((a: any, b: any) => (b.effectiveFrom || b.effectiveDate || '').localeCompare(a.effectiveFrom || a.effectiveDate || ''))[0]
          : null;
        const activeWorkDays = latestCal?.weekdays || latestCal?.workDays || profile.workDays || [1, 2, 3, 4, 5, 6];

        setShopSettings({
          shopName: currentShopName,
          workDays: activeWorkDays,
          revision: currentRev
        });
        setShopNameInput(currentShopName);
        setSelectedWorkDays(activeWorkDays);
      }
    } catch (err: any) {
      if (sequence === loadSequence.current && !controller.signal.aborted) {
        setError(err.message || 'โหลดข้อมูลไม่สำเร็จ');
      }
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (active) loadData();
    return () => { ++loadSequence.current; loadController.current?.abort(); };
  }, [active, idToken]);

  useEffect(() => { ++photoSequence.current; setPhotoPending(false); }, [view, active]);

  const showNotification = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleOpenAdd = () => {
    if (submitLock.current || photoPending) return;
    setSelectedEmployee(null);
    setFormName('');
    setFormNickname('');
    setFormPosition('');
    setFormNotes('');
    const today = getBangkokToday();
    setFormStartDate(today);
    setFormDailyRate('500');
    setFormRateEffectiveDate(today);
    setFormExtraTemplates([]);
    setFormPhotoFile(null);
    setFormPhotoPreview(null);
    setView('add');
  };

  const handleOpenEdit = (emp: Employee) => {
    if (loading || submitLock.current || photoPending) return;
    setSelectedEmployee(emp);
    setFormName(emp.name);
    setFormNickname(emp.nickname || '');
    setFormPosition(emp.position || '');
    setFormNotes(emp.notes || '');
    setFormStartDate(emp.startDate || '');
    setFormDailyRate(((emp.dailyRateSatang || 0) / 100).toString());
    const today = getBangkokToday();
    setFormRateEffectiveDate(today);
    setFormExtraTemplates(
      (emp.extraTemplates || []).map((t) => ({
        name: t.name,
        amount: (t.amountSatang / 100).toString()
      }))
    );
    setFormPhotoFile(null);
    setFormPhotoPreview(
      emp.photoPath ? `/api/employees/${emp.id}/photo?v=${emp.photoVersion || 1}` : null
    );
    setView('edit');
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (photoPending) return;
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('เลือกไฟล์รูปภาพเท่านั้น');
      return;
    }

    setPhotoPending(true);
    const sequence = ++photoSequence.current;
    const photoError = () => { if (sequence !== photoSequence.current) return; setPhotoPending(false); alert('เปิดรูปภาพนี้ไม่ได้'); };
    const reader = new FileReader();
    reader.onerror = photoError;
    reader.onload = (event) => {
      if (sequence !== photoSequence.current) return;
      const img = new Image();
      img.onerror = photoError;
      img.onload = () => {
        if (sequence !== photoSequence.current) return;
        const maxDim = 800;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { photoError(); return; }
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (sequence !== photoSequence.current) return;
            setPhotoPending(false);
            if (blob) {
              const resizedFile = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
              setFormPhotoFile(resizedFile);
              setFormPhotoPreview(canvas.toDataURL('image/jpeg', 0.8));
            }
          },
          'image/jpeg',
          0.8
        );
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleAddExtraTemplate = () => {
    setFormExtraTemplates([...formExtraTemplates, { name: '', amount: '' }]);
  };

  const handleRemoveExtraTemplate = (index: number) => {
    const next = [...formExtraTemplates];
    next.splice(index, 1);
    setFormExtraTemplates(next);
  };

  const handleUpdateExtraTemplate = (
    index: number,
    field: 'name' | 'amount',
    val: string
  ) => {
    const next = [...formExtraTemplates];
    next[index][field] = val;
    setFormExtraTemplates(next);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idToken || submitLock.current || photoPending) return;
    const effectiveNick = formNickname.trim();
    const effectiveName = formName.trim() || effectiveNick;
    if (!effectiveNick && !formName.trim()) {
      alert('ระบุชื่อเล่นหรือชื่อ-นามสกุล');
      return;
    }
    let rateSatang: number;
    try { rateSatang = moneySatang(formDailyRate.trim()); }
    catch { alert('กรอกค่าแรงเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง'); return; }
    const rateNum = rateSatang / 100;
    if (rateSatang <= 0) {
      alert('กรอกค่าแรงรายวันให้ถูกต้อง');
      return;
    }

    submitLock.current = true; setSubmitting(true);
    let writeStarted = false;
    try {
      const extraTemplatesFormatted = employeeExtraTemplates(formExtraTemplates);

      if (view === 'add') {
        writeStarted = true;
        const payload = { name: effectiveName, nickname: effectiveNick, position: formPosition.trim(), notes: formNotes.trim(),
          startDate: formStartDate, dailyRate: rateNum.toString(), dailyRateSatang: rateSatang, rateSatang, extraTemplates: extraTemplatesFormatted };
        const res = await fetch('/api/employees', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ...payload,
            requestId: addIntent.current.requestId(payload)
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || errData.message || 'บันทึกพนักงานใหม่ไม่สำเร็จ');
        }

        const newEmpData = await res.json();
        addIntent.current.complete();
        const createdEmpId =
          newEmpData.data?.employeeId ||
          newEmpData.data?.id ||
          newEmpData.employee?.id ||
          newEmpData.id ||
          newEmpData.employeeId;

        if (formPhotoFile && createdEmpId) {
          const photoFormData = new FormData();
          photoFormData.append('file', formPhotoFile);
          photoFormData.append('requestId', `photo_${createdEmpId}_${Date.now()}`);
          photoFormData.append('expectedRevision', '1');
          try {
            await mutationData(await fetch(`/api/employees/${createdEmpId}/photo`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${idToken}` },
              body: photoFormData
            }), 'เพิ่มพนักงานแล้ว แต่บันทึกรูปภาพไม่สำเร็จ');
          } catch (error) {
            await loadData(); setView('list');
            throw error;
          }
        }

        notifyDataChanged(); showNotification('เพิ่มพนักงานแล้ว');
      } else if (view === 'edit' && selectedEmployee) {
        writeStarted = true;
        const patchRes = await fetch(`/api/employees/${selectedEmployee.id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: effectiveName,
            nickname: effectiveNick,
            position: formPosition.trim(),
            notes: formNotes.trim(),
            startDate: formStartDate,
            expectedRevision: selectedEmployee.revision,
            requestId: `patch_emp_${selectedEmployee.id}_${Date.now()}`
          })
        });

        if (!patchRes.ok) {
          const errData = await patchRes.json().catch(() => ({}));
          throw new Error(errData.error?.message || errData.message || 'แก้ไขข้อมูลพนักงานไม่สำเร็จ');
        }
        const patched = await mutationData(patchRes, 'แก้ไขข้อมูลพนักงานไม่สำเร็จ');
        let updatedRevision = patched.revision;
        setSelectedEmployee(previous => previous?.id === selectedEmployee.id ? { ...previous, revision: updatedRevision } : previous);

        const currentRateSatang = selectedEmployee.dailyRateSatang;
        const newRateSatang = Math.round(rateNum * 100);
        if (currentRateSatang !== newRateSatang) {
          const rateResult = await mutationData(await fetch(`/api/employees/${selectedEmployee.id}/rates`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${idToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              rateSatang: newRateSatang,
              dailyRateSatang: newRateSatang,
              dailyRate: rateNum.toString(),
              effectiveDate: formRateEffectiveDate || formStartDate,
              effectiveFrom: formRateEffectiveDate || formStartDate,
              expectedRevision: updatedRevision,
              requestId: `rate_emp_${selectedEmployee.id}_${Date.now()}`
            })
          }), 'บันทึกค่าแรงไม่สำเร็จ');
          updatedRevision = rateResult.employeeRevision;
          setSelectedEmployee(previous => previous?.id === selectedEmployee.id ? { ...previous, revision: updatedRevision, dailyRateSatang: newRateSatang } : previous);
        }

        await mutationData(await fetch(`/api/employees/${selectedEmployee.id}/extra-templates`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            extraTemplates: extraTemplatesFormatted,
            requestId: `extra_tmpl_${selectedEmployee.id}_${Date.now()}`
          })
        }), 'บันทึกเงินพิเศษประจำไม่สำเร็จ');

        if (formPhotoFile) {
          const photoFormData = new FormData();
          photoFormData.append('file', formPhotoFile);
          photoFormData.append('requestId', `photo_${selectedEmployee.id}_${Date.now()}`);
          photoFormData.append('expectedRevision', String(updatedRevision));
          await mutationData(await fetch(`/api/employees/${selectedEmployee.id}/photo`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${idToken}` },
            body: photoFormData
          }), 'บันทึกรูปภาพไม่สำเร็จ');
        }

        notifyDataChanged(); showNotification('บันทึกการแก้ไขแล้ว');
      }

      await loadData();
      setView('list');
    } catch (err: any) {
      if (writeStarted) notifyDataChanged();
      alert(err.message || 'บันทึกไม่สำเร็จ');
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const handleConfirmEndEmployment = async () => {
    if (!selectedEmployee || !idToken || !endDateInput || submitLock.current) return;
    submitLock.current = true; setSubmitting(true);
    try {
      const res = await fetch(`/api/employees/${selectedEmployee.id}/end-employment`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          endDate: endDateInput,
          expectedRevision: selectedEmployee.revision,
          requestId: `end_emp_${selectedEmployee.id}_${Date.now()}`
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || errData.message || 'บันทึกสิ้นสุดการจ้างไม่สำเร็จ');
      }

      setShowEndModal(false);
      notifyDataChanged();
      showNotification('บันทึกสิ้นสุดการจ้างแล้ว');
      await loadData();
      setView('list');
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาด');
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const handleConfirmToggleSuspend = async () => {
    if (!selectedEmployee || !idToken || submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/employees/${selectedEmployee.id}/suspend`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          suspended: suspendTargetState,
          expectedRevision: selectedEmployee.revision,
          requestId: `suspend_emp_${selectedEmployee.id}_${Date.now()}`
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || errData.message || 'เปลี่ยนสถานะไม่สำเร็จ');
      }

      setShowSuspendModal(false);
      notifyDataChanged();
      showNotification(suspendTargetState ? 'พักการทำงานแล้ว' : 'เปลี่ยนสถานะกลับมาทำงานแล้ว');
      await loadData();
      setView('list');
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาด');
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const handleSaveShopName = async () => {
    if (!idToken || !shopNameInput.trim()) return;
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          shopName: shopNameInput.trim(),
          expectedRevision: shopSettings.revision,
          requestId: `shop_name_${Date.now()}`
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error?.message || errJson.message || 'บันทึกชื่อร้านไม่สำเร็จ');
      }
      const resJson = await res.json();
      const updatedData = resJson.data || resJson;
      const newName = displayShopName(updatedData.shopName || updatedData.displayName || shopNameInput);
      const newRev = typeof updatedData.revision === 'number' ? updatedData.revision : (shopSettings.revision + 1);

      showNotification('บันทึกชื่อร้านแล้ว');
      setShopSettings(prev => ({ ...prev, shopName: newName, revision: newRev }));
      setShopNameInput(newName);
      onUpdateShopName?.(newName);
      setShopNameOpen(false);
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาด');
    }
  };

  const handleToggleWorkDay = (dayIndex: number) => {
    if (selectedWorkDays.includes(dayIndex)) {
      if (selectedWorkDays.length === 1) {
        alert('ต้องเลือกวันทำงานอย่างน้อย 1 วัน');
        return;
      }
      setSelectedWorkDays(selectedWorkDays.filter((d) => d !== dayIndex));
    } else {
      setSelectedWorkDays([...selectedWorkDays, dayIndex].sort());
    }
  };

  const handleSaveWorkDays = async () => {
    if (!idToken) return;
    try {
      const today = getBangkokToday();
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'VERSION',
          weekdays: selectedWorkDays,
          workDays: selectedWorkDays,
          effectiveFrom: today,
          effectiveDate: today,
          requestId: `calendar_${Date.now()}`
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || errData.message || 'บันทึกวันทำงานไม่สำเร็จ');
      }

      setShopSettings(prev => ({ ...prev, workDays: selectedWorkDays }));
      notifyDataChanged();
      showNotification('บันทึกวันทำงานแล้ว');
      setCalendarOpen(false);
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาด');
    }
  };

  const counts = useMemo(() => {
    let activeCount = 0, suspendedCount = 0, endedCount = 0;
    for (const emp of employees) {
      if (emp.endDate) endedCount++;
      else if (emp.suspended) suspendedCount++;
      else activeCount++;
    }
    return { activeCount, suspendedCount, endedCount };
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (filterStatus === 'active') return !emp.endDate && !emp.suspended;
      if (filterStatus === 'suspended') return !emp.endDate && Boolean(emp.suspended);
      return Boolean(emp.endDate);
    });
  }, [employees, filterStatus]);

  return (
    <div>
      <h1 className={styles.title}>ตั้งค่า</h1>

      {successMessage && (
        <div className="app-notice app-notice-success" role="status" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
          <CheckCircle2 size={20} aria-hidden="true" />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="app-notice app-notice-danger" role="alert" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
          <AlertCircle size={20} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {(view === 'add' || view === 'edit') && (
        <div className={styles.formContainer}>
          <h2 className={styles.formHeading}>
            {view === 'add' ? 'เพิ่มพนักงานใหม่' : 'แก้ไขข้อมูลพนักงาน'}
          </h2>

          <form onSubmit={handleSubmitForm}>
            <fieldset disabled={submitting || photoPending} className={styles.formFields}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>รูปถ่ายพนักงาน</label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  style={{ display: 'none' }}
                />
                {formPhotoPreview ? (
                  <img
                    loading="lazy"
                    decoding="async"
                    src={formPhotoPreview}
                    alt="รูปถ่าย"
                    className={styles.photoPreview}
                  />
                ) : (
                  <div className={styles.photoPlaceholder}>
                    <User size={36} color="var(--team-muted)" aria-hidden="true" />
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera size={20} aria-hidden="true" />
                  <span>เลือกรูปถ่าย</span>
                </button>
              </div>

              <div className={styles.formPair}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="employee-nickname">ชื่อเล่น *</label>
                  <input
                    id="employee-nickname"
                    type="text"
                    className={styles.formInput}
                    value={formNickname}
                    onChange={(e) => setFormNickname(e.target.value)}
                    placeholder="เช่น บอย, ตาล, เก่ง"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="employee-position">ตำแหน่ง *</label>
                  <input
                    id="employee-position"
                    type="text"
                    className={styles.formInput}
                    value={formPosition}
                    onChange={(e) => setFormPosition(e.target.value)}
                    placeholder="เช่น ช่างเทคนิค"
                    required
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="employee-name">ชื่อจริง-นามสกุล</label>
                <input
                  id="employee-name"
                  type="text"
                  className={styles.formInput}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="ระบุหรือไม่ก็ได้ เช่น สมศักดิ์ มีชัย"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="employee-start">วันที่เริ่มงาน *</label>
                <input
                  id="employee-start"
                  type="date"
                  className={styles.formInput}
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="employee-rate">ค่าแรงรายวัน (บาท) *</label>
                <input
                  id="employee-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  className={styles.formInput}
                  value={formDailyRate}
                  onChange={(e) => setFormDailyRate(e.target.value)}
                  required
                />
                {view === 'edit' && (
                  <div style={{ marginTop: '0.65rem' }}>
                    <label className={styles.formLabel} style={{ fontSize: 'var(--team-secondary)', color: 'var(--team-muted)' }}>
                      วันที่เริ่มใช้อัตราใหม่
                    </label>
                    <input
                      type="date"
                      className={styles.formInput}
                      value={formRateEffectiveDate}
                      onChange={(e) => setFormRateEffectiveDate(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="employee-notes">บันทึกเพิ่มเติม</label>
                <textarea
                  id="employee-notes"
                  className={styles.formTextarea}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="เบอร์โทร หรือหมายเหตุ"
                />
              </div>

              <div className={styles.formGroup}>
                <div className={styles.extraHeader}>
                  <label className={styles.formLabel} style={{ margin: 0 }}>
                    เงินพิเศษประจำ
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleAddExtraTemplate}
                  >
                    <Plus size={18} aria-hidden="true" />
                    <span>เพิ่มรายการ</span>
                  </button>
                </div>

                {formExtraTemplates.length === 0 ? (
                  <p style={{ color: 'var(--team-muted)', fontSize: 'var(--team-secondary)', margin: '0.4rem 0' }}>
                    ยังไม่มีรายการเงินพิเศษประจำ
                  </p>
                ) : (
                  formExtraTemplates.map((item, idx) => (
                    <div key={idx} className={styles.extraItemRow}>
                      <div className={styles.extraFields}>
                        <input
                          type="text"
                          className={styles.formInput}
                          value={item.name}
                          onChange={(e) => handleUpdateExtraTemplate(idx, 'name', e.target.value)}
                          placeholder="ชื่อรายการ เช่น ค่าเดินทาง"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className={styles.formInput}
                          value={item.amount}
                          onChange={(e) => handleUpdateExtraTemplate(idx, 'amount', e.target.value)}
                          placeholder="บาท"
                        />
                        <button
                          aria-label={`ลบรายการเงินพิเศษ ${idx + 1}`}
                          type="button"
                          className="btn btn-danger btn-icon"
                          onClick={() => handleRemoveExtraTemplate(idx)}
                        >
                          <Trash2 size={18} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className={styles.formActions}>
                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  disabled={submitting || photoPending}
                >
                  {submitting ? <span className="busyInline">กำลังบันทึก</span> : 'บันทึกข้อมูล'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  onClick={() => setView('list')}
                  disabled={submitting}
                >
                  ยกเลิก
                </button>
              </div>

              {view === 'edit' && selectedEmployee && !selectedEmployee.endDate && (
                <div className={styles.dangerZone}>
                  {selectedEmployee.suspended ? (
                    <>
                      <div className={styles.suspendedAlertBox}>
                        <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '0.15rem' }} aria-hidden="true" />
                        <div>
                          <strong>พนักงานพักการทำงานอยู่</strong>
                          <p style={{ margin: '0.2rem 0 0', fontSize: 'var(--team-secondary)' }}>
                            เก็บประวัติไว้และซ่อนชื่อจากหน้าเช็กชื่อจนกว่าจะกลับมาทำงาน
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-success btn-block"
                        onClick={() => {
                          setSuspendTargetState(false);
                          setShowSuspendModal(true);
                        }}
                      >
                        กลับมาทำงานต่อ
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-warning btn-block"
                      onClick={() => {
                        setSuspendTargetState(true);
                        setShowSuspendModal(true);
                      }}
                    >
                      พักการทำงาน
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn btn-danger btn-block"
                    onClick={() => {
                      setEndDateInput(getBangkokToday());
                      setShowEndModal(true);
                    }}
                  >
                    สิ้นสุดการจ้าง
                  </button>
                </div>
              )}
            </fieldset>
          </form>
        </div>
      )}

      {(loading || settingsPending || submitting || photoPending) && (
        <div className="refreshStatus" role="status">
          {settingsPending || (photoPending ? 'กำลังเตรียมรูปภาพ' : submitting ? 'กำลังบันทึกข้อมูล' : 'กำลังโหลดข้อมูล')}
        </div>
      )}

      {view === 'list' && (
        <div>
          <div className={styles.listControlsBar}>
            <button type="button" className={`btn btn-primary ${styles.addAction}`} onClick={handleOpenAdd} disabled={submitting || photoPending}>
              <Plus size={20} aria-hidden="true" />
              <span>เพิ่มพนักงานใหม่</span>
            </button>

            <div className={styles.filterRow} role="group" aria-label="กรองสถานะพนักงาน">
              <button
                type="button"
                className={`btn btn-sm ${filterStatus === 'active' ? 'btn-primary' : 'btn-secondary'}`}
                aria-pressed={filterStatus === 'active'}
                onClick={() => setFilterStatus('active')}
              >
                ทำงานอยู่ ({counts.activeCount})
              </button>
              <button
                type="button"
                className={`btn btn-sm ${filterStatus === 'suspended' ? 'btn-primary' : 'btn-secondary'}`}
                aria-pressed={filterStatus === 'suspended'}
                onClick={() => setFilterStatus('suspended')}
              >
                พักงาน ({counts.suspendedCount})
              </button>
              <button
                type="button"
                className={`btn btn-sm ${filterStatus === 'ended' ? 'btn-primary' : 'btn-secondary'}`}
                aria-pressed={filterStatus === 'ended'}
                onClick={() => setFilterStatus('ended')}
              >
                สิ้นสุด ({counts.endedCount})
              </button>
            </div>
          </div>

          {loading && !hasLoaded ? (
            <div className={styles.employeeGrid} aria-busy="true" aria-label="กำลังโหลดพนักงาน">
              {[0, 1, 2].map(index => <div className="loadingCard" key={index}><span className="loadingLine" /><span className="loadingLine" /></div>)}
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className={styles.emptyCard}>ไม่พบรายชื่อพนักงาน</div>
          ) : (
            <div className={styles.employeeGrid}>
              {filteredEmployees.map((emp) => (
                <div key={emp.id} className={styles.personCard}>
                  <div>
                    <div className={styles.personHead}>
                      <div className={styles.avatar}>
                        {emp.photoPath ? (
                          <img
                            loading="lazy"
                            decoding="async"
                            src={`/api/employees/${emp.id}/photo?v=${emp.photoVersion || 1}`}
                            alt={emp.nickname || emp.name}
                          />
                        ) : (
                          (emp.nickname || emp.name).charAt(0)
                        )}
                      </div>
                      <div className={styles.personInfo}>
                        <h3 className={styles.personName}>{emp.nickname || emp.name}</h3>
                        <div className={styles.personPosition}>
                          {emp.position || 'พนักงาน'}
                          {emp.name && emp.nickname && emp.name !== emp.nickname && ` · ${emp.name}`}
                        </div>
                      </div>
                    </div>

                    <div className={styles.personMeta}>
                      <div>
                        ค่าแรงวันละ{' '}
                        <strong>
                          {((emp.dailyRateSatang || 0) / 100).toLocaleString('th-TH', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}{' '}
                          บาท
                        </strong>
                      </div>
                      <div>เงินพิเศษประจำ {emp.extraTemplates?.length || 0} รายการ</div>
                      {emp.suspended && <div><span className={styles.statusBadgeSuspended}>พักการทำงาน</span></div>}
                      {emp.endDate && <div><span className={styles.statusBadgeEnded}>สิ้นสุดการจ้าง</span></div>}
                      <div className={styles.personDate}>
                        เริ่มงาน {emp.startDate}
                        {emp.endDate && ` · สิ้นสุด ${emp.endDate}`}
                      </div>
                    </div>
                  </div>

                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleOpenEdit(emp)}
                      disabled={loading || submitting || photoPending}
                    >
                      <Pencil size={18} aria-hidden="true" />
                      <span>แก้ไขข้อมูล</span>
                    </button>
                    {emp.suspended && (
                      <button
                        type="button"
                        className="btn btn-success btn-sm"
                        onClick={() => {
                          setSelectedEmployee(emp);
                          setSuspendTargetState(false);
                          setShowSuspendModal(true);
                        }}
                        disabled={loading || submitting || photoPending}
                      >
                        ทำงานต่อ
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className={styles.collapsibleSection}>
            <button type="button" aria-expanded={calendarOpen} className={styles.sectionHeader} onClick={() => setCalendarOpen(!calendarOpen)}>
              <span>วันทำงานของร้าน</span>
              {calendarOpen ? <ChevronUp size={22} aria-hidden="true" /> : <ChevronDown size={22} aria-hidden="true" />}
            </button>
            {calendarOpen && (
              <div className={styles.sectionBody}>
                <p style={{ margin: '0 0 0.85rem' }}>เลือกวันทำงานปกติของร้านในแต่ละสัปดาห์</p>
                <div className={styles.workDays}>
                  {DAY_NAMES.map((dayName, idx) => {
                    const isSelected = selectedWorkDays.includes(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => handleToggleWorkDay(idx)}
                        aria-pressed={isSelected}
                        disabled={Boolean(settingsPending)}
                      >
                        {dayName}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={() => runSettingsAction('กำลังบันทึกวันทำงาน', handleSaveWorkDays)}
                  disabled={Boolean(settingsPending)}
                  aria-busy={Boolean(settingsPending)}
                >
                  บันทึกวันทำงาน
                </button>
              </div>
            )}
          </div>

          <div className={styles.collapsibleSection}>
            <button type="button" aria-expanded={shopNameOpen} className={styles.sectionHeader} onClick={() => setShopNameOpen(!shopNameOpen)}>
              <span>ชื่อร้าน</span>
              {shopNameOpen ? <ChevronUp size={22} aria-hidden="true" /> : <ChevronDown size={22} aria-hidden="true" />}
            </button>
            {shopNameOpen && (
              <div className={styles.sectionBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="shop-name">ชื่อร้าน</label>
                  <input
                    id="shop-name"
                    type="text"
                    className={styles.formInput}
                    value={shopNameInput}
                    disabled={Boolean(settingsPending)}
                    onChange={(e) => setShopNameInput(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={() => runSettingsAction('กำลังบันทึกชื่อร้าน', handleSaveShopName)}
                  disabled={Boolean(settingsPending)}
                  aria-busy={Boolean(settingsPending)}
                >
                  บันทึกชื่อร้าน
                </button>
              </div>
            )}
          </div>
          <LineSettings />
        </div>
      )}

      {showEndModal && selectedEmployee && (
        <div className="app-modal-overlay">
          <div className="app-modal-card" data-app-dialog role="dialog" aria-modal="true" aria-label="ยืนยันการสิ้นสุดการจ้าง" tabIndex={-1}>
            <h3 className="app-modal-title app-modal-title-danger">ยืนยันสิ้นสุดการจ้าง</h3>
            <p className="app-modal-desc">
              บันทึกสิ้นสุดการจ้างของ <strong>{selectedEmployee.name}</strong>
            </p>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="employee-end">วันทำงานวันสุดท้าย</label>
              <input
                id="employee-end"
                type="date"
                className={styles.formInput}
                value={endDateInput}
                onChange={(e) => setEndDateInput(e.target.value)}
                required
              />
            </div>
            <div className="app-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowEndModal(false)} disabled={submitting}>
                ยกเลิก
              </button>
              <button type="button" className="btn btn-danger-solid" onClick={handleConfirmEndEmployment} disabled={submitting}>
                {submitting ? <span className="busyInline">กำลังบันทึก</span> : 'ยืนยันสิ้นสุด'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuspendModal && selectedEmployee && (
        <div className="app-modal-overlay">
          <div
            className="app-modal-card"
            data-app-dialog
            role="dialog"
            aria-modal="true"
            aria-label={suspendTargetState ? 'ยืนยันการพักการทำงาน' : 'ยืนยันให้ทำงานต่อ'}
            tabIndex={-1}
          >
            <h3 className={`app-modal-title ${suspendTargetState ? 'app-modal-title-warning' : 'app-modal-title-success'}`}>
              {suspendTargetState ? 'ยืนยันพักการทำงาน' : 'ยืนยันให้ทำงานต่อ'}
            </h3>
            <p className="app-modal-desc">
              {suspendTargetState ? (
                <>พักการทำงานของ <strong>{selectedEmployee.nickname || selectedEmployee.name}</strong> หรือไม่</>
              ) : (
                <>ให้ <strong>{selectedEmployee.nickname || selectedEmployee.name}</strong> กลับมาทำงานต่อหรือไม่</>
              )}
            </p>
            <div className={`app-notice ${suspendTargetState ? '' : 'app-notice-success'}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
              {suspendTargetState ? (
                <>
                  <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '0.2rem' }} aria-hidden="true" />
                  <span>เก็บประวัติ ค่าแรง และเงินพิเศษไว้ โดยซ่อนชื่อจากหน้าเช็กชื่อจนกว่าจะกลับมาทำงาน</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: '0.2rem' }} aria-hidden="true" />
                  <span>ชื่อพนักงานจะกลับมาแสดงในหน้าเช็กชื่ออีกครั้ง</span>
                </>
              )}
            </div>
            <div className="app-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowSuspendModal(false)} disabled={submitting}>
                ยกเลิก
              </button>
              <button
                type="button"
                className={`btn ${suspendTargetState ? 'btn-warning-solid' : 'btn-success-solid'}`}
                onClick={handleConfirmToggleSuspend}
                disabled={submitting}
              >
                {submitting ? <span className="busyInline">กำลังบันทึก</span> : suspendTargetState ? 'ยืนยันพักงาน' : 'ยืนยันทำงานต่อ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
