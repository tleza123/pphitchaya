'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import {
  Plus,
  User,
  ChevronDown,
  ChevronUp,
  Trash2,
  Camera,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import styles from './settings.module.css';

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
}

interface ShopSettings {
  shopName: string;
  workDays: number[]; // 0 = Sun, 1 = Mon ...
  revision: number;
}

interface SettingsTabProps {
  onUpdateShopName?: (name: string) => void;
}

const DAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

export default function SettingsTab({ onUpdateShopName }: SettingsTabProps = {}) {
  const { idToken } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filterActive, setFilterActive] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // View state: 'list' | 'add' | 'edit'
  const [view, setView] = useState<'list' | 'add' | 'edit'>('list');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  // Collapsible sections
  const [calendarOpen, setCalendarOpen] = useState<boolean>(false);
  const [shopNameOpen, setShopNameOpen] = useState<boolean>(false);

  // Shop settings
  const [shopSettings, setShopSettings] = useState<ShopSettings>({
    shopName: 'DE TEAM',
    workDays: [1, 2, 3, 4, 5, 6],
    revision: 1
  });
  const [shopNameInput, setShopNameInput] = useState<string>('DE TEAM');
  const [selectedWorkDays, setSelectedWorkDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);

  // Form states
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

  // End employment modal
  const [showEndModal, setShowEndModal] = useState<boolean>(false);
  const [endDateInput, setEndDateInput] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    if (!idToken) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch employees
      const res = await fetch('/api/employees', {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      if (!res.ok) throw new Error('ไม่สามารถโหลดข้อมูลพนักงานได้');
      const data = await res.json();
      const empData = data.data || data;
      setEmployees(empData.employees || []);

      // Fetch bootstrap/settings
      const bootRes = await fetch('/api/bootstrap', {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      if (bootRes.ok) {
        const bootJson = await bootRes.json();
        const bootData = bootJson.data || bootJson;
        const profile = bootData.profile || bootData.shop || {};
        const currentShopName = profile.shopName || profile.displayName || 'DE TEAM';
        const currentRev = typeof profile.revision === 'number' ? profile.revision : 1;
        setShopSettings({
          shopName: currentShopName,
          workDays: profile.workDays || [1, 2, 3, 4, 5, 6],
          revision: currentRev
        });
        setShopNameInput(currentShopName);
        if (profile.workDays) {
          setSelectedWorkDays(profile.workDays);
        }
      }
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [idToken]);

  const showNotification = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // Open add form
  const handleOpenAdd = () => {
    setSelectedEmployee(null);
    setFormName('');
    setFormNickname('');
    setFormPosition('');
    setFormNotes('');
    const today = new Date().toISOString().split('T')[0];
    setFormStartDate(today);
    setFormDailyRate('500');
    setFormRateEffectiveDate(today);
    setFormExtraTemplates([]);
    setFormPhotoFile(null);
    setFormPhotoPreview(null);
    setView('add');
  };

  // Open edit form
  const handleOpenEdit = (emp: Employee) => {
    setSelectedEmployee(emp);
    setFormName(emp.name);
    setFormNickname(emp.nickname || '');
    setFormPosition(emp.position || '');
    setFormNotes(emp.notes || '');
    setFormStartDate(emp.startDate || '');
    setFormDailyRate(((emp.dailyRateSatang || 0) / 100).toString());
    const today = new Date().toISOString().split('T')[0];
    setFormRateEffectiveDate(today);
    setFormExtraTemplates(
      (emp.extraTemplates || []).map((t) => ({
        name: t.name,
        amount: (t.amountSatang / 100).toString()
      }))
    );
    setFormPhotoFile(null);
    setFormPhotoPreview(
      emp.photoPath ? `/api/employees/${emp.id}/photo?t=${emp.photoVersion || 1}` : null
    );
    setView('edit');
  };

  // Resize photo client-side via canvas before saving
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('กรุณาเลือกไฟล์รูปภาพ');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
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
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
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

  // Extra template rows
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

  // Submit Add / Edit
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idToken) return;
    const effectiveNick = formNickname.trim();
    const effectiveName = formName.trim() || effectiveNick;
    if (!effectiveNick && !formName.trim()) {
      alert('กรุณาระบุชื่อเล่นหรือชื่อ-นามสกุล');
      return;
    }
    const rateNum = parseFloat(formDailyRate);
    if (isNaN(rateNum) || rateNum <= 0) {
      alert('กรุณากรอกค่าแรงรายวันให้ถูกต้อง');
      return;
    }

    setSubmitting(true);
    try {
      const extraTemplatesFormatted = formExtraTemplates
        .filter((t) => t.name.trim() && parseFloat(t.amount) > 0)
        .map((t) => ({
          name: t.name.trim(),
          amountSatang: Math.round(parseFloat(t.amount) * 100)
        }));

      if (view === 'add') {
        // Create employee
        const res = await fetch('/api/employees', {
          method: 'POST',
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
            dailyRateSatang: Math.round(rateNum * 100),
            extraTemplates: extraTemplatesFormatted,
            requestId: `add_emp_${Date.now()}`
          })
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.message || 'ไม่สามารถบันทึกพนักงานใหม่ได้');
        }

        const newEmpData = await res.json();
        const createdEmpId = newEmpData.employee?.id || newEmpData.id;

        // Upload photo if selected
        if (formPhotoFile && createdEmpId) {
          const photoFormData = new FormData();
          photoFormData.append('file', formPhotoFile);
          await fetch(`/api/employees/${createdEmpId}/photo`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${idToken}` },
            body: photoFormData
          });
        }

        showNotification('เพิ่มพนักงานสำเร็จ');
      } else if (view === 'edit' && selectedEmployee) {
        // Update basic info
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
            expectedRevision: selectedEmployee.revision,
            requestId: `patch_emp_${selectedEmployee.id}_${Date.now()}`
          })
        });

        if (!patchRes.ok) {
          const errData = await patchRes.json();
          throw new Error(errData.message || 'ไม่สามารถแก้ไขข้อมูลพนักงานได้');
        }

        // Check if rate changed
        const currentRateSatang = selectedEmployee.dailyRateSatang;
        const newRateSatang = Math.round(rateNum * 100);
        if (currentRateSatang !== newRateSatang) {
          await fetch(`/api/employees/${selectedEmployee.id}/rates`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${idToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              rateSatang: newRateSatang,
              effectiveDate: formRateEffectiveDate || formStartDate,
              requestId: `rate_emp_${selectedEmployee.id}_${Date.now()}`
            })
          });
        }

        // Update extra templates
        await fetch(`/api/employees/${selectedEmployee.id}/extra-templates`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            extraTemplates: extraTemplatesFormatted,
            requestId: `extra_tmpl_${selectedEmployee.id}_${Date.now()}`
          })
        });

        // Upload photo if new photo selected
        if (formPhotoFile) {
          const photoFormData = new FormData();
          photoFormData.append('file', formPhotoFile);
          await fetch(`/api/employees/${selectedEmployee.id}/photo`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${idToken}` },
            body: photoFormData
          });
        }

        showNotification('แก้ไขข้อมูลพนักงานสำเร็จ');
      }

      await loadData();
      setView('list');
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSubmitting(false);
    }
  };

  // End employment
  const handleConfirmEndEmployment = async () => {
    if (!selectedEmployee || !idToken || !endDateInput) return;
    setSubmitting(true);
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
        const errData = await res.json();
        throw new Error(errData.message || 'ไม่สามารถบันทึกการสิ้นสุดการจ้างได้');
      }

      setShowEndModal(false);
      showNotification('บันทึกการสิ้นสุดการจ้างเรียบร้อย');
      await loadData();
      setView('list');
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  // Save Shop Name
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
        throw new Error(errJson.error?.message || errJson.message || 'ไม่สามารถบันทึกชื่อร้านได้');
      }
      const resJson = await res.json();
      const updatedData = resJson.data || resJson;
      const newName = updatedData.shopName || updatedData.displayName || shopNameInput.trim();
      const newRev = typeof updatedData.revision === 'number' ? updatedData.revision : (shopSettings.revision + 1);

      showNotification('บันทึกชื่อร้านเรียบร้อย');
      setShopSettings(prev => ({ ...prev, shopName: newName, revision: newRev }));
      onUpdateShopName?.(newName);
      setShopNameOpen(false);
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาด');
    }
  };

  // Save Work Days Calendar
  const handleToggleWorkDay = (dayIndex: number) => {
    if (selectedWorkDays.includes(dayIndex)) {
      if (selectedWorkDays.length === 1) {
        alert('ต้องมีวันทำงานอย่างน้อย 1 วัน');
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
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          workDays: selectedWorkDays,
          effectiveDate: new Date().toISOString().split('T')[0],
          requestId: `calendar_${Date.now()}`
        })
      });

      if (!res.ok) throw new Error('ไม่สามารถบันทึกวันทำงานได้');
      showNotification('บันทึกวันทำงานเรียบร้อย');
      setCalendarOpen(false);
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาด');
    }
  };

  const filteredEmployees = employees.filter((emp) =>
    filterActive ? !emp.endDate : !!emp.endDate
  );

  return (
    <div>
      <h1 className={styles.title}>ตั้งค่า</h1>

      {successMessage && (
        <div
          style={{
            backgroundColor: 'var(--team-present-bg)',
            border: '1px solid var(--team-present)',
            color: 'var(--team-present)',
            padding: '0.8rem',
            borderRadius: 'var(--team-radius-small)',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontWeight: 700
          }}
        >
          <CheckCircle2 size={20} />
          {successMessage}
        </div>
      )}

      {error && (
        <div
          style={{
            backgroundColor: 'var(--team-absent-bg)',
            border: '1px solid var(--team-absent)',
            color: 'var(--team-absent)',
            padding: '0.8rem',
            borderRadius: 'var(--team-radius-small)',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {/* VIEW: ADD OR EDIT FORM */}
      {(view === 'add' || view === 'edit') && (
        <div className={styles.formContainer}>
          <h2
            style={{
              fontSize: 'var(--team-name)',
              color: 'var(--team-primary-dark)',
              margin: '0 0 1rem',
              fontWeight: 700
            }}
          >
            {view === 'add' ? 'เพิ่มพนักงานใหม่' : 'แก้ไขข้อมูลพนักงาน'}
          </h2>

          <form onSubmit={handleSubmitForm}>
            {/* Photo Section */}
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
                  src={formPhotoPreview}
                  alt="รูปถ่าย"
                  className={styles.photoPreview}
                />
              ) : (
                <div
                  style={{
                    width: '6rem',
                    height: '7rem',
                    backgroundColor: '#e2e8f0',
                    borderRadius: 'var(--team-radius-small)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0.5rem 0'
                  }}
                >
                  <User size={36} color="var(--team-muted)" />
                </div>
              )}
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => fileInputRef.current?.click()}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              >
                <Camera size={18} />
                เลือกรูปถ่าย
              </button>
            </div>

            {/* Nickname & Position */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>ชื่อเล่น *</label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={formNickname}
                  onChange={(e) => setFormNickname(e.target.value)}
                  placeholder="เช่น บอย, ตาล, เก่ง"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>ตำแหน่ง *</label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={formPosition}
                  onChange={(e) => setFormPosition(e.target.value)}
                  placeholder="เช่น ช่างเทคนิค"
                  required
                />
              </div>
            </div>

            {/* Name */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>ชื่อจริง นามสกุล</label>
              <input
                type="text"
                className={styles.formInput}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="ระบุหรือไม่ก็ได้ เช่น สมศักดิ์ มีชัย"
              />
            </div>

            {/* Start Date */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>วันที่เริ่มงาน *</label>
              <input
                type="date"
                className={styles.formInput}
                value={formStartDate}
                onChange={(e) => setFormStartDate(e.target.value)}
                required
              />
            </div>

            {/* Daily Rate */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>ค่าแรงรายวัน บาท *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className={styles.formInput}
                value={formDailyRate}
                onChange={(e) => setFormDailyRate(e.target.value)}
                required
              />
              {view === 'edit' && (
                <div style={{ marginTop: '0.6rem' }}>
                  <label className={styles.formLabel} style={{ fontSize: 'var(--team-secondary)', color: 'var(--team-muted)' }}>
                    วันที่มีผลบังคับใช้อัตราใหม่นี้
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

            {/* Notes */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>บันทึกเพิ่มเติม</label>
              <textarea
                className={styles.formTextarea}
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="ข้อมูลติดต่อ หรือเงื่อนไขเพิ่มเติม"
              />
            </div>

            {/* Extra Allowance Templates */}
            <div className={styles.formGroup}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                <label className={styles.formLabel} style={{ margin: 0 }}>
                  เงินพิเศษประจำ
                </label>
                <button
                  type="button"
                  onClick={handleAddExtraTemplate}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--team-primary)',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    cursor: 'pointer'
                  }}
                >
                  <Plus size={16} />
                  เพิ่มรายการ
                </button>
              </div>

              {formExtraTemplates.length === 0 ? (
                <div style={{ color: 'var(--team-muted)', fontSize: 'var(--team-secondary)', padding: '0.6rem 0' }}>
                  ไม่มีรายการเงินพิเศษประจำ
                </div>
              ) : (
                formExtraTemplates.map((item, idx) => (
                  <div key={idx} className={styles.extraItemRow}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr auto', gap: '0.5rem', alignItems: 'center' }}>
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
                        type="button"
                        onClick={() => handleRemoveExtraTemplate(idx)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--team-absent)',
                          cursor: 'pointer',
                          padding: '0.4rem'
                        }}
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Action Buttons */}
            <div className={styles.formActions}>
              <button
                type="submit"
                className={styles.primaryBtn}
                disabled={submitting}
              >
                {submitting ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setView('list')}
                disabled={submitting}
              >
                ยกเลิก
              </button>
            </div>

            {/* End Employment Button (Edit view only) */}
            {view === 'edit' && selectedEmployee && !selectedEmployee.endDate && (
              <button
                type="button"
                className={styles.endWorkBtn}
                onClick={() => {
                  setEndDateInput(new Date().toISOString().split('T')[0]);
                  setShowEndModal(true);
                }}
              >
                สิ้นสุดการจ้างพนักงานคนนี้
              </button>
            )}
          </form>
        </div>
      )}

      {/* VIEW: LIST */}
      {view === 'list' && (
        <div>
          <div className={styles.listControlsBar}>
            <button className={styles.addBtn} onClick={handleOpenAdd}>
              เพิ่มพนักงานใหม่
            </button>

            {/* Filter Active / Inactive */}
            <div className={styles.filterRow}>
              <button
                className={`${styles.filterBtn} ${filterActive ? styles.filterBtnActive : ''}`}
                onClick={() => setFilterActive(true)}
              >
                พนักงานปัจจุบัน {employees.filter((e) => !e.endDate).length} คน
              </button>
              <button
                className={`${styles.filterBtn} ${!filterActive ? styles.filterBtnActive : ''}`}
                onClick={() => setFilterActive(false)}
              >
                สิ้นสุดการจ้าง {employees.filter((e) => !!e.endDate).length} คน
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--team-muted)' }}>
              กำลังโหลดข้อมูล...
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div
              style={{
                backgroundColor: 'var(--team-surface)',
                border: '1px solid var(--team-border)',
                borderRadius: 'var(--team-radius-card)',
                padding: '2rem',
                textAlign: 'center',
                color: 'var(--team-muted)',
                marginBottom: '1.5rem'
              }}
            >
              ไม่พบรายชื่อพนักงาน
            </div>
          ) : (
            <div className={styles.employeeGrid}>
              {filteredEmployees.map((emp) => (
                <div key={emp.id} className={styles.personCard}>
                  <div className={styles.personHead}>
                    <div className={styles.avatar}>
                      {emp.photoPath ? (
                        <img
                          src={`/api/employees/${emp.id}/photo?t=${emp.photoVersion || 1}`}
                          alt={emp.nickname || emp.name}
                        />
                      ) : (
                        (emp.nickname || emp.name).charAt(0)
                      )}
                    </div>
                    <div className={styles.personInfo}>
                      <h3 className={styles.personName}>
                        {emp.nickname ? emp.nickname : emp.name}
                      </h3>
                      <div className={styles.personPosition}>
                        {emp.position || 'พนักงาน'}
                        {emp.name && emp.nickname && emp.name !== emp.nickname && ` · ${emp.name}`}
                      </div>
                    </div>
                  </div>

                  <div className={styles.personMeta}>
                    <div>
                      ค่าแรงวันละ:{' '}
                      <strong>
                        {((emp.dailyRateSatang || 0) / 100).toLocaleString('th-TH', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}{' '}
                        บาท
                      </strong>
                    </div>
                    <div>
                      เงินพิเศษประจำ: {emp.extraTemplates?.length || 0} รายการ
                    </div>
                    <div style={{ fontSize: 'var(--team-secondary)', color: 'var(--team-muted)' }}>
                      เริ่มงาน: {emp.startDate}
                      {emp.endDate && ` สิ้นสุดงาน: ${emp.endDate}`}
                    </div>
                  </div>

                  <button
                    className={styles.editBtn}
                    onClick={() => handleOpenEdit(emp)}
                  >
                    แก้ไขข้อมูล
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Collapsible: Work Schedule */}
          <div className={styles.collapsibleSection}>
            <div
              className={styles.sectionHeader}
              onClick={() => setCalendarOpen(!calendarOpen)}
            >
              <span>วันทำงานของร้าน</span>
              {calendarOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
            {calendarOpen && (
              <div className={styles.sectionBody}>
                <div style={{ margin: '0.8rem 0' }}>
                  เลือกวันทำงานปกติของร้านในแต่ละสัปดาห์:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
                  {DAY_NAMES.map((dayName, idx) => {
                    const isSelected = selectedWorkDays.includes(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleToggleWorkDay(idx)}
                        style={{
                          minHeight: '2.8rem',
                          border: `1px solid ${isSelected ? 'var(--team-primary)' : 'var(--team-border)'}`,
                          backgroundColor: isSelected ? 'var(--team-primary)' : '#ffffff',
                          color: isSelected ? '#ffffff' : 'var(--team-text)',
                          borderRadius: 'var(--team-radius-small)',
                          fontWeight: 700,
                          fontSize: 'var(--team-secondary)',
                          cursor: 'pointer'
                        }}
                      >
                        {dayName}
                      </button>
                    );
                  })}
                </div>
                <button
                  className={styles.primaryBtn}
                  onClick={handleSaveWorkDays}
                >
                  บันทึกวันทำงาน
                </button>
              </div>
            )}
          </div>

          {/* Collapsible: Shop Name */}
          <div className={styles.collapsibleSection}>
            <div
              className={styles.sectionHeader}
              onClick={() => setShopNameOpen(!shopNameOpen)}
            >
              <span>ชื่อร้าน</span>
              {shopNameOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
            {shopNameOpen && (
              <div className={styles.sectionBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>ชื่อร้าน</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={shopNameInput}
                    onChange={(e) => setShopNameInput(e.target.value)}
                  />
                </div>
                <button
                  className={styles.primaryBtn}
                  onClick={handleSaveShopName}
                >
                  บันทึกชื่อร้าน
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* End Employment Confirmation Modal */}
      {showEndModal && selectedEmployee && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 100
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 'var(--team-radius-card)',
              padding: '1.5rem',
              maxWidth: '24rem',
              width: '100%',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }}
          >
            <h3
              style={{
                fontSize: 'var(--team-name)',
                color: 'var(--team-absent)',
                margin: '0 0 0.8rem',
                fontWeight: 700
              }}
            >
              ยืนยันการสิ้นสุดการจ้าง
            </h3>
            <p style={{ color: 'var(--team-text)', margin: '0 0 1rem', fontSize: 'var(--team-copy)' }}>
              คุณต้องการบันทึกการสิ้นสุดการจ้างของ <strong>{selectedEmployee.name}</strong> หรือไม่
            </p>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>วันทำงานวันสุดท้าย</label>
              <input
                type="date"
                className={styles.formInput}
                value={endDateInput}
                onChange={(e) => setEndDateInput(e.target.value)}
                required
              />
            </div>
            <div style={{ display: 'grid', gap: '0.6rem' }}>
              <button
                type="button"
                className={styles.endWorkBtn}
                onClick={handleConfirmEndEmployment}
                disabled={submitting}
                style={{ margin: 0 }}
              >
                {submitting ? 'กำลังบันทึก...' : 'ยืนยันการสิ้นสุดการจ้าง'}
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setShowEndModal(false)}
                disabled={submitting}
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
