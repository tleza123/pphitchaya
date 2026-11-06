'use client';
import { X } from 'lucide-react';
import { useModalInteraction } from '@/components/shared/useModalInteraction';
import styles from './truck.module.css';

export function PhotoLightbox({ photoId, onClose }: { photoId: string | null; onClose: () => void }) {
  useModalInteraction(Boolean(photoId), onClose);
  if (!photoId) return null;
  return (
    <div className={styles.lightbox} data-app-dialog role="dialog" aria-modal="true" aria-label="รูปหลักฐาน" tabIndex={-1} onClick={onClose}>
      <button type="button" className={`${styles.iconBtn} ${styles.lightboxClose}`} onClick={onClose} aria-label="ปิดรูปภาพ">
        <X size={20} aria-hidden="true" />
      </button>
      <img src={`/api/truck/photos/${photoId}`} alt="รูปหลักฐานใบงาน" onClick={e => e.stopPropagation()} />
    </div>
  );
}
